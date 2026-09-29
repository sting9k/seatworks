import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";

const pluginDir = join(import.meta.dirname, "../..");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("the Human attaches a Paseo project, clears what a dropped task left, and removes the project whole", async () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "sw-upkeep-")));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  paseo.projects.push(repo);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();

  assert.deepEqual(
    (await plugin.unattached()).map((p) => p.root),
    [repo],
    "a Paseo project with no team is offered",
  );
  const { project, outcome } = await plugin.openProject(repo, "main");
  assert.ok(outcome.ok);
  await plugin.idle();
  assert.deepEqual(await plugin.unattached(), [], "once attached it is no longer offered");

  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const lane = { parent: "root", role: "lead", paths: ["src/"], brief: { goal: { text: "Lane" }, kind: "discovery" } };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  const lead = await agentTools(socketPath, paseo.created[1]!.env);
  const task = { parent: "1", role: "peer", paths: ["src/"], brief: { goal: { text: "Task" }, kind: "verification" } };
  assert.ok((await lead.call("open_scope", task)).ok);
  await plugin.idle();
  const peerCopy = paseo.created[2]!.cwd;
  mkdirSync(join(peerCopy, "src"));
  writeFileSync(join(peerCopy, "src/done.txt"), "done\n");
  git(peerCopy, "add", ".");
  git(peerCopy, "commit", "-q", "-m", "half a task");
  writeFileSync(join(peerCopy, "src/draft.txt"), "draft\n");
  assert.ok((await lead.call("drop_scope", { scope: "1.1", reason: "not needed after all" })).ok);
  await plugin.idle();

  const branch = `sw/${project}/1.1`;
  const left = await plugin.leftovers();
  const copy = left.find((l) => l.kind === "copy");
  assert.equal(copy?.label, peerCopy, "the dropped task's copy is left, since it holds a draft");
  assert.equal(copy.removable, false, "and it is not offered while it does");
  const kept = left.find((l) => l.kind === "branch");
  assert.equal(kept?.label, branch, "its branch is left too, only the dropped task's");
  assert.match(kept.why, /not merged into main/);
  const whole = left.find((l) => l.kind === "project");
  assert.equal(whole?.label, repo);

  const refused = await plugin.clean([whole.id]);
  assert.equal(refused[0]?.ok, false);
  assert.match(refused[0].text, new RegExp(peerCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(existsSync(join(root, "projects", project, "ledger.db")), "a refused removal touches nothing");
  assert.deepEqual(
    paseo.archived.filter((h) => h === paseo.created[0]!.host),
    [],
    "the Supervisor still works",
  );

  rmSync(join(peerCopy, "src/draft.txt"));
  const cleared = await plugin.clean([copy.id, kept.id]);
  assert.deepEqual(
    cleared.map((r) => r.ok),
    [true, true],
    cleared.map((r) => r.text).join("; "),
  );
  assert.equal(existsSync(peerCopy), false);
  assert.throws(() => git(repo, "rev-parse", "--verify", branch), "the branch is gone");

  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  for (const a of paseo.created.slice(0, 2)) assert.ok(paseo.archived.includes(a.host), `${a.title} is archived`);
  assert.equal(existsSync(join(root, "projects", project)), false, "its record is gone");
  assert.equal(git(repo, "for-each-ref", `refs/heads/sw/${project}/`), "", "and every branch made for it");
  assert.deepEqual(plugin.projects(), []);
  assert.deepEqual(
    (await plugin.unattached()).map((p) => p.root),
    [repo],
    "it can be attached again",
  );
  for (const t of [supervisor, lead]) t.close();
});
