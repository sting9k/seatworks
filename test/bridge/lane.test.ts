import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
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

/** Waits, a turn of the event loop at a time, until the plugin has done what `done` looks for. */
async function until(done: () => Promise<boolean>): Promise<void> {
  while (!(await done())) await new Promise((resolve) => setImmediate(resolve));
}

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
    /You are a1\.\n\nThe project's docs in your copy: `GLOSSARY\.md`, `docs\/adr`\. One that is not there holds nothing yet\.\n\n/,
    "its brief points at the docs",
  );
  assert.match(
    supervisorAgent.prompt,
    /\n\nNothing sent to you arrives while your turn runs\. To wait for a hand-back, a check's result or an answer, end your turn: what you wait for begins your next one\.\n\nScope root/,
    "and say how it waits for anything: by ending its turn",
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
  assert.notEqual(leadAgent.cwd, repo, "the lane has a worktree of its own, made by Paseo when it was opened");
  assert.equal(git(leadAgent.cwd, "symbolic-ref", "--short", "HEAD"), `sw/${opened.project}/1`);
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
  assert.deepEqual(
    [peerAgent.cwd, peerAgent.workspace],
    [leadAgent.cwd, leadAgent.workspace],
    "the Peer works in its lane's worktree, beside its Lead, on the lane's branch",
  );
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
  const owing = async () => (await plugin.view(opened.project))?.human.scopes.find((l) => l.scope === "1")?.owes;
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
  assert.equal((await plugin.view(opened.project))?.landed, 0);
  assert.ok((await lead.call("integrate", { scope: "1.1", evidence: [evidence] })).ok);
  await plugin.idle();
  assert.ok(paseo.archived.includes(peerAgent.host), "the Peer's agent is archived once its work is in");
  assert.ok(existsSync(leadAgent.cwd), "and the lane's worktree stays, for the lane is not done");

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
  const after = await plugin.view(opened.project);
  assert.deepEqual(
    [after?.landed, after?.human.scopes.map((scope) => scope.scope)],
    [2, ["root"]],
    "the view says how many landed from the record, though the state has forgotten them",
  );

  assert.equal(
    readFileSync(join(repo, "src/net/encode.txt"), "utf8"),
    "int16\n",
    "main has the Peer's change, checked out and clean",
  );
  assert.throws(
    () => git(repo, "show", "main:docs/seatworks/MAP.md"),
    "nothing of the record is written on the base while the team runs",
  );
  assert.equal(git(repo, "status", "--porcelain"), "", "and the checkout stays clean");
  assert.equal(existsSync(leadAgent.cwd), false, "the lane's worktree is gone once the lane has landed");
  assert.deepEqual(
    [git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length, git(repo, "branch", "--list", "sw/*")],
    [1, ""],
    "with its branch, whose work the base now holds",
  );
  for (const t of [supervisor, lead, peer]) t.close();

  const whole = (await plugin.leftovers()).find((l) => l.kind === "project");
  assert.ok(whole);
  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  const map = git(repo, "show", "main:docs/seatworks/MAP.md");
  assert.match(
    map,
    /### 1: Encode directions\n\nLanded [0-9a-f]{12} on [\d-]{10}\.\n\nReported by its owner, open to question on evidence:\n\ndecided:\n- Directions are int16\n\nassumed:\n- No client sends more than 8 directions\n\nFindings raised in it:\n- f\d+ by a\d+: int16 overflows past 8 directions → not worth stopping for: no client sends more/,
    "the map left at removal lists the lane landed: its owner's report, and every finding raised in it as it was weighed",
  );
});

