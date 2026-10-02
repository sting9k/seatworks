import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("the Human's own rules follow their role's prompt, read when each agent is made", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-rules-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const root = stateRoot();
  mkdirSync(join(root, "rules", "slp"), { recursive: true });
  writeFileSync(join(root, "rules", "slp", "all.md"), "Write commit subjects in the imperative.\n");
  writeFileSync(join(root, "rules", "slp", "lead.md"), "Split no scope smaller than a day.\n");
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();

  const supervisorAgent = paseo.created[0]!;
  assert.match(supervisorAgent.systemPrompt, /# Supervisor[\s\S]*Write commit subjects in the imperative\./);
  assert.doesNotMatch(supervisorAgent.systemPrompt, /Split no scope/);

  writeFileSync(join(root, "rules", "slp", "lead.md"), "Split no scope smaller than half a day.\n");
  const supervisor = await agentTools(socketPath, supervisorAgent.env);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  const leadPrompt = paseo.created[1]!.systemPrompt;
  assert.match(leadPrompt, /# Lead[\s\S]*imperative\.[\s\S]*Split no scope smaller than half a day\./);
  supervisor.close();
});
