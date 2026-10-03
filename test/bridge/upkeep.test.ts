import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { sortLeftovers, tagOf } from "../../client/state/leftovers.ts";
import { Plugin } from "../../server/bridge/plugin.ts";
import { parseBody } from "../../shared/contracts/commands.ts";
import { agentTools } from "./agent-tools.ts";
import { crew } from "./crew.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

/** A gate a test holds: `open` lets through whoever awaits `opened`. */
function gateOf() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("the Human attaches a Paseo project, clears what a dropped task left, and removes the project whole", async () => {
  const rules = "# Rules\n\nBe kind.\n";
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "sw-upkeep-")));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  writeFileSync(join(repo, "AGENTS.md"), rules);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  writeFileSync(join(repo, "b.txt"), "the Human's own, staged\n");
  git(repo, "add", "b.txt");
  const root = stateRoot();
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
  writeFileSync(join(repo, "AGENTS.md"), `${rules}Being edited.\n`);
  const { project, outcome, note: waiting } = await plugin.openProject(repo, "main");
  assert.ok(outcome.ok);
  await plugin.idle();
  assert.deepEqual(await plugin.unattached(), [], "once attached it is no longer offered");
  assert.match(waiting ?? "", /AGENTS\.md has uncommitted changes/, "a file the Human is editing is left as it is");
  assert.equal(git(repo, "show", "main:AGENTS.md"), rules.trim());
  git(repo, "checkout", "--", "AGENTS.md");
  const again = await plugin.openProject(repo, "main");
  assert.match(again.note ?? "", /committed/, "attaching again writes the note that waited");
  const note = git(repo, "show", "main:AGENTS.md");
  assert.ok(note.startsWith(rules.trim()), "the project's own rules stay first");
  assert.match(
    note,
    new RegExp(`<!-- seatworks:begin[^]*\`sw/${project}/\`[^]*lands on \`main\`[^]*<!-- seatworks:end -->`),
  );
  assert.equal(git(repo, "log", "-1", "--format=%an", "main"), "seatworks");
  assert.equal(git(repo, "show", "--name-only", "--format=", "main"), "AGENTS.md", "the note's commit holds it alone");
  assert.equal(
    git(repo, "status", "--porcelain"),
    "A  b.txt",
    "what the Human staged stays staged, and the note is not dirty",
  );

  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const lane = { parent: "root", role: "lead", paths: ["src/"], brief: { goal: { text: "Lane" }, kind: "discovery" } };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  const laneCopy = paseo.created[1]!.cwd;
  mkdirSync(join(laneCopy, "src"));
  writeFileSync(join(laneCopy, "src/done.txt"), "done\n");
  git(laneCopy, "add", ".");
  git(laneCopy, "commit", "-q", "-m", "half a task");
  writeFileSync(join(laneCopy, "src/draft.txt"), "draft\n");
  assert.ok((await supervisor.call("drop_scope", { scope: "1", reason: "not needed after all" })).ok);
  await plugin.idle();

  const branch = `sw/${project}/1`;
  const left = await plugin.leftovers();
  const copy = left.find((l) => l.kind === "copy");
  assert.equal(copy?.label, laneCopy, "the dropped lane's worktree is left, since it holds a draft");
  assert.equal(copy.removable, false, "and it is not offered while it does");
  const kept = left.find((l) => l.kind === "branch");
  assert.equal(kept?.label, branch, "its branch is left too, only the dropped lane's");
  assert.equal(kept.unmerged, 1, "its one commit is on no other branch, so it is one to look at first");
  assert.equal(copy.unmerged, 0);
  assert.deepEqual(
    [tagOf(kept), tagOf(copy)],
    [
      { label: "1 commit not merged", tone: "warning" },
      { label: "uncommitted work", tone: "neutral" },
    ],
    "each line says it in a word or two, where a sentence would be read past",
  );
  assert.ok(
    copy.bytes !== null && copy.bytes >= "done\ndraft\n".length,
    `the copy says what it takes on disk, its two files among it: ${copy.bytes}`,
  );
  assert.deepEqual([kept.bytes, kept.at, copy.at], [null, null, null], "a branch is no folder, and neither has a day");
  const whole = left.find((l) => l.kind === "project");
  assert.equal(whole?.label, repo);
  assert.equal(whole.bytes, null, "an attached project is not measured: it is removed from its row, not weighed here");
  const sorted = sortLeftovers(left, new Set([project]));
  assert.deepEqual(
    [sorted.safe, sorted.check, sorted.kept, sorted.records].map((group) => group.map((l) => l.kind)),
    [[], ["branch"], ["copy"], []],
    "sorted for the Human by what removing costs, the attached project itself not among them",
  );
  assert.deepEqual(
    sortLeftovers(left, new Set()).safe,
    [],
    "a project whole is never among what is picked for the Human, whatever the surface knows of what is attached",
  );

  const refused = await plugin.clean([whole.id]);
  assert.equal(refused[0]?.ok, false);
  assert.match(refused[0].text, new RegExp(laneCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(existsSync(join(root, "projects", project, "ledger.db")), "a refused removal touches nothing");
  assert.deepEqual(
    paseo.archived.filter((h) => h === paseo.created[0]!.host),
    [],
    "the Supervisor still works",
  );

  rmSync(join(laneCopy, "src/draft.txt"));
  const cleared = await plugin.clean([copy.id, kept.id]);
  assert.deepEqual(
    cleared.map((r) => r.ok),
    [true, true],
    cleared.map((r) => r.text).join("; "),
  );
  assert.equal(existsSync(laneCopy), false, "Paseo removed the worktree it had made");
  assert.throws(() => git(repo, "rev-parse", "--verify", branch), "the branch is gone");

  writeFileSync(join(repo, "AGENTS.md"), `${git(repo, "show", "main:AGENTS.md")}\nThe Human's edit in progress.\n`);
  const held = await plugin.clean([whole.id]);
  assert.equal(held[0]?.ok, false, "the Human's uncommitted edit to the file is never written over");
  assert.match(held[0].text, /AGENTS\.md has uncommitted changes/);
  git(repo, "checkout", "--", "AGENTS.md");
  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  for (const a of paseo.created.slice(0, 2)) assert.ok(paseo.archived.includes(a.host), `${a.title} is archived`);
  assert.equal(existsSync(join(root, "projects", project)), false, "the project is detached");
  assert.equal(git(repo, "for-each-ref", `refs/heads/sw/${project}/`), "", "and every branch made for it");
  assert.deepEqual(plugin.projects(), []);
  assert.deepEqual(
    (await plugin.unattached()).map((p) => p.root),
    [repo],
    "it can be attached again",
  );
  assert.equal(git(repo, "show", "main:AGENTS.md"), rules.trim(), "the note is taken out, the rules kept");

  const [record, ...more] = await plugin.leftovers();
  assert.deepEqual(more, [], "only the record is left");
  assert.equal(record?.kind, "record", "the record is kept aside for a look back");
  assert.deepEqual(sortLeftovers([record], new Set()).records, [record], "and sorted apart from what a team left");
  assert.equal(record.label, repo);
  assert.ok(record.bytes !== null && record.bytes > 0, "the record says what it takes on disk");
  assert.ok(
    record.at !== null && Math.abs(Date.now() - Date.parse(record.at)) < 60_000,
    `and when its project was removed: ${record.at}`,
  );
  const shelved = join(root, "archive", record.project, "ledger.db");
  assert.ok(existsSync(shelved), "with its log");
  const deleted = await plugin.clean([record.id]);
  assert.ok(deleted[0]?.ok, deleted[0]?.text);
  assert.equal(existsSync(shelved), false, "deleted only when picked");
  assert.deepEqual(await plugin.leftovers(), []);
  supervisor.close();
});

