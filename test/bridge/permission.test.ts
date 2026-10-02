import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("a permission answered in the agent's own prompt leaves nothing waiting, and is never answered twice", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-permission-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const host = paseo.created[0]!.host;
  const waiting = async () => (await plugin.view(project))?.human.permissions.map((p) => p.text) ?? [];

  paseo.pending.set(host, new Set(["r1", "r2"]));
  await plugin.permissionAsked(host, "r1", "git push origin main");
  assert.deepEqual(await waiting(), ["git push origin main"]);
  paseo.pending.get(host)?.delete("r1");
  await plugin.permissionResolved(host, "r1", true);
  await plugin.idle();
  assert.deepEqual(await waiting(), [], "answered in its own prompt, it waits on nobody");
  assert.deepEqual(paseo.responded, [], "and Paseo is not answered again");

  await plugin.permissionAsked(host, "r2", "rm -rf build/");
  const asked = (await plugin.view(project))!.human.permissions[0]!.id;
  paseo.pending.get(host)?.delete("r2");
  assert.ok(
    (await plugin.human(project, { type: "answer_permission", permission: asked, allow: true, reason: "ok" })).ok,
  );
  await plugin.idle();
  assert.deepEqual(paseo.responded, [], "an answer that crossed one given in the prompt finds nothing to answer");

  paseo.pending.get(host)?.add("r3");
  await plugin.permissionAsked(host, "r3", "npm publish");
  const open = (await plugin.view(project))!.human.permissions[0]!.id;
  assert.ok(
    (await plugin.human(project, { type: "answer_permission", permission: open, allow: false, reason: "no" })).ok,
  );
  await plugin.idle();
  assert.deepEqual(paseo.responded, ["r3"], "one still waiting in its prompt is answered there");
});