test("two Peers of one lane work in its one worktree on its one branch: each is taken in as the lane stands, its change read under its own paths, and the lane lands with both", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-team-"));
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
  const scope = (parent: string, role: string, path: string, goal: string) => ({
    parent,
    role,
    paths: [path],
    brief: { goal: { text: goal }, kind: "verification" },
  });
  assert.ok((await supervisor.call("set_checks", { checks: [{ name: "there", run: ["test", "-f", "a.txt"] }] })).ok);
  /** The check the plugin ran on a scope's hand-back, by the id an integration names it with. */
  const proof = async (tools: typeof supervisor, on: string) => {
    const said = (await tools.call("status", { scope: on })).text;
    const id = /(e\d+) check on [0-9a-f]+: ok/.exec(said)?.[1];
    assert.ok(id, said);
    return id;
  };
  assert.ok((await supervisor.call("open_scope", scope("root", "lead", "src/", "Ticket"))).ok);
  await plugin.idle();
  const laneCopy = paseo.created[1]!.cwd;
  const lead = await agentTools(socketPath, paseo.created[1]!.env);
  assert.ok((await lead.call("open_scope", scope("1", "peer", "src/a/", "Part a"))).ok);
  assert.ok((await lead.call("open_scope", scope("1", "peer", "src/b/", "Part b"))).ok);
  await plugin.idle();
  const seated = (on: string) => paseo.created.find((agent) => agent.labels["seatworks.scope"] === on)!;
  const [one, two] = [seated("1.1"), seated("1.2")];
  assert.deepEqual([one.cwd, two.cwd], [laneCopy, laneCopy], "both work where their Lead does");
  assert.equal(
    git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length,
    2,
    "the repository and the lane's one worktree, however many it seats",
  );

  const commitIn = (dir: string, text: string) => {
    mkdirSync(join(laneCopy, dir), { recursive: true });
    writeFileSync(join(laneCopy, dir, "part.txt"), text);
    git(laneCopy, "add", dir);
    git(laneCopy, "commit", "-q", "-m", dir);
    return git(laneCopy, "rev-parse", "HEAD");
  };
  const whose = (agent: typeof one) => readFileSync(agent.env.SEATWORKS_HELD!, "utf8");
  assert.equal(
    whose(one),
    "src/a/\t\nsrc/b/\t1.2\nsrc/\t1\n",
    "each is told whose every path of the lane is, its own first: its neighbour's, and what its Lead kept",
  );
  assert.equal(
    whose(paseo.created[1]!),
    "src/a/\t1.1\nsrc/b/\t1.2\nsrc/\t\n",
    "and the Lead, which writes too, that what it handed out is no longer its own",
  );
  assert.deepEqual(
    [paseo.created[0]!.env.SEATWORKS_HELD, paseo.created[1]!.env.SEATWORKS_MERGES, one.env.SEATWORKS_MERGES],
    [undefined, "1", undefined],
    "the root shares no worktree, and only the lane's owner takes a branch in by hand",
  );
  const [a, b] = [await agentTools(socketPath, one.env), await agentTools(socketPath, two.env)];
  // The first hands back while the lane's branch is at its commit; its neighbour commits over it only after.
  const first = commitIn("src/a", "a's part\n");
  assert.ok((await a.call("hand_back", { commit: first, text: "part a" })).ok);
  await plugin.idle();
  await plugin.idle();
  const head = commitIn("src/b", "b's part\n");
  const changed = (await a.call("diff", {})).text;
  assert.match(changed, /\+a's part/);
  assert.doesNotMatch(changed, /b's part/, "what its neighbour committed on the same branch is not its change");
  assert.ok((await b.call("hand_back", { commit: head, text: "part b" })).ok);
  await plugin.idle();
  await plugin.idle();
  // The first's commit is one the lane's branch has since moved past: it is in, as the lane stands.
  for (const task of ["1.1", "1.2"]) {
    const taken = await lead.call("integrate", { scope: task, evidence: [await proof(lead, task)] });
    assert.ok(taken.ok, `${task}: ${taken.text}`);
    await plugin.idle();
    if (task === "1.1") assert.equal(whose(two), "src/b/\t\nsrc/\t1\n", "a neighbour taken in holds nothing any more");
  }
  assert.equal(git(repo, "rev-parse", `sw/${project}/1`), head, "taking them in moved nothing: no merge was made");
  assert.ok(existsSync(laneCopy), "and the worktree is the lane's, not theirs to take away");

  assert.ok((await lead.call("hand_back", { commit: head, text: "the ticket" })).ok);
  await plugin.idle();
  await plugin.idle();
  const landed = await supervisor.call("integrate", { scope: "1", evidence: [await proof(supervisor, "1")] });
  assert.ok(landed.ok, landed.text);
  await plugin.idle();
  assert.deepEqual(
    [readFileSync(join(repo, "src/a/part.txt"), "utf8"), readFileSync(join(repo, "src/b/part.txt"), "utf8")],
    ["a's part\n", "b's part\n"],
    "the base holds both parts",
  );
  assert.equal(existsSync(laneCopy), false, "and the lane's worktree went with its landing");
  for (const tools of [supervisor, lead, a, b]) tools.close();
});

test("a change too small to hand out is made by the lane's owner itself: it commits in the lane's worktree with nobody seated under it, and the lane lands", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-small-"));
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
  assert.ok((await supervisor.call("set_checks", { checks: [{ name: "there", run: ["test", "-f", "a.txt"] }] })).ok);
  const lane = {
    parent: "root",
    role: "lead",
    paths: ["src/"],
    brief: { goal: { text: "A typo" }, kind: "verification" },
  };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  const leadAgent = paseo.created[1]!;
  const lead = await agentTools(socketPath, leadAgent.env);
  // Its git as its own process runs it: the guard first on its PATH, told what its seat may do.
  const itsGit = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: leadAgent.cwd,
      env: { ...process.env, ...leadAgent.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  mkdirSync(join(leadAgent.cwd, "src"));
  writeFileSync(join(leadAgent.cwd, "src", "small.txt"), "small\n");
  itsGit("add", "src/small.txt");
  itsGit("commit", "-q", "-m", "A small change");
  const head = itsGit("rev-parse", "HEAD");

  assert.ok((await lead.call("hand_back", { commit: head, text: "the typo" })).ok);
  await plugin.idle();
  await plugin.idle();
  const proof = /(e\d+) check on [0-9a-f]+: ok/.exec((await supervisor.call("status", { scope: "1" })).text)?.[1];
  assert.ok(proof);
  const landed = await supervisor.call("integrate", { scope: "1", evidence: [proof] });
  assert.ok(landed.ok, landed.text);
  await plugin.idle();
  assert.equal(readFileSync(join(repo, "src/small.txt"), "utf8"), "small\n", "the base holds its change");
  assert.equal(existsSync(leadAgent.cwd), false, "and the lane's worktree went with its landing");
  assert.equal(paseo.created.length, 2, "nobody was seated for it");
  for (const tools of [supervisor, lead]) tools.close();
});

test("two lanes that meet in one file: the second's hand-back conflicts, nothing is merged, the root's owner is asked with what the base took in and the lane's owner told it waits; the lane takes the base in by hand and lands", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-meet-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "shared.txt"), "start\n");
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
  assert.ok(
    (await supervisor.call("set_checks", { checks: [{ name: "there", run: ["test", "-f", "shared.txt"] }] })).ok,
  );
  // Each lane names paths of its own, and both come to change a file neither named: what the base then cannot merge.
  const lane = (goal: string, path: string) => ({
    parent: "root",
    role: "lead",
    paths: [path],
    brief: { goal: { text: goal }, kind: "discovery" },
  });
  for (const [goal, path] of [
    ["One", "src/one/"],
    ["Two", "src/two/"],
  ] as const) {
    const opened = await supervisor.call("open_scope", lane(goal, path));
    assert.ok(opened.ok, opened.text);
  }
  await plugin.idle();
  const seated = (on: string) => paseo.created.find((agent) => agent.labels["seatworks.scope"] === on)!;
  const [one, two] = [seated("1"), seated("2")];
  assert.notEqual(one.cwd, two.cwd, "work the root judged could run side by side is two lanes, a worktree each");
  const told = (host: string) => paseo.sent.filter((sent) => sent.host === host).map((sent) => sent.text);
  const proof = async (on: string) => {
    const said = (await supervisor.call("status", { scope: on })).text;
    const id = /(e\d+) check on [0-9a-f]+: ok/.exec(said)?.[1];
    assert.ok(id, said);
    return id;
  };
  const write = (dir: string, text: string, message: string) => {
    writeFileSync(join(dir, "shared.txt"), text);
    git(dir, "commit", "-q", "-am", message);
    return git(dir, "rev-parse", "HEAD");
  };

  const [first, second] = [await agentTools(socketPath, one.env), await agentTools(socketPath, two.env)];
  assert.ok((await first.call("hand_back", { commit: write(one.cwd, "one's\n", "One's way"), text: "one" })).ok);
  await plugin.idle();
  await plugin.idle();
  assert.ok((await supervisor.call("integrate", { scope: "1", evidence: [await proof("1")] })).ok);
  await plugin.idle();
  const landed = git(repo, "rev-parse", "main");

  const clash = write(two.cwd, "two's\n", "Two's way");
  assert.ok((await second.call("hand_back", { commit: clash, text: "two" })).ok);
  await plugin.idle();
  await plugin.idle();
  assert.equal(git(repo, "rev-parse", "main"), landed, "nothing is merged for them");
  assert.match(
    told(supervisorAgent.host).at(-1) ?? "",
    new RegExp(
      `^Scope 2's ${clash} conflicts with main in: shared\\.txt\\. Nothing was merged, and scope 2 waits on what you decide\\.\\nSince scope 2 began, main took in, in those files:\\n- ${landed.slice(0, 7)} One's way$`,
    ),
    "whoever stands over both lanes is asked, with what the base took in",
  );
  assert.equal(told(two.host).length, 0, "the lane's owner is not woken to wait: it has nothing to do yet");
  assert.match((await supervisor.call("integrate", { scope: "2", evidence: ["e1"] })).text, /^Refused/);

  // The decision made and said, the lane's owner reads with it that its hand-back had conflicted, and on whom it waited.
  const decided = { to: two.labels["seatworks.actor"], text: "Take main in and keep both ways.", asks: true };
  assert.ok((await supervisor.call("send_message", decided)).ok);
  await plugin.idle();
  assert.match(
    told(two.host).join("\n"),
    /Your hand-back [0-9a-f]+ conflicts with main in: shared\.txt\. Nothing was merged\. What is done next is a1's to decide\./,
  );
  // The lane takes the base in by hand, in its own worktree, and hands back what it settled.
  assert.throws(() => git(two.cwd, "merge", "-q", "main"));
  const settled = write(two.cwd, "one's and two's\n", "Take main in");
  assert.ok((await second.call("hand_back", { commit: settled, text: "two, with main in it" })).ok);
  await plugin.idle();
  await plugin.idle();
  assert.ok((await supervisor.call("integrate", { scope: "2", evidence: [await proof("2")] })).ok);
  await plugin.idle();
  assert.equal(readFileSync(join(repo, "shared.txt"), "utf8"), "one's and two's\n");
  for (const tools of [supervisor, first, second]) tools.close();
});