test("a project removed and attached again gets agents of its own: what Paseo keeps of the first attachment, under the same names, is never taken for them", async () => {
  const repo = repoWith("again");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const first = paseo.created[0]!;
  const whole = (await plugin.leftovers()).find((left) => left.kind === "project")!;
  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  assert.ok(paseo.archived.includes(first.host), "Paseo keeps the first attachment's agent, archived");

  const again = await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.equal(again.project, project, "the same repository is the same project");
  const second = paseo.created[1];
  const stuck = (await plugin.view(project))?.stuck ?? [];
  assert.ok(second, `no agent was made for the second attachment: ${stuck.join("; ")}`);
  const named = (agent: typeof first) => [agent.labels["seatworks.actor"], agent.labels["seatworks.scope"]];
  assert.deepEqual(named(second), named(first), "its log counts from the start again, so its seat has the same names");
  assert.equal(paseo.archived.includes(second.host), false, "and the seat has an agent of its own, at work");
  assert.deepEqual(stuck, []);
});

function repoWith(name: string) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), `sw-${name}-`)));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  return repo;
}

test("a removal that stops part way leaves the project attached with its note, and trying again removes it", async () => {
  const repo = repoWith("halfway");
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const whole = (await plugin.leftovers()).find((l) => l.kind === "project")!;

  paseo.gate.archiveFails = 1;
  const stopped = await plugin.clean([whole.id]);
  assert.equal(stopped[0]?.ok, false);
  assert.match(stopped[0].text, /stays attached/);
  assert.deepEqual(
    plugin.projects().map((p) => p.id),
    [project],
    "still attached, not a folder with no project in it",
  );
  assert.match(git(repo, "show", "main:AGENTS.md"), /seatworks:begin/, "its note is back");

  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  assert.equal((await plugin.leftovers()).filter((l) => l.kind === "record").length, 1, "its record kept aside");
});

