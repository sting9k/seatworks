import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  assert.equal(record.label, repo);
  const shelved = join(root, "archive", record.project, "ledger.db");
  assert.ok(existsSync(shelved), "with its log");
  const deleted = await plugin.clean([record.id]);
  assert.ok(deleted[0]?.ok, deleted[0]?.text);
  assert.equal(existsSync(shelved), false, "deleted only when picked");
  assert.deepEqual(await plugin.leftovers(), []);
  for (const t of [supervisor, lead]) t.close();
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