test("a lane whose branch is there already, from a start that was cut short, is given its worktree on that branch", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-again-"));
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
  git(repo, "branch", `sw/${project}/1`, "main");

  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const lane = { parent: "root", role: "lead", paths: ["src/"], brief: { goal: { text: "Lane" }, kind: "discovery" } };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  assert.equal(git(paseo.created[1]!.cwd, "symbolic-ref", "--short", "HEAD"), `sw/${project}/1`);
  assert.equal(git(repo, "branch", "--list", "sw/*").split("\n").length, 1, "no second branch is made beside it");
  supervisor.close();
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
    { type: "user_message" as const, text: leadAgent.prompt, clientMessageId: leadAgent.promptId },
    { type: "assistant_message" as const, text: "Reading the docs." },
    { type: "user_message" as const, text: "Keep the old anchors", clientMessageId: "app-1" },
    { type: "assistant_message" as const, text: "Keeping them." },
  ];
  await plugin.turnEnded(leadAgent.host, { kind: "completed" }, first);
  await plugin.idle();
  const second = [
    ...first,
    { type: "user_message" as const, text: "1 of 1 · a note", clientMessageId: "12:deliver" },
    { type: "assistant_message" as const, text: "Noted." },
  ];
  await plugin.turnEnded(leadAgent.host, { kind: "completed" }, second);
  await plugin.idle();
  const copies = paseo.sent.filter((s) => s.host === supervisorAgent.host && s.text.includes("Keep the old anchors"));
  assert.equal(copies.length, 1);
  assert.equal(
    paseo.sent.filter((s) => s.host === supervisorAgent.host && s.text.includes("You are seated on this scope")).length,
    0,
    "the plugin's own first words to the Lead are nobody's typing: its Supervisor is sent no copy of them",
  );

  // Two turns that end one on the other's heels: the second hook arrives while the first is still being taken.
  const typed = { type: "user_message" as const, text: "And the new index", clientMessageId: "app-2" };
  const third = [...second, typed, { type: "assistant_message" as const, text: "Adding it." }];
  const fourth = [...third, { type: "assistant_message" as const, text: "Stopped." }];
  await Promise.all([
    plugin.turnEnded(leadAgent.host, { kind: "completed" }, third),
    plugin.turnEnded(leadAgent.host, { kind: "cancelled" }, fourth),
  ]);
  await plugin.idle();
  const again = paseo.sent.filter((s) => s.host === supervisorAgent.host && s.text.includes("And the new index"));
  assert.equal(again.length, 1, "each hook reads what the one before it left, so the words are recorded once");
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
  const first = [{ type: "user_message" as const, text: leadAgent.prompt, clientMessageId: leadAgent.promptId }];
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
  // The clock is the test's from here: the create that throws waits out a pause, which only the test ends.
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    paseo.gate.loseReplies = 1;
    const lane = await supervisor.call("open_scope", {
      parent: "root",
      role: "lead",
      paths: ["docs/"],
      brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
    });
    assert.ok(lane.ok, lane.text);
    await until(async () =>
      (await plugin.view(project))!.stuck.some((l) => /agent\.create\) has thrown 1 time/.test(l)),
    );
    assert.ok((await plugin.human(project, { type: "hold_scope", scope: "1", reason: "wait for the release" })).ok);
    mock.timers.tick(1000);
    await until(async () => (await plugin.envFor(paseo.created[1]!.host, "claude")) !== null);
    assert.equal(paseo.created.length, 2, "the Lead's actor holds the agent Paseo made, and no second one was");
  } finally {
    mock.timers.reset();
  }
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
  const activity = (await plugin.view(project))!.activity.map((line) => line.text).join("\n");
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

test("a publish asked for after the plugin's own commit moved the base is made: the note at attaching is no move of anyone's", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-publish-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const remote = mkdtempSync(join(tmpdir(), "sw-remote-"));
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.match(git(repo, "log", "-1", "--format=%an: %s", "main"), /^seatworks: Tell every agent here/);

  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  assert.ok((await supervisor.call("publish", { remote: "origin" })).ok);
  await plugin.idle();
  const tip = git(repo, "rev-parse", "main");
  assert.equal(git(remote, "rev-parse", "main"), tip, "the first publish lands, note and all");
  assert.equal(
    paseo.sent.filter((s) => s.host === paseo.created[0]!.host).at(-1)?.text,
    `Published main to origin at ${tip}: ${git(repo, "rev-parse", "main~1")} with the ledger's own commits over it.`,
    "whoever asked reads that the head pushed is the one it asked at with the ledger's commits over it",
  );
  supervisor.close();
});