test("removing a project whose repository is gone lets it go from memory, and frees the machine it held", async () => {
  const gone = repoWith("gone");
  const other = repoWith("other");
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  const { project } = await plugin.openProject(gone, "main");
  await plugin.idle();
  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const brief = { goal: { text: "Measure" }, kind: "discovery" };
  assert.ok((await supervisor.call("open_scope", { parent: "root", role: "lead", paths: ["src/"], brief })).ok);
  await plugin.idle();
  const lead = await agentTools(socketPath, paseo.created[1]!.env);
  const held = await lead.call("hold_machine", { hold: true, why: "measuring" });
  assert.ok(held.ok, held.text);
  for (const t of [supervisor, lead]) t.close();

  await plugin.openProject(other, "main");
  await plugin.idle();
  assert.equal(paseo.created.length, 2, "the other project's copy waits while the machine is held");

  rmSync(gone, { recursive: true, force: true });
  const whole = (await plugin.leftovers()).find((l) => l.kind === "project" && l.project === project)!;
  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  assert.equal(plugin.statusOf(project, "root"), null, "no longer open in memory");
  await plugin.idle();
  assert.equal(paseo.created.length, 3, "the other project's Supervisor starts once the hold is let go");
});

test(
  "the plugin stopped while a check runs ends the check, and started again it runs the check anew",
  { timeout: 60_000 },
  async () => {
    const c = await crew();
    plugins.push(c.plugin);
    const gate = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "gate");
    execFileSync("mkfifo", [gate]);
    const chief = await c.tools(0);
    const brief = { goal: { text: "Make a" }, kind: "verification" };
    assert.ok((await chief.call("open_scope", { parent: "root", role: "maker", paths: ["src/"], brief })).ok);
    await c.plugin.idle();
    const maker = await c.tools(1);
    // Ten minutes of a check, saying first that it runs: only being stopped ends it within this test.
    const steps = [{ name: "slow", run: ["sh", "-c", `echo started > ${gate}; exec sleep 600`] }];
    assert.ok((await maker.call("run_checks", { scope: "1", commit: git(c.repo, "rev-parse", "main"), steps })).ok);
    assert.equal(await readFile(gate, "utf8"), "started\n", "the check is running");
    await c.plugin.dispose();

    const again = new Plugin(c.root);
    plugins.push(again);
    again.saw(c.paseo.api);
    await again.whenReady();
    assert.equal(await readFile(gate, "utf8"), "started\n", "it runs again: the run that was stopped recorded nothing");
    assert.doesNotMatch(again.statusOf(c.project, "1") ?? "", /Evidence:/);
    for (const t of [chief, maker]) t.close();
  },
);

