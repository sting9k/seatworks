import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("one lane end to end: a Supervisor, a Lead and a Peer land a change on main through the plugin", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-lane-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "check.sh"), "test -f src/net/encode.txt\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");

  const plugin = new Plugin(mkdtempSync(join(tmpdir(), "sw-root-")));
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();

  const opened = await plugin.openProject(repo, "main");
  assert.ok(opened.outcome.ok);
  await plugin.idle();
  const supervisorAgent = paseo.created[0]!;
  assert.match(supervisorAgent.systemPrompt, /# Supervisor/);
  assert.match(supervisorAgent.prompt, /Scope root/);

  const supervisor = await agentTools(socketPath, supervisorAgent.env);
  assert.equal(supervisor.welcome.type, "welcome");
  assert.ok((await supervisor.call("set_checks", { checks: [{ name: "encoded", run: ["sh", "check.sh"] }] })).ok);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["src/"],
    brief: { goal: { text: "Encode directions" }, kind: "discovery" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();

  const leadAgent = paseo.created[1]!;
  const lead = await agentTools(socketPath, leadAgent.env);
  const refused = await lead.call("ask_human", { text: "?" });
  assert.equal(refused.ok, false);
  assert.ok(
    (
      await lead.call("open_scope", {
        parent: "1",
        role: "peer",
        paths: ["src/net/"],
        brief: { goal: { text: "Write the encoder" }, kind: "verification" },
      })
    ).ok,
  );
  await plugin.idle();

  const peerAgent = paseo.created[2]!;
  assert.ok(existsSync(join(peerAgent.cwd, ".git")), "the Peer works in a worktree of its own");
  assert.equal(git(peerAgent.cwd, "symbolic-ref", "--short", "HEAD"), `sw/${opened.project}/1.1`);
  execFileSync("mkdir", ["-p", join(peerAgent.cwd, "src/net")]);
  writeFileSync(join(peerAgent.cwd, "src/net/encode.txt"), "int16\n");
  git(peerAgent.cwd, "add", ".");
  git(peerAgent.cwd, "commit", "-q", "-m", "encoder");
  const peer = await agentTools(socketPath, peerAgent.env);
  assert.ok((await peer.call("hand_back", { commit: git(peerAgent.cwd, "rev-parse", "HEAD"), text: "encoded" })).ok);
  await plugin.idle();
  await plugin.idle();

  const told = paseo.sent
    .filter((s) => s.host === leadAgent.host)
    .map((s) => s.text)
    .join("\n");
  assert.match(told, /Scope 1\.1 handed back/);
  const status = await lead.call("status", { scope: "1.1" });
  const evidence = /(e\d+) check on [0-9a-f]+: ok/.exec(status.text)?.[1];
  assert.ok(evidence, status.text);
  assert.ok((await lead.call("integrate", { scope: "1.1", evidence: [evidence] })).ok);
  await plugin.idle();
  assert.ok(paseo.archived.includes(peerAgent.host), "the Peer's agent is archived once its work is in");
  assert.equal(existsSync(peerAgent.cwd), false, "and its copy is gone");

  const laneHead = git(repo, "rev-parse", `sw/${opened.project}/1`);
  assert.ok((await lead.call("hand_back", { commit: laneHead, text: "the lane is done" })).ok);
  await plugin.idle();
  await plugin.idle();
  const rootStatus = await supervisor.call("status", { scope: "1" });
  const landing = /(e\d+) check on [0-9a-f]+: ok/.exec(rootStatus.text)?.[1];
  assert.ok(landing, rootStatus.text);
  assert.ok((await supervisor.call("integrate", { scope: "1", evidence: [landing] })).ok);
  await plugin.idle();

  assert.equal(
    readFileSync(join(repo, "src/net/encode.txt"), "utf8"),
    "int16\n",
    "main has the Peer's change, checked out and clean",
  );
  for (const t of [supervisor, lead, peer]) t.close();
});

test("a project idle past a day leaves memory, and its next command folds it back from the log", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-idle-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(mkdtempSync(join(tmpdir(), "sw-root-")));
  plugins.push(plugin);
  plugin.saw(fakePaseo(pluginDir).api);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.ok((await plugin.human(project, { type: "release", actor: "a1", reason: "done for now" })).ok);
  await plugin.idle();
  const before = plugin.statusOf(project, "root");
  await plugin.tidy(Date.now() + 2 * 24 * 3600 * 1000);
  assert.equal(plugin.statusOf(project, "root"), null, "unloaded");
  assert.ok((await plugin.human(project, { type: "reseat", scope: "root", reason: "back", model: null })).ok);
  assert.match(plugin.statusOf(project, "root") ?? "", /Scope root/);
  assert.notEqual(before, null);
});

test("the Human's words typed into a Lead's chat reach its Supervisor once, though every turn's end repeats the history", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-typed-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(mkdtempSync(join(tmpdir(), "sw-root-")));
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  const supervisorAgent = paseo.created[0]!;
  const supervisor = await agentTools(socketPath, supervisorAgent.env);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  const leadAgent = paseo.created[1]!;
  const first = [
    { type: "user_message" as const, text: leadAgent.prompt, clientMessageId: "7:agent.create:prompt" },
    { type: "assistant_message" as const, text: "Reading the docs." },
    { type: "user_message" as const, text: "Keep the old anchors", clientMessageId: "app-1" },
    { type: "assistant_message" as const, text: "Keeping them." },
  ];
  await plugin.turnEnded(leadAgent.host, { kind: "completed" }, first);
  await plugin.idle();
  await plugin.turnEnded(leadAgent.host, { kind: "completed" }, [
    ...first,
    { type: "user_message" as const, text: "1 of 1 · a note", clientMessageId: "12:deliver" },
    { type: "assistant_message" as const, text: "Noted." },
  ]);
  await plugin.idle();
  const copies = paseo.sent.filter((s) => s.host === supervisorAgent.host && s.text.includes("Keep the old anchors"));
  assert.equal(copies.length, 1);
  supervisor.close();
});

test("a create whose reply was lost is tried again after the record moved on, and the seat keeps the one agent made", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-lost-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(mkdtempSync(join(tmpdir(), "sw-root-")));
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  paseo.gate.loseReplies = 1;
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  assert.ok((await plugin.human(project, { type: "hold_scope", scope: "1", reason: "wait for the release" })).ok);
  await plugin.idle();
  assert.equal(paseo.created.length, 2);
  assert.notEqual(
    await plugin.envFor(paseo.created[1]!.host, "claude"),
    null,
    "the Lead's actor holds the agent Paseo made",
  );
  supervisor.close();
});
