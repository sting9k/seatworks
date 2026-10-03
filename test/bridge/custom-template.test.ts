import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { pairFiles } from "../pair.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";

// A row of spec/CONFORMANCE.md, The profile is data: a template that shares no role with SLP, run through the plugin.

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

/** The agent profiles the stand-in for Paseo has, in place of those the template names. */
const RUNS_ON = { "pair-navigator": "slp-supervisor", "pair-driver": "slp-peer", "pair-checker": "slp-reviewer" };

test("a template with no role of SLP runs a task end to end: its root seats a writer, takes the work in and lands it, and the Human is shown its own names", async () => {
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  for (const [path, text] of pairFiles()) {
    const file = join(root, "profiles", "pair", path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      Object.entries(RUNS_ON).reduce((said, [named, has]) => said.replaceAll(named, has), text),
    );
  }
  const repo = mkdtempSync(join(tmpdir(), "sw-pair-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "check.sh"), "test -f src/encode.txt\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");

  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();

  const opened = await plugin.openProject(repo, "main", "pair");
  assert.ok(opened.outcome.ok);
  await plugin.idle();
  const navigatorAgent = paseo.created[0]!;
  assert.match(navigatorAgent.systemPrompt, /^# Navigator[\s\S]*## The team's flow/);
  assert.deepEqual((await plugin.view(opened.project))?.human.root, { role: "navigator", owner: "a1" });
  assert.match(git(repo, "show", "main:AGENTS.md"), /write to its navigator/);

  const navigator = await agentTools(socketPath, navigatorAgent.env);
  assert.ok((await navigator.call("set_checks", { checks: [{ name: "encoded", run: ["sh", "check.sh"] }] })).ok);
  const plan = { goal: { text: "Directions travel encoded" }, appetite: { line: { text: "A day" } } };
  assert.ok((await navigator.call("set_plan", { scope: "root", plan })).ok);
  const task = await navigator.call("open_scope", {
    parent: "root",
    role: "driver",
    paths: ["src/"],
    brief: { goal: { text: "Write the encoder" }, kind: "verification" },
  });
  assert.ok(task.ok, task.text);
  await plugin.idle();

  const driverAgent = paseo.created[1]!;
  assert.match(driverAgent.systemPrompt, /^# Driver\n/);
  assert.deepEqual(readdirSync(join(driverAgent.env.CLAUDE_CONFIG_DIR!, "skills")), ["proof-first"], "its one skill");
  mkdirSync(join(driverAgent.cwd, "src"), { recursive: true });
  writeFileSync(join(driverAgent.cwd, "src/encode.txt"), "int16\n");
  git(driverAgent.cwd, "add", ".");
  git(driverAgent.cwd, "commit", "-q", "-m", "encoder");
  const driver = await agentTools(socketPath, driverAgent.env);
  const refused = await driver.call("open_scope", { parent: "1", role: "checker", brief: { goal: { text: "x" } } });
  assert.match(refused.text, /^You are not given open_scope\./);
  assert.ok(
    (await driver.call("hand_back", { commit: git(driverAgent.cwd, "rev-parse", "HEAD"), text: "encoded" })).ok,
  );
  await plugin.idle();
  await plugin.idle();

  const status = await navigator.call("status", { scope: "1" });
  const evidence = /(e\d+) check on [0-9a-f]+: ok/.exec(status.text)?.[1];
  assert.ok(evidence, status.text);
  assert.ok((await navigator.call("integrate", { scope: "1", evidence: [evidence] })).ok);
  await plugin.idle();

  assert.equal(readFileSync(join(repo, "src/encode.txt"), "utf8"), "int16\n", "main has the driver's change");
  for (const t of [navigator, driver]) t.close();
});