test(
  "the plugin stopping ends every project's running check before it waits on the first project",
  { timeout: 60_000 },
  async () => {
    const c = await crew();
    plugins.push(c.plugin);
    const { socketPath } = await c.plugin.whenReady();
    const other = realpathSync(mkdtempSync(join(tmpdir(), "sw-second-")));
    git(other, "init", "-q", "-b", "main");
    writeFileSync(join(other, "a.txt"), "a\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "start");
    assert.ok((await c.plugin.openProject(other, "main", "crew")).outcome.ok);
    await c.plugin.idle();
    const chief = await agentTools(socketPath, c.paseo.created[1]!.env);
    const brief = { goal: { text: "Make a" }, kind: "verification" };
    assert.ok((await chief.call("open_scope", { parent: "root", role: "maker", paths: ["src/"], brief })).ok);
    await c.plugin.idle();
    const maker = await agentTools(socketPath, c.paseo.created[2]!.env);

    // The first project is held in unloading: words to its agent are on their way and Paseo does not answer.
    const first = c.paseo.created[0]!.host;
    const agents = (c.paseo.api as unknown as { agents: { ref: (id: string) => { send: () => Promise<void> } } })
      .agents;
    const ref = agents.ref;
    const sending = gateOf();
    const answered = gateOf();
    agents.ref = (id) =>
      id === first
        ? {
            ...ref(id),
            send: async () => {
              sending.open();
              await answered.opened;
            },
          }
        : ref(id);
    const words = parseBody("send_message", { to: "a1", text: "Where does it stand?", asks: true });
    assert.ok(words.ok);
    await c.plugin.human(c.project, words.body);
    await sending.opened;

    // The second runs a check that holds a pipe open for as long as it lives.
    const pipes = mkdtempSync(join(tmpdir(), "sw-gate-"));
    const [gate, held] = [join(pipes, "gate"), join(pipes, "held")];
    execFileSync("mkfifo", [gate, held]);
    const steps = [{ name: "slow", run: ["sh", "-c", `echo started > ${gate}; exec sleep 600 > ${held}`] }];
    assert.ok((await maker.call("run_checks", { scope: "1", commit: git(other, "rev-parse", "main"), steps })).ok);
    assert.equal(await readFile(gate, "utf8"), "started\n");
    const alive = createReadStream(held);
    await once(alive, "open");

    const stopping = c.plugin.dispose();
    alive.resume();
    await once(alive, "end");
    answered.open();
    await stopping;
    for (const t of [chief, maker]) t.close();
  },
);

test("an agent whose seat ended while Paseo was still making it is archived once it is made", async () => {
  const c = await crew();
  plugins.push(c.plugin);
  const chief = await c.tools(0);
  const making = gateOf();
  const reached = gateOf();
  c.paseo.gate.hold = making.opened;
  c.paseo.gate.reached = reached.open;
  const brief = { goal: { text: "Make a" }, kind: "verification" };
  assert.ok((await chief.call("open_scope", { parent: "root", role: "maker", paths: ["src/"], brief })).ok);
  await reached.opened;
  assert.ok((await chief.call("drop_scope", { scope: "1", reason: "not needed after all" })).ok);
  making.open();
  await c.plugin.idle();
  assert.equal(c.paseo.created.length, 2, "Paseo made the agent all the same");
  assert.ok(
    c.paseo.archived.includes(c.paseo.created[1]!.host),
    "and it is archived: no agent goes on working for a seat that ended while it was made",
  );
  chief.close();
});

test("an integration does not wait for a check that still runs on its scope", { timeout: 60_000 }, async () => {
  const c = await crew();
  plugins.push(c.plugin);
  const gate = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "gate");
  execFileSync("mkfifo", [gate]);
  const chief = await c.tools(0);
  const brief = { goal: { text: "Make a" }, kind: "verification" };
  assert.ok((await chief.call("open_scope", { parent: "root", role: "maker", paths: ["src/"], brief })).ok);
  await c.plugin.idle();
  const maker = await c.tools(1);
  const copy = c.paseo.created[1]!.cwd;
  mkdirSync(join(copy, "src"), { recursive: true });
  writeFileSync(join(copy, "src/a.txt"), "a\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "a");
  const head = git(copy, "rev-parse", "HEAD");
  assert.ok((await maker.call("hand_back", { commit: head, text: "a" })).ok);
  const quick = [{ name: "quick", run: ["true"] }];
  assert.ok((await chief.call("run_checks", { scope: "1", commit: head, steps: quick })).ok);
  await c.plugin.idle();

  // Ten minutes of a check on the same scope, saying first that it runs.
  const slow = [{ name: "slow", run: ["sh", "-c", `echo started > ${gate}; exec sleep 600`] }];
  assert.ok((await chief.call("run_checks", { scope: "1", commit: head, steps: slow })).ok);
  assert.equal(await readFile(gate, "utf8"), "started\n", "the slow check is running");
  assert.ok((await chief.call("integrate", { scope: "1", evidence: ["e1"] })).ok);
  const landed = async () => {
    for (const until = Date.now() + 15_000; Date.now() < until;) {
      if (git(c.repo, "rev-parse", "main") === head) return true;
      await new Promise((resolve) => setImmediate(resolve));
    }
    return false;
  };
  assert.ok(await landed(), "the base holds the commit while the check still runs");
  for (const t of [chief, maker]) t.close();
});
