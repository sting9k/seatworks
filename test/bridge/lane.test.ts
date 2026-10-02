import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

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

  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();

  const opened = await plugin.openProject(repo, "main");
  assert.ok(opened.outcome.ok);
  await plugin.idle();
  const supervisorAgent = paseo.created[0]!;
  assert.equal(
    supervisorAgent.teamEnv?.ELECTRON_RUN_AS_NODE,
    "1",
    "the tool server is spawned through the worker's executable, an Electron binary under the desktop app",
  );
  assert.match(supervisorAgent.systemPrompt, /# Supervisor/);
  assert.match(supervisorAgent.prompt, /Scope root/);
  assert.match(
    supervisorAgent.prompt,
    /The project's docs in your copy: `GLOSSARY\.md`, `docs\/adr`, `docs\/seatworks\/MAP\.md`\./,
    "its brief points at the docs",
  );

  const supervisor = await agentTools(socketPath, supervisorAgent.env);
  assert.equal(supervisor.welcome.type, "welcome");
  assert.ok((await supervisor.call("set_checks", { checks: [{ name: "encoded", run: ["sh", "check.sh"] }] })).ok);
  const plan = { goal: { text: "Directions travel encoded" }, appetite: { line: { text: "A day" } } };
  assert.ok((await supervisor.call("set_plan", { scope: "root", plan })).ok);
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
  const unheard = await lead.call("send_message", { to: "human", text: "?" });
  assert.match(
    unheard.text,
    /^Refused \(I10\): .+\nWhat the record shows:\n- You are a2, a lead seated on scope 1, under a1\.\n- Your role speaks to: your parent's owner \(a1\); your children \(none seated\)\.$/,
  );
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
  const raised = await peer.call("raise_finding", {
    text: "int16 overflows past 8 directions",
    default: "keep int16 and cap at 8",
  });
  assert.ok(raised.ok, raised.text);
  const finding = (await plugin.view(opened.project))?.human.disagreements[0]?.id;
  assert.ok(finding, "the finding is open on the record");
  const owing = async () => (await plugin.view(opened.project))?.human.lanes.find((l) => l.scope === "1")?.owes;
  assert.equal(await owing(), 1, "the Human sees what the lane's Lead owes");
  assert.ok((await lead.call("classify_finding", { finding, verdict: "minor", reason: "no client sends more" })).ok);
  assert.equal(await owing(), 0, "and that it is paid");
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
  const reported = { decided: ["Directions are int16"], assumed: ["No client sends more than 8 directions"] };
  assert.ok((await lead.call("report", reported)).ok);
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
  const map = git(repo, "show", "main:docs/seatworks/MAP.md");
  assert.match(
    map,
    /### 1: Encode directions\n\nLanded [0-9a-f]{12} on [\d-]{10}\.\n\nReported by its owner, open to question on evidence:\n\ndecided:\n- Directions are int16\n\nassumed:\n- No client sends more than 8 directions\n\nFindings raised in it:\n- f\d+ by a\d+: int16 overflows past 8 directions → not worth stopping for: no client sends more/,
    "the map lists the lane landed: its owner's report, and every finding raised in it as it was weighed",
  );
  assert.equal(git(repo, "status", "--porcelain"), "", "and the checkout stays clean");
  for (const t of [supervisor, lead, peer]) t.close();
});

test("a project idle past a day leaves memory, and its next command folds it back from the log", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-idle-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
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
  const plugin = new Plugin(stateRoot());
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

test("a turn the plugin's words began that fails in Paseo gets them again; one the Human's words began does not", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-failed-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  const leadAgent = paseo.created[1]!;
  const failed = { kind: "failed", error: { message: "529 overloaded" } };
  const first = [{ type: "user_message" as const, text: leadAgent.prompt, clientMessageId: "7:agent:prompt" }];
  await plugin.turnEnded(leadAgent.host, failed, first);
  await plugin.idle();
  const again = paseo.sent.filter((s) => s.host === leadAgent.host);
  assert.equal(again.length, 1);
  assert.ok(again[0]!.text.includes("529 overloaded") && again[0]!.text.includes(leadAgent.prompt));

  await plugin.turnEnded(leadAgent.host, { kind: "completed" }, [
    ...first,
    { type: "user_message" as const, text: again[0]!.text, clientMessageId: again[0]!.messageId },
  ]);
  await plugin.turnEnded(leadAgent.host, failed, [
    ...first,
    { type: "user_message" as const, text: again[0]!.text, clientMessageId: again[0]!.messageId },
    { type: "user_message" as const, text: "Rename the anchors", clientMessageId: "app-1" },
  ]);
  await plugin.idle();
  assert.equal(paseo.sent.filter((s) => s.host === leadAgent.host).length, 1);
  supervisor.close();
});

test("a create whose reply was lost is tried again after the record moved on, and the seat keeps the one agent made", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-lost-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
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

test("a create Paseo refuses is a failed start the record shows, not a seat left waiting for an agent", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-refused-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  paseo.gate.refuse = 'Expected config.provider in "provider/model" format';
  plugin.saw(paseo.api);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.equal(paseo.created.length, 0);
  const activity = (await plugin.view(project))!.activity.join("\n");
  assert.match(activity, /is gone: Paseo could not make the agent: Expected config\.provider/);
});

test("a start that failed is tried again, and a project whose log cannot be read leaves the others working", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-start-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const root = stateRoot();
  const first = new Plugin(root);
  plugins.push(first);
  const paseo = fakePaseo(pluginDir);
  first.saw(paseo.api);
  const { project } = await first.openProject(repo, "main");
  await first.idle();
  await first.dispose();
  const broken = join(root, "projects", "broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "project.json"), JSON.stringify({ repo }));
  writeFileSync(join(broken, "ledger.db"), "not a database");

  paseo.gate.configFails = 1;
  const restarted = new Plugin(root);
  plugins.push(restarted);
  restarted.saw(paseo.api);
  await assert.rejects(restarted.whenReady(), /socket reconnecting/);
  await restarted.whenReady();
  assert.match((await restarted.view(project))?.root ?? "", /Scope root/);
});

test("two projects on one daemon each get their own first agent", async () => {
  const repos = ["one", "two"].map((name) => {
    const repo = mkdtempSync(join(tmpdir(), `sw-${name}-`));
    git(repo, "init", "-q", "-b", "main");
    writeFileSync(join(repo, "a.txt"), "a\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "start");
    return repo;
  });
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  for (const repo of repos) await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.equal(paseo.created.length, 2, "a Supervisor for each");
});
