import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mock, test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { WatchView, WatchSeat } from "../../shared/views.ts";
import { HOME, type Pending, harness, ideCalls, laneWithPeer, repo } from "./harness.ts";
import { sentBy } from "../../server/core/paseo-adapter.ts";

const { placeProjectFiles } = await import("../../server/catalog/project-files.ts");
const { saveLedger } = await import("../../server/desk/ledger.ts");
const { KEEP_CLOSED_LANES } = await import("../../server/desk/archive.ts");
const { loadConfig, projectOf } = await import("../../server/desk/project.ts");
const { upgradeState } = await import("../../server/upkeep/state.ts");
const { STATE_VERSION } = await import("../../server/core/state.ts");
const { firstOverlap, serialHits, serialPaths, SERIAL_ONLY } = await import("../../server/core/scope.ts");
const { settle } = await import("./fake-timeline.ts");
const { readAssessments } = await import("../../server/runtime/watch/jev/assessments.ts");

test("write sets overlap by path prefix and glob, and serial-only paths are caught", () => {
  assert.equal(firstOverlap(["src/pages/"], ["src/api/"]), undefined);
  assert.ok(firstOverlap(["src/"], ["src/api/users.ts"]));
  assert.ok(firstOverlap(["src/**/*.ts"], ["src/api/users.ts"]));
  assert.ok(firstOverlap(["**/*.ts"], ["lib/x.ts"]));
  assert.equal(firstOverlap(["**/*.ts"], ["src/app.py"]), undefined, "a glob at the front does not mean it overlaps everything");
  // Lanes share a copy on this answer, so wildcards on both sides are decided, not sampled.
  assert.ok(firstOverlap(["src/**/*.ts"], ["**/*.test.ts"]), "src/pricing.test.ts matches both");
  assert.ok(firstOverlap(["src/**"], ["**/*.ts"]), "src/a.ts matches both");
  assert.ok(firstOverlap(["src/**/*.ts"], ["**/api/*.ts"]), "src/api/x.ts matches both");
  assert.ok(firstOverlap(["server/**"], ["**/ledger.ts"]), "server/ledger.ts matches both");
  assert.equal(firstOverlap(["src/**/*.ts"], ["docs/**/*.md"]), undefined, "and nothing satisfies these");
  // Inside one segment the same trap waits: a witness made up from either pattern matches neither.
  assert.ok(firstOverlap(["src/*.ts"], ["src/app.*"]), "src/app.ts satisfies both");
  assert.ok(firstOverlap(["app/a*.tsx"], ["app/*b.tsx"]), "app/ab.tsx satisfies both");
  assert.ok(firstOverlap(["src/?.ts"], ["src/a.*"]), "src/a.ts satisfies both");
  assert.equal(firstOverlap(["src/*.ts"], ["src/*.py"]), undefined, "and one extension cannot be the other");
  assert.ok(firstOverlap(["**/*.{js,ts}"], ["src/a.js"]), "a choice of extensions overlaps the file it names");
  assert.equal(firstOverlap(["src/*.{js,ts}"], ["src/*.py"]), undefined);
  // Rules and write sets are both globs, so rules resolve against tracked files, or every subtree lane would wait.
  const tracked = ["package-lock.json", "db/migrations/0001.sql", "src/app.ts", "Assets/Scenes/Main.unity"];
  const serial = serialPaths(tracked, SERIAL_ONLY);
  assert.deepEqual(serial, ["Assets/Scenes/Main.unity", "db/migrations/", "package-lock.json"], "the migration's directory is reserved, so the next one counts before it is written");
  assert.deepEqual(serialHits(["app/**"], serial), [], "a tree with none of them in it is not held back for them");
  assert.deepEqual(serialHits(["src/**", "package-lock.json"], serial), ["package-lock.json"]);
  assert.deepEqual(serialHits(["db/**"], serial), ["db/**"], "and a tree that does hold one is");
  // `**/migrations/**` stands for whole segments, not any segment merely ending in the name.
  assert.deepEqual(serialPaths(["server/db_migrations/0001.sql"], SERIAL_ONLY), []);
  assert.deepEqual(serialPaths(["db/migrations/0001.sql"], SERIAL_ONLY), ["db/migrations/"]);
  assert.deepEqual(serialHits(["db/migrations/0002.sql"], serial), ["db/migrations/0002.sql"], "including a migration nobody has written yet");
  assert.deepEqual(serialHits(["Assets/Scenes/Main.unity"], serial), ["Assets/Scenes/Main.unity"]);
});

test("a lane works serially in the project's own copy and hands it back on its base branch", async () => {
  const h = harness("outbox-serial.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "test ! -f BROKEN" });
  const noLimits = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"] });
  assert.equal(noLimits.ok, false);
  assert.match(noLimits.text, /needs outOfScope/);

  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else in the repository"] });
  assert.equal(opened.ok, true, opened.text);
  const lane = h.ledger().lanes.L1!;
  const slot = { path: h.project.root };
  assert.deepEqual(Object.keys(h.ledger().slots), [], "a lane opened without isolate takes the project's own copy, not a new one");
  assert.equal(h.agents.get(lane.lead!)!.cwd, slot.path);
  assert.equal(h.git(slot.path, "branch", "--show-current").trim(), lane.branch);
  assert.deepEqual(ideCalls.filter((call) => call.path === slot.path), [
    { kind: "open", path: slot.path },
    { kind: "sync", path: slot.path },
  ]);
  assert.match(h.git(h.root, "rev-parse", "--git-path", "info/exclude").trim() && readFileSync(join(h.root, ".git", "info", "exclude"), "utf-8"), /^\.idea\/$/m);
  assert.equal(h.git(slot.path, "status", "--porcelain"), "");

  const unbounded = await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"] });
  assert.equal(unbounded.ok, false);
  assert.match(unbounded.text, /needs outOfScope/);

  const t1 = await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  assert.equal(t1.ok, true, t1.text);
  const task1 = h.ledger().tasks["L1-T1"]!;
  assert.equal(h.agents.get(task1.peer!)!.cwd, slot.path);
  assert.equal(task1.branch, lane.branch);
  const blocked = await h.call(lane.lead!, "lead", "start_task", { title: "More", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  assert.equal(blocked.ok, false);
  assert.match(blocked.text, /one writer at a time/);

  writeFileSync(join(slot.path, "a.txt"), "one\ntwo\nthree\nfour\n");
  assert.equal((await h.call(task1.peer!, "peer", "done", { outcome: "complete", summary: "four" })).ok, true);
  h.agents.get(task1.peer!)!.status = "idle";
  const dirty = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(dirty.ok, false);
  assert.match(dirty.text, /uncommitted/);
  h.git(slot.path, "commit", "-qam", "add four");
  const accepted = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(accepted.ok, true, accepted.text);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged");
  assert.ok(h.agents.get(task1.peer!)!.archivedAt);

  await h.call(lane.lead!, "lead", "start_task", { title: "Break it", goal: "g", acceptance: ["a"], owned: ["BROKEN"], outOfScope: ["the rest of the repository"] });
  const task2 = h.ledger().tasks["L1-T2"]!;
  h.commit(slot.path, "BROKEN", "x\n");
  const cut = await h.call(lane.lead!, "lead", "cut", { task: "L1-T2", reason: "wrong" });
  assert.equal(cut.ok, true, cut.text);
  assert.equal(existsSync(join(slot.path, "BROKEN")), false);
  assert.ok(h.agents.get(task2.peer!)!.archivedAt);

  await h.call(lane.lead!, "lead", "start_task", { title: "Late break", goal: "g", acceptance: ["a"], owned: ["BROKEN"], outOfScope: ["the rest of the repository"] });
  const task3 = h.ledger().tasks["L1-T3"]!;
  h.commit(slot.path, "BROKEN", "late\n");
  await h.call(task3.peer!, "peer", "done", { outcome: "complete", summary: "late" });
  h.agents.get(task3.peer!)!.status = "idle";
  await h.call(lane.lead!, "lead", "accept", { task: "L1-T3" });
  // A red gate is evidence carried in the report, not a gag on the Lead: acceptance is the Lead's to claim and the Supervisor's to judge.
  const onRed = await h.call(lane.lead!, "lead", "report", { summary: "the lane is done", ready: true });
  assert.equal(onRed.ok, true, onRed.text);
  h.git(slot.path, "rm", "-q", "BROKEN");
  h.git(slot.path, "commit", "-qm", "unbreak");
  assert.equal((await h.call(lane.lead!, "lead", "report", { summary: "done, and green this time", ready: true })).ok, true);
  await h.idle(sup);
  const reports = h.agents.get(sup)!.sent.join("\n");
  assert.match(reports, /Gate: .*failed with exit/, "the red gate has to reach the Supervisor, not stop the Lead from speaking");
  assert.match(reports, /Gate: .*passed on the lane branch/);

  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(closed.ok, true, closed.text);
  assert.equal(h.git(h.root, "show", "main:a.txt"), "one\ntwo\nthree\nfour\n");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), lane.branch, "the Lead is mid-turn, and switching the copy under it would put its next commit on main");
  assert.match(closed.text, /put away once/);
  h.agents.get(lane.lead!)!.status = "idle";
  await h.endTurn(lane.lead!, "closing up");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "main", "once the Lead stops, the project's copy is back on its base branch");
  assert.equal(h.git(h.root, "branch", "--list", lane.branch).trim(), "", "and the landed branch goes, its commits kept under the lane's ref");
  assert.equal(h.git(h.root, "log", "-1", "--format=%B", "main").trim(), [`${lane.title} (L1)`, "", lane.outcome, "", "- L1-T1 " + h.ledger().tasks["L1-T1"]!.title, "- L1-T3 Late break"].join("\n"), "one commit, naming the tasks that went in and not the one cut");

  const reopened = await h.call(sup, "supervisor", "open_lane", { title: "Next", outcome: "b.txt changes", acceptance: ["z"], outOfScope: ["anything else in the repository"] });
  assert.equal(reopened.ok, true, reopened.text);
  assert.equal(h.ledger().lanes.L2!.slot, undefined, "the next lane works in place too, so nothing is created to reuse");
  assert.equal(h.workspaces.size, 1);
  assert.deepEqual(ideCalls.filter((call) => call.path === slot.path).map((call) => call.kind), ["open", "sync", "open", "sync"]);
  assert.equal(h.git(slot.path, "branch", "--show-current").trim(), h.ledger().lanes.L2!.branch);
  h.runtime.dispose();
});

test("a copy the desk opened in the index is closed there when the copy goes, and the project's own never is", async () => {
  const h = harness("outbox-ideclose.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Away", outcome: "b.txt changes", acceptance: ["a"], isolate: true, ...scope });
  const lane = h.ledger().lanes.L1!;
  const copy = h.ledger().slots[lane.slot!]!.path;
  assert.deepEqual(ideCalls.filter((call) => call.path === copy).map((call) => call.kind), ["open"]);

  h.agents.get(lane.lead!)!.status = "idle";
  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "done" });
  assert.equal(closed.ok, true, closed.text);
  // Every copy the IDE was handed stayed open in a window of its own, one per lane that ever ran.
  assert.deepEqual(ideCalls.filter((call) => call.path === copy).map((call) => call.kind), ["open", "close"], "the window goes with the copy");
  assert.equal(ideCalls.some((call) => call.kind === "close" && call.path === h.root), false, "the Human's own project stays open");
  h.runtime.dispose();
});

test("a lane that fails after taking the project's own copy gives it back", async () => {
  const h = harness("outbox-inplace.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const before = h.git(h.project.root, "branch", "--show-current").trim();

  // Refused after `inPlace` switched the owner's checkout; openLane's cleanup by slot id used to leave it moved.
  const refused = await h.call(sup, "supervisor", "open_lane", {
    title: "Numbers",
    outcome: "a.txt gains words",
    acceptance: ["four"],
    outOfScope: ["anything else in the repository"],
    role: "peer",
  });
  assert.equal(refused.ok, false, refused.text);
  const lane = h.ledger().lanes.L1!;
  assert.equal(lane.status, "closed");
  assert.equal(h.git(h.project.root, "branch", "--show-current").trim(), before, "the owner's repository is back where it was");
  assert.equal(h.git(h.project.root, "branch", "--list", lane.branch).trim(), "", "and the branch the lane made, which holds nothing, is gone");

  // The first attempt left the project's workspace behind, so the daemon has to fail to find it as well as to make one.
  const workspaces = (h.paseo as unknown as { workspaces: { create: unknown; list: unknown } }).workspaces;
  workspaces.list = workspaces.create = async () => {
    throw new Error("the daemon made no workspace");
  };
  const unhoused = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else in the repository"] });
  assert.equal(unhoused.ok, false, unhoused.text);
  assert.equal(h.git(h.project.root, "branch", "--show-current").trim(), before, "a copy Paseo would not take is handed back too");
  assert.equal(h.git(h.project.root, "branch", "--list", h.ledger().lanes.L2!.branch).trim(), "");
  h.runtime.dispose();
});

test("the Supervisor's status shows the Human's own copy, names a choice only where carrying on is a real question, and what each open lane is for", async () => {
  const h = harness("outbox-own-copy.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { base: "main", gate: "true" });
  const status = async () => (await h.call(sup, "supervisor", "status", {})).text;
  const choice = /The Human decides where the next lane works/;
  placeProjectFiles(h.root, "Team rules.");

  const fresh = await status();
  assert.match(fresh, /Base main\.[^\n]*\n\n## The project's own copy\n\n[^\n]* is on main, clean\.\nNo lane is working in it\./, fresh);
  assert.doesNotMatch(fresh, choice, "on the base and clean but for the desk's own block, a lane just opens");

  h.git(h.root, "switch", "-qc", "fix/login");
  const offBase = await status();
  assert.match(offBase, /is on fix\/login, clean\./);
  assert.match(offBase, choice, "the reported case: a clean branch that is not the base");
  assert.match(offBase, /carry on fix\/login here, or a new branch off main/);

  for (let n = 1; n <= 12; n++) writeFileSync(join(h.root, `wip-${String(n).padStart(2, "0")}.txt`), "half done\n");
  writeFileSync(join(h.root, "a.txt"), "edited\n");
  const dirty = await status();
  assert.match(dirty, /with 13 uncommitted files: a\.txt, wip-01\.txt, [^\n]*wip-09\.txt, and 3 more\./, dirty);
  assert.match(dirty, /takes the uncommitted work along/);

  h.git(h.root, "stash", "-u", "-q");
  h.git(h.root, "switch", "-q", "main");
  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"], writeSet: ["a.txt"], contracts: ["b.txt"] });
  assert.equal(opened.ok, true, opened.text);
  const held = await status();
  assert.match(held, /Lane L1 is working in it\./);
  assert.doesNotMatch(held, choice, "a lane holds the copy, so the next one takes a copy of its own");
  assert.match(held, /Outcome: a\.txt gains words\nWrites: a\.txt\nDepends on: b\.txt/);

  const lead = (await h.call(h.ledger().lanes.L1!.lead!, "lead", "status", {})).text;
  assert.doesNotMatch(lead, /The project's own copy|Outcome:/, "a Lead's status is its own lane, as before");
  h.runtime.dispose();
});

test("a lane asked to carry on the Human's branch works on it where it is, keeps their uncommitted work, and lands by its gate alone", async () => {
  const h = harness("outbox-onbranch.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "test ! -f BROKEN" });
  h.git(h.root, "switch", "-qc", "fix/login");
  h.commit(h.root, "a.txt", "one\ntwo\nthree\nhalf a fix\n");
  writeFileSync(join(h.root, "b.txt"), "bee, still being edited\n");
  const main = h.git(h.root, "rev-parse", "main").trim();
  const scope = { outcome: "the login fix is finished", acceptance: ["a"], outOfScope: ["anything else in the repository"] };

  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Finish the fix", ...scope, onBranch: true });
  assert.equal(opened.ok, true, opened.text);
  const lane = h.ledger().lanes.L1!;
  assert.equal(lane.branch, "fix/login", "no lane branch of its own");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login");
  assert.deepEqual(h.git(h.root, "branch", "--format=%(refname:short)").trim().split("\n").sort(), ["fix/login", "main"]);
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, still being edited\n", "the Human's uncommitted edit is where they left it");
  assert.equal(h.agents.get(lane.lead!)!.cwd, h.project.root);
  assert.match(h.agents.get(lane.lead!)!.prompt ?? "", /fix\/login, the Human's own[\s\S]*commit it as found in a commit of its own/, "the Human's work in progress stays theirs, apart from the lane's");
  assert.notEqual(loadConfig(h.project.state).base, "fix/login", "a branch carried on is not made the project's base");

  const second = await h.call(sup, "supervisor", "open_lane", { title: "Also here", ...scope, onBranch: true });
  assert.equal(second.ok, false, "one checkout holds one branch, and L1 has it");
  assert.match(second.text, /L1/);

  h.commit(h.root, "b.txt", "bee, done\n");
  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(closed.ok, true, closed.text);
  assert.match(closed.text, /the work stays on fix\/login, the branch it carried on; nothing was merged anywhere/);
  assert.equal(h.git(h.root, "rev-parse", "main").trim(), main, "nothing was merged into main");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login", "and the Human's copy was not switched away");
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, done\n");
  h.runtime.dispose();
});

test("carrying on a branch is refused where there is none to carry on, and a failed open leaves the Human's branch alone", async () => {
  const h = harness("outbox-onbranch-refused.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] };
  h.git(h.root, "switch", "-qc", "fix/login");

  for (const extra of [{ isolate: true }, { base: "main" }]) {
    const refused = await h.call(sup, "supervisor", "open_lane", { title: "Odd", ...scope, onBranch: true, ...extra });
    assert.equal(refused.ok, false, JSON.stringify(extra));
  }
  const failed = await h.call(sup, "supervisor", "open_lane", { title: "No lead", ...scope, onBranch: true, role: "peer" });
  assert.equal(failed.ok, false, failed.text);
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login", "still on the Human's branch");
  assert.match(h.git(h.root, "branch", "--list", "fix/login"), /fix\/login/, "and it was not deleted");
  assert.doesNotMatch(readFileSync(join(h.project.state, "events.log"), "utf-8"), /lane\.gaveBack/, "nor was it ever handed to the undo made for a lane branch");

  writeFileSync(join(h.root, "b.txt"), "bee, half done\n");
  const alone = await h.call(sup, "supervisor", "open_lane", { title: "Alone", ...scope, newBranch: "fix/login-2" });
  assert.match(alone.text, /newBranch goes with onBranch/, "a new branch is only started for a lane that carries it on");
  const taken = await h.call(sup, "supervisor", "open_lane", { title: "Taken", ...scope, onBranch: true, newBranch: "main" });
  assert.equal(taken.ok, false);
  assert.match(taken.text, /main already exists/);
  const unled = await h.call(sup, "supervisor", "open_lane", { title: "No lead", ...scope, onBranch: true, newBranch: "fix/login-2", role: "peer" });
  assert.equal(unled.ok, false, unled.text);
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login", "a branch started for a lane that failed to open is undone");
  assert.equal(h.git(h.root, "branch", "--list", "fix/login-2").trim(), "");
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, half done\n", "and the uncommitted work came back with the copy");

  h.git(h.root, "switch", "-q", "--detach");
  const detached = await h.call(sup, "supervisor", "open_lane", { title: "Nowhere", ...scope, onBranch: true });
  assert.equal(detached.ok, false);
  assert.match(detached.text, /not on a branch/);
  h.runtime.dispose();
});

test("a new branch the Human agreed to starts where their copy is, takes their uncommitted work along, and is carried on", async () => {
  const h = harness("outbox-onbranch-new.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { base: "main" });
  h.git(h.root, "switch", "-qc", "fix/login");
  writeFileSync(join(h.root, "b.txt"), "bee, half done\n");

  const workspaces = (h.paseo as unknown as { workspaces: { create: unknown } }).workspaces;
  const create = workspaces.create;
  workspaces.create = async () => {
    throw new Error("the daemon made no workspace");
  };
  const unhoused = await h.call(sup, "supervisor", "open_lane", { title: "Split off", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], onBranch: true, newBranch: "fix/login-2" });
  workspaces.create = create;
  assert.equal(unhoused.ok, false, unhoused.text);
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login", "a branch started for a copy Paseo would not take is undone");
  assert.equal(h.git(h.root, "branch", "--list", "fix/login-2").trim(), "");
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, half done\n");

  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Split off", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], onBranch: true, newBranch: "fix/login-2" });
  assert.equal(opened.ok, true, opened.text);
  const lane = Object.values(h.ledger().lanes).find((entry) => entry.status === "open")!;
  assert.equal(lane.branch, "fix/login-2");
  assert.match((await h.call(sup, "supervisor", "status", {})).text, new RegExp(`## ${lane.id} Split off\\n\\nBranch fix/login-2, carried on in the project's own copy\\.`));
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login-2");
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, half done\n");
  assert.equal(h.git(h.root, "rev-parse", "fix/login").trim(), h.git(h.root, "rev-parse", "fix/login-2").trim(), "the branch it left is where it was");

  const closed = await h.call(sup, "supervisor", "close_lane", { lane: lane.id, land: false });
  assert.equal(closed.ok, true, closed.text);
  assert.equal(h.ledger().lanes[lane.id]!.restoring, undefined, "nothing is left to put back, so no round retries it");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "fix/login-2");
  assert.equal(readFileSync(join(h.root, "b.txt"), "utf-8"), "bee, half done\n");

  h.git(h.root, "switch", "-q", "main");
  const onBase = await h.call(sup, "supervisor", "open_lane", { title: "Straight on main", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], onBranch: true });
  assert.equal(onBase.ok, true, onBase.text);
  assert.match(onBase.text, /carries on main [^,]*, which is the project's base: nothing separates this work from it/, "allowed, and said plainly");
  h.runtime.dispose();
});

test("a lane open when the Human updates the plugin from state 1 carries on and lands as the lane branch it was", async () => {
  const h = harness("outbox-upgrade.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "true" });
  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else in the repository"] });
  assert.equal(opened.ok, true, opened.text);
  const lane = h.ledger().lanes.L1!;
  h.commit(h.root, "a.txt", "one\ntwo\nthree\nfour\n");

  // What the plugin before this version left on disk: the same ledger, numbered 1, and a machine with no number.
  const file = join(h.project.state, "ledger.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf-8")), version: 1 }));
  const root = join(HOME, ".local", "share", "seatworks-v2");
  rmSync(join(root, "state.json"), { force: true });
  const report = upgradeState(root);
  assert.deepEqual(report.failed, []);
  assert.ok(report.upgraded.includes(`${h.project.slug}: 1 → ${STATE_VERSION}`), report.upgraded.join(", "));
  assert.deepEqual(h.ledger().lanes.L1, lane, "the open lane is on record exactly as it was");

  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(closed.ok, true, closed.text);
  assert.equal(h.git(h.root, "show", "main:a.txt"), "one\ntwo\nthree\nfour\n", "the lane landed on its base");
  h.agents.get(lane.lead!)!.status = "idle";
  await h.endTurn(lane.lead!, "closing up");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "main", "the copy is handed back on its base once the Lead stops");
  assert.equal(h.git(h.root, "branch", "--list", lane.branch).trim(), "", "and the landed lane branch is gone");
  h.runtime.dispose();
});

test("a gate the owner switched off is still off when the next lane opens", async () => {
  const h = harness("outbox-gate.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  writeFileSync(join(h.project.root, "package.json"), JSON.stringify({ scripts: { test: "echo ran" } }));
  h.git(h.project.root, "add", "-A");
  h.git(h.project.root, "commit", "-qm", "a package");

  assert.match((await h.call(sup, "supervisor", "set_project", { gate: "" })).text, /gate none/);
  // "Switched off" and "never set" used to be one stored value, so the next lane re-detected `npm test`.
  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"] });
  assert.equal(opened.ok, true, opened.text);
  assert.match(opened.text, /Gate: none set, by this project's own choice/, opened.text);
  assert.match((await h.call(sup, "supervisor", "set_project", {})).text, /gate none/);
  h.runtime.dispose();
});

test("a lane in the project's own copy whose base moved waits for a seat mid-turn there, then lands", async () => {
  const h = harness("outbox-moved.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"] });
  assert.equal(opened.ok, true, opened.text);
  const lane = h.ledger().lanes.L1!;
  writeFileSync(join(h.project.root, "a.txt"), "one\ntwo\nthree\nfour\n");
  h.git(h.project.root, "add", "-A");
  h.git(h.project.root, "commit", "-qm", "four");

  // main moves on while the lane runs, so landing first merges main into the lane in its own copy.
  const side = join(mkdtempSync(join(tmpdir(), "sw2-moved-")), "wt");
  h.git(h.project.root, "worktree", "add", "-q", "-b", "side", side, "main");
  h.git(side, "commit", "-qm", "moved", "--allow-empty");
  h.git(h.project.root, "branch", "-f", "main", "side");
  h.git(h.project.root, "worktree", "remove", "--force", side);

  // Nothing is merged under a Lead mid-turn in that copy.
  const head = h.git(h.root, "rev-parse", "HEAD");
  const reports = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(reports.ok, false, reports.text);
  assert.match(reports.text, /a seat is mid-turn there/);
  assert.equal(h.git(h.root, "rev-parse", "HEAD"), head, "the copy under a running seat is left as the seat has it");
  assert.doesNotMatch(h.git(h.root, "show", "main:a.txt"), /four/);
  // Still open, so the landing waits for the turn rather than being lost with a closed lane.
  assert.equal(h.ledger().lanes.L1!.status, "open");
  h.agents.get(lane.lead!)!.status = "idle";
  // Nothing else would bring the Supervisor back: it waited for a heartbeat, ten minutes in one run.
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /CAN LAND/);
  await h.endTurn(lane.lead!, "reported");
  assert.match(h.agents.get(sup)!.sent.join("\n"), /CAN LAND L1/, "the end of the turn that was in the way is mail for whoever tried to land");
  const landed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(landed.ok, true, landed.text);
  assert.match(h.git(h.root, "show", "main:a.txt"), /four/);
  h.runtime.dispose();
});

test("a lane in the project's own copy lands after its base moved, once nobody is writing there", async () => {
  const h = harness("outbox-moved-idle.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const opened = await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"] });
  assert.equal(opened.ok, true, opened.text);
  const lane = h.ledger().lanes.L1!;
  writeFileSync(join(h.project.root, "a.txt"), "one\ntwo\nthree\nfour\n");
  h.git(h.project.root, "add", "-A");
  h.git(h.project.root, "commit", "-qm", "four");
  const side = join(mkdtempSync(join(tmpdir(), "sw2-moved-")), "wt");
  h.git(h.project.root, "worktree", "add", "-q", "-b", "side", side, "main");
  h.git(side, "commit", "-qm", "moved", "--allow-empty");
  h.git(h.project.root, "branch", "-f", "main", "side");
  h.git(h.project.root, "worktree", "remove", "--force", side);
  const moved = h.git(h.root, "rev-parse", "main").trim();

  // With the Lead stopped, main is merged into the lane where it stands and lands on main as one commit.
  h.agents.get(lane.lead!)!.status = "idle";
  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(closed.ok, true, closed.text);
  assert.match(h.git(h.root, "show", "main:a.txt"), /four/);
  assert.equal(h.git(h.root, "rev-parse", "main^").trim(), moved);
  assert.equal(h.git(h.root, "log", "-1", "--format=%s", "refs/seatworks/lanes/L1").trim(), `Bring main into ${lane.branch}`);
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "main");
  assert.equal(h.git(h.root, "branch", "--list", lane.branch).trim(), "", "a landed branch is all under its landed ref, so it goes");
  h.runtime.dispose();
});

test("a project set to land by merge commit keeps the lane's commits on main under one merge", async () => {
  const h = harness("outbox-land-merge.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const set = await h.call(sup, "supervisor", "set_project", { landAs: "merge" });
  assert.match(set.text, /land as merge/);
  assert.equal(loadConfig(h.project.state).landAs, "merge");
  assert.match((await h.call(sup, "supervisor", "status", {})).text, /Lanes land as merge\./);
  await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  const before = h.git(h.root, "rev-parse", "main").trim();
  writeFileSync(join(h.project.root, "a.txt"), "one\nfour\n");
  h.git(h.project.root, "commit", "-qam", "four");
  const tip = h.git(h.root, "rev-parse", "HEAD").trim();
  h.agents.get(lane.lead!)!.status = "idle";
  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: true });
  assert.equal(closed.ok, true, closed.text);
  assert.match(closed.text, /merged lane\/l1-numbers into main/);
  assert.deepEqual(h.git(h.root, "log", "-1", "--format=%P", "main").trim().split(" "), [before, tip]);
  h.runtime.dispose();
});

test("parallel work needs independent write sets and merges back from its own working copy", async () => {
  const h = harness("outbox-parallel.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Two files", outcome: "both change", acceptance: ["a", "b"], outOfScope: ["anything else in the repository"], writeSet: ["a.txt", "b.txt"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "A", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const overlap = await h.call(lane.lead!, "lead", "start_task", { title: "A again", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"], parallel: true });
  assert.equal(overlap.ok, false);
  assert.match(overlap.text, /overlap L1-T1/);
  const serial = await h.call(lane.lead!, "lead", "start_task", { title: "Lock", goal: "g", acceptance: ["a"], owned: ["package-lock.json"], outOfScope: ["the rest of the repository"], parallel: true });
  assert.equal(serial.ok, false, "the lock file is really in this repository, so a parallel task may not own it");
  const par = await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], outOfScope: ["the rest of the repository"], parallel: true });
  assert.equal(par.ok, true, par.text);
  const taskB = h.ledger().tasks["L1-T2"]!;
  assert.equal(taskB.slot, "S0", "the lane itself is in place, so the parallel task takes the first working copy the desk makes");
  assert.equal(h.agents.get(taskB.peer!)!.cwd, h.ledger().slots.S0!.path);

  const taskA = h.ledger().tasks["L1-T1"]!;
  h.commit(lane.worktree!, "a.txt", "A\n");
  await h.call(taskA.peer!, "peer", "done", { outcome: "complete", summary: "a" });
  h.agents.get(taskA.peer!)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);

  h.commit(taskB.worktree!, "b.txt", "B\n");
  await h.call(taskB.peer!, "peer", "done", { outcome: "complete", summary: "b" });
  h.agents.get(taskB.peer!)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T2" })).ok, true);
  await h.runtime.desk.settled(h.project);
  assert.equal(h.ledger().tasks["L1-T2"]!.status, "merged");
  assert.equal(h.git(lane.worktree!, "show", "HEAD:b.txt"), "B\n");
  assert.deepEqual(Object.keys(h.ledger().slots), [], "the copy a parallel task opened is torn down once its work is in");

  const clash = await h.call(sup, "supervisor", "open_lane", { title: "C", outcome: "c", acceptance: ["c"], outOfScope: ["anything else in the repository"], writeSet: ["b.txt"] });
  assert.equal(clash.ok, false);
  assert.match(clash.text, /overlaps lane L1/, "two lanes that declared the same file are one lane, whichever copy each of them writes in");
  const fine = await h.call(sup, "supervisor", "open_lane", { title: "C", outcome: "c", acceptance: ["c"], outOfScope: ["anything else in the repository"], writeSet: ["c.txt"], isolate: true });
  assert.equal(fine.ok, true, fine.text);
  assert.ok(h.ledger().lanes.L2!.slot, "L1 is writing in the project's own copy, so the next lane is given one instead of switching the branch under it");
  h.runtime.dispose();
});

test("what the desk sends a seat carries the kinds of its letters in its id, its first prompt too, so the watch tells it from a person's words", async () => {
  const h = harness("outbox-kinds.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Kinds", outcome: "x", acceptance: ["y"], outOfScope: ["anything else in the repository"] });
  const lead = h.ledger().lanes.L1!.lead!;
  await h.idle(lead);
  await h.call(lead, "lead", "ask", { kind: "question", text: "Round half up or down?", default: "half up" });
  await h.call(sup, "supervisor", "answer", { ask: "A1", text: "Half up." });
  await h.idle(lead);
  assert.deepEqual(sentBy({ clientMessageId: h.agents.get(lead)!.promptId }), ["brief"]);
  assert.deepEqual(sentBy({ clientMessageId: h.agents.get(lead)!.sentIds.at(-1) }), ["answer"]);
  h.runtime.dispose();
});

test("asks reach the level above, answers come back, and a silent Peer is nudged then reported", async () => {
  const h = harness("outbox-asks.json");
  const turnEnded = h.endTurn;
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Asks", outcome: "x", acceptance: ["y"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.idle(lane.lead!);

  const asked = await h.call(lane.lead!, "lead", "ask", { kind: "question", text: "Round half up or down?", default: "half up" });
  assert.equal(asked.ok, true, asked.text);
  await h.idle(sup);
  assert.match(h.agents.get(sup)!.sent.at(-1)!, /ASK A1 \(question\)[\s\S]*half up/);
  assert.equal((await h.call(sup, "supervisor", "answer", { ask: "A1", text: "Half up." })).ok, true);
  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /ANSWER to your ask A1[\s\S]*Half up/);

  await h.call(lane.lead!, "lead", "start_task", { title: "Quiet one", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.agents.get(task.peer!)!.status = "idle";
  await turnEnded(task.peer!, "I looked around.");
  await h.runtime.outbox.pump(task.peer!);
  assert.match(h.agents.get(task.peer!)!.sent.at(-1)!, /without calling done or ask/);
  h.runtime.outbox.turnEnded(task.peer!);
  await turnEnded(task.peer!, "Still looking.");
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "stalled");
  h.agents.get(lane.lead!)!.status = "idle";
  h.runtime.outbox.turnEnded(lane.lead!);
  await h.runtime.outbox.pump(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /SILENT L1-T1[\s\S]*Still looking/);
  h.runtime.dispose();
});

test("a working Peer past the first page of agents is not read as gone", async () => {
  const h = harness("outbox-paged.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  // A long-lived daemon: plenty of other agents, more recently active than the Peer about to start.
  for (let index = 0; index < 205; index++) h.add("sw2-supervisor-claude/claude-opus-5", h.root, `other-${index}`);

  await h.call(sup, "supervisor", "open_lane", { title: "Busy machine", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;
  assert.equal(h.agents.size > 200, true, "the seats this lane needs are past the first page");

  await h.tick(Date.now());
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "running", "a seat the desk cannot see on one page is not a seat that is gone");
  await h.idle(lane.lead!);
  assert.doesNotMatch(h.agents.get(lane.lead!)!.sent.join("\n"), /was closed or archived/, "and its Lead is not told a working Peer was closed");
  assert.equal(task.peer !== undefined, true);
  h.runtime.dispose();
});

test("a call that runs longer than a seat can wait is answered by mail, and calling it again does not run it twice", async () => {
  const h = harness("outbox-later.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "sleep 1" });
  await h.call(sup, "supervisor", "open_lane", { title: "Slow", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  const request = { id: "r1", agent: lane.lead!, role: "lead", tool: "report", args: { summary: "ready to land", ready: true }, cwd: h.root, at: Date.now() };

  // The bridge waits five minutes but the gate thirty, so a retried call must not start a second gate.
  const [first, again] = await Promise.all([h.runtime.desk.answer(request, 100), h.runtime.desk.answer({ ...request, id: "r2" }, 100)]);
  assert.match(first.text, /still working on report/);
  assert.match(again.text, /already running/);
  await Promise.all([...(h.runtime.desk as unknown as { running: Map<string, { reply: Promise<unknown> }> }).running.values()].map((entry) => entry.reply));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(readdirSync(join(h.project.state, "gates")).filter((name) => name.startsWith("L1-")).length, 1, "one gate ran, not two");
  await h.idle(lane.lead!);
  const told = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.equal(told.split("ANSWER to your report call").length - 1, 1, "and the answer came once, as mail");
  await h.idle(sup);
  assert.match(h.agents.get(sup)!.sent.join("\n"), /REPORT L1/);
  h.runtime.dispose();
});

test("a hand-back whose gate outlasts the call is not read as a silent turn", async () => {
  const h = harness("outbox-slowdone.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "sleep 1", gateOn: "task" });
  await h.call(sup, "supervisor", "open_lane", { title: "Slow", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  h.commit(lane.worktree!, "a.txt", "A\n");

  // Past what a call can wait, the Peer is told to end its turn; that turn must not read as one that never called done.
  h.beginTurn(peer);
  const reply = await h.runtime.desk.answer({ id: "d1", agent: peer, role: "peer", tool: "done", args: { outcome: "complete", summary: "done" }, cwd: h.root, at: Date.now() }, 100);
  assert.match(reply.text, /still working on done/);
  h.agents.get(peer)!.status = "idle";
  await h.endTurn(peer, "handed back, ending my turn as told");
  assert.equal(h.ledger().tasks["L1-T1"]!.silent, 0, "a call still being worked on is not silence");
  assert.doesNotMatch(h.agents.get(peer)!.sent.join("\n"), /without calling done or ask/);

  await Promise.all([...(h.runtime.desk as unknown as { running: Map<string, { reply: Promise<unknown> }> }).running.values()].map((entry) => entry.reply));
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "done");
  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /Gate: sleep 1 passed/);
  h.runtime.dispose();
});

test("a task stalled because its Peer is gone holds no copy, and an ask to a gone reader goes to whoever supervises now", async () => {
  const h = harness("outbox-goneholder.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Gone", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  Object.assign(h.agents.get(peer)!, { archivedAt: new Date().toISOString(), status: "closed" });
  await h.tick(Date.now());
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "stalled");

  // Nobody writes in the copy any more, so the Lead must not be told to wait for a hand-back.
  const next = await h.call(lane.lead!, "lead", "start_task", { title: "More", goal: "g", acceptance: ["b"], owned: ["b.txt"], outOfScope: ["the rest of the repository"] });
  assert.equal(next.ok, true, next.text);

  // A Lead's ask to a Supervisor that has since gone must reach the one who sits down afterwards.
  assert.equal((await h.call(lane.lead!, "lead", "ask", { kind: "question", text: "Keep the old endpoint?", default: "keep it" })).ok, true);
  Object.assign(h.agents.get(sup)!, { archivedAt: new Date().toISOString(), status: "closed" });
  const back = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup-2");
  await h.tick(Date.now() + 16 * 60_000);
  await h.idle(back);
  assert.match(h.agents.get(back)!.sent.join("\n"), /Keep the old endpoint\?/);
  assert.equal(Object.values(h.ledger().asks).find((ask) => ask.text.startsWith("Keep the old endpoint"))!.to, back);
  h.runtime.dispose();
});

test("an escalation with nobody supervising seated waits for one instead of being marked sent", async () => {
  const h = harness("outbox-escalate.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Asks", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  assert.equal((await h.call(peer, "peer", "ask", { question: "Round half up or down?", tried: "read the spec" })).ok, true);
  h.agents.get(lane.lead!)!.status = "idle";
  Object.assign(h.agents.get(sup)!, { archivedAt: new Date().toISOString(), status: "closed" });

  // With the only Supervisor archived there is nobody to escalate to, so it must not be marked escalated.
  const start = Date.now();
  for (const minutes of [16, 32, 48]) await h.tick(start + minutes * 60_000);
  const ask = Object.values(h.ledger().asks)[0]!;
  assert.equal(ask.escalated ?? false, false, "nobody received it, so it is not recorded as escalated");

  const back = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup-2");
  await h.tick(start + 64 * 60_000);
  await h.idle(back);
  assert.equal(Object.values(h.ledger().asks)[0]!.escalated, true);
  assert.match(h.agents.get(back)!.sent.join("\n"), /Round half up or down\?/, "and the Supervisor who came back is the one told");
  h.runtime.dispose();
});

test("a stalled task still holds its working copy, and runs again once its Peer is heard from", async () => {
  const h = harness("outbox-stalled.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Quiet", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  h.agents.get(peer)!.status = "idle";
  for (const text of ["reading", "still reading"]) {
    h.runtime.outbox.turnEnded(peer);
    await new Promise((resolve) => setTimeout(resolve, 3));
    h.beginTurn(peer);
    await h.endTurn(peer, text);
  }
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "stalled");
  assert.match(h.agents.get(peer)!.prompt ?? "", /Your task started from [0-9a-f]{40}/, "the brief names where the task began, which is BASE for its checks");

  // Its Peer is still seated in the lane's copy, so a stalled task still holds it.
  const second = await h.call(lane.lead!, "lead", "start_task", { title: "More", goal: "g", acceptance: ["b"], owned: ["b.txt"], outOfScope: ["the rest of the repository"] });
  assert.equal(second.ok, false, second.text);

  // Working again, it is running, so the patrol's gone-Peer and idle-lane checks see it.
  h.runtime.outbox.turnEnded(peer);
  await new Promise((resolve) => setTimeout(resolve, 3));
  h.beginTurn(peer);
  assert.equal((await h.call(peer, "peer", "ask", { question: "Which file first?", tried: "read both" })).ok, true);
  await h.endTurn(peer, "asked");
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "running");
  h.runtime.dispose();
});

test("a Peer that asked is not stalled on its next quiet turn, and a repeated rework is not called sent", async () => {
  const h = harness("outbox-silent.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Quiet", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Work", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;
  const peer = task.peer!;

  h.agents.get(peer)!.status = "idle";
  h.beginTurn(peer);
  await h.endTurn(peer, "still reading");
  await h.runtime.outbox.pump(peer);
  assert.equal(h.ledger().tasks["L1-T1"]!.silent, 1);
  assert.match(h.agents.get(peer)!.sent.at(-1)!, /without calling done or ask/);

  // Real turns are seconds apart, so the test waits for the desk's millisecond turn clock to move.
  h.runtime.outbox.turnEnded(peer);
  await new Promise((resolve) => setTimeout(resolve, 3));
  h.beginTurn(peer);
  assert.equal((await h.call(peer, "peer", "ask", { question: "Round half up or down?", tried: "read the spec" })).ok, true);
  await h.endTurn(peer, "asked and waiting");
  assert.equal(h.ledger().tasks["L1-T1"]!.silent, 0, "the count is of consecutive quiet turns, not a lifetime tally");

  h.runtime.outbox.turnEnded(peer);
  await new Promise((resolve) => setTimeout(resolve, 3));
  h.beginTurn(peer);
  await h.endTurn(peer, "applying it");
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "running", "a Peer that asked in between has not gone silent twice");
  assert.equal(h.ledger().tasks["L1-T1"]!.silent, 1);

  // The same instruction twice: letters are keyed by the event, so the second one really goes.
  const first = await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "Commit your work." });
  assert.equal(first.ok, true, first.text);
  const again = await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "Commit your work." });
  assert.equal(again.ok, true, "a Lead repeating itself is a second instruction, not a double post");
  h.runtime.outbox.turnEnded(peer);
  await h.runtime.outbox.pump(peer);
  const told = h.agents.get(peer)!.sent.join("\n");
  assert.equal(told.match(/Commit your work/g)?.length, 2, "both went; keyed by its words, the second was dropped and the Lead was told it was sent");
  h.runtime.dispose();
});

test("each project gets the agent and model its own settings choose, and the machine layer keeps the rest", async () => {
  const h = harness("outbox-per-project.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "true" });
  await h.call(sup, "supervisor", "open_lane", { title: "Defaults", outcome: "a.txt changes", acceptance: ["one"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Default peer", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const onDefaults = h.agents.get(h.ledger().tasks["L1-T1"]!.peer!)!.provider;
  assert.equal(onDefaults, "sw2-peer-devin/swe-2-max");
  assert.equal(h.agents.get(lane.lead!)!.provider, "sw2-lead-claude/claude-opus-5-5[1M]");

  writeFileSync(join(h.project.state, "settings.json"), JSON.stringify({ roles: { peer: { harness: "claude", model: "claude-opus-5" } } }));
  await h.call(h.ledger().tasks["L1-T1"]!.peer!, "peer", "done", { outcome: "complete", summary: "done" });
  h.commit(h.root, "a.txt", "one\n");
  await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  await h.call(lane.lead!, "lead", "start_task", { title: "Claude peer", goal: "g", acceptance: ["a"], owned: ["b.txt"], outOfScope: ["the rest of the repository"] });
  const switched = h.agents.get(h.ledger().tasks["L1-T2"]!.peer!)!.provider;
  assert.equal(switched, "sw2-peer-claude/claude-opus-5");
  assert.equal(h.agents.get(lane.lead!)!.provider, "sw2-lead-claude/claude-opus-5-5[1M]");
  h.runtime.dispose();
});




test("what the desk opened and nothing holds any more is swept away without being asked", async () => {
  const h = harness("outbox-sweep.json");
  const tick = h.tick;
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Swept", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });

  const ws = h.paseo as unknown as { workspaces: { create(options: { title: string; source: { kind: string; path: string } }): Promise<{ id: string }> } };
  const orphan = await ws.workspaces.create({ title: `${h.project.slug} S9`, source: { kind: "directory", path: h.root } });
  const inPlace = [...h.workspaceNames.entries()].find(([, name]) => name === h.project.slug)![0];
  assert.equal(h.archivedWorkspaces.has(orphan.id), false, "the orphan starts out live");

  await tick();

  assert.equal(h.archivedWorkspaces.has(orphan.id), true, "a working copy the ledger no longer holds is put away by the desk, not by a human with a shell");
  assert.equal(h.archivedWorkspaces.has(inPlace), false, "the copy the open lane is working in is left alone");
  h.runtime.dispose();
});

test("one workspace carries a whole project, and the desk puts it away when the project goes quiet", async () => {
  const h = harness("outbox-quiet.json");
  const tick = h.tick;
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Quiet", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;

  const live = () =>
    [...h.workspaceNames.entries()].filter(([id, name]) => (name === h.project.slug || name.startsWith(`${h.project.slug} `)) && !h.archivedWorkspaces.has(id));
  assert.equal(live().length, 1, "a lane takes the project's one working copy rather than opening one of its own");

  await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "done" });
  h.agents.get(lane.lead!)!.archivedAt = new Date().toISOString();
  h.agents.get(sup)!.archivedAt = new Date().toISOString();
  for (const agent of h.agents.values()) if (agent.provider.startsWith("sw2-critic-")) agent.archivedAt = new Date().toISOString();
  await tick();

  assert.equal(live().length, 0, "with the work finished and nobody seated, the desk takes back what it opened instead of leaving it for a human to delete");
  h.runtime.dispose();
});

test("a project removed while the plugin runs is not written back by the round", async () => {
  const h = harness("outbox-removed.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.tick(Date.now());
  assert.ok(existsSync(join(h.project.state, "status.md")), "a project on record has its status page");
  // Its seats gone: a live one is a project still in use, and seeing it records the project again.
  h.agents.get(sup)!.archivedAt = new Date().toISOString();
  rmSync(h.project.state, { recursive: true, force: true });
  await h.tick(Date.now());
  assert.equal(existsSync(h.project.state), false, "the Human removed it, and the round leaves it removed");
  h.runtime.dispose();
});

test("a lane that declared no write set does not lock the project to one lane, and where the next one works is the Supervisor's call", async () => {
  const h = harness("outbox-lockout.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };

  // The first lane is allowed to open with no write set, and takes the project's own copy.
  const first = await h.call(sup, "supervisor", "open_lane", { title: "Authorization", outcome: "roles gate the api", acceptance: ["a"], ...scope });
  assert.equal(first.ok, true, first.text);

  // One checkout is one branch: the desk names both ways and takes neither for the Supervisor.
  const asked = { title: "Authentication", outcome: "sessions exist", acceptance: ["a"], writeSet: ["src/auth/**"], ...scope };
  const refused = await h.call(sup, "supervisor", "open_lane", asked);
  assert.match(refused.text, /Lane L1 is working in the project's own copy on lane\/l1-authorization\. Pass isolate to open this lane in a copy of its own now, or open it with after L1/);
  assert.equal(Object.keys(h.ledger().lanes).length, 1, "nothing is recorded for a lane that did not open");
  const next = await h.call(sup, "supervisor", "open_lane", { ...asked, isolate: true });
  assert.equal(next.ok, true, next.text);
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), h.ledger().lanes.L1!.branch, "the project's own copy stays on the lane it is carrying");

  // The DETOUR of the concept: a hole found mid-lane gets its own Lead, and a copy of its own without asking, since it cannot wait.
  const detour = await h.call(sup, "supervisor", "open_lane", { title: "Sessions", outcome: "sessions last a day", acceptance: ["a"], detourOf: "L1", ...scope });
  assert.equal(detour.ok, true, detour.text);
  const lanes = h.ledger().lanes;
  assert.equal(Object.values(lanes).filter((lane) => lane.status === "open").length, 3);
  const where = [lanes.L1!, lanes.L2!, lanes.L3!].map((lane) => h.agents.get(lane.lead!)!.cwd);
  assert.equal(new Set(where).size, 3, "no two Leads are left writing in one checkout");
});

test("a lane's own working copy is filed under the project, so closing it leaves no project behind", async () => {
  const h = harness("outbox-oneproject.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Here", outcome: "a.txt changes", acceptance: ["a"], ...scope });
  const away = await h.call(sup, "supervisor", "open_lane", { title: "Away", outcome: "b.txt changes", acceptance: ["a"], isolate: true, ...scope });
  assert.equal(away.ok, true, away.text);

  const { L1, L2 } = h.ledger().lanes;
  assert.notEqual(h.workspaces.get(L2!.workspaceId!), h.root, "the second lane works in a copy of its own");
  // Nothing the plugin can call removes a Paseo project, so a copy must join the project it came from.
  assert.equal(h.workspaceProjects.get(L2!.workspaceId!), h.workspaceProjects.get(L1!.workspaceId!), "the copy belongs to the project it was taken from");
  h.runtime.dispose();
});

test("a working copy is not handed to Paseo bare when the project's workspace names no project", async () => {
  const h = harness("outbox-noproject.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Here", outcome: "a.txt changes", acceptance: ["a"], ...scope });
  h.workspaceProjects.set(h.ledger().lanes.L1!.workspaceId!, "");
  const made = h.workspaces.size;

  const away = await h.call(sup, "supervisor", "open_lane", { title: "Away", outcome: "b.txt changes", acceptance: ["a"], isolate: true, ...scope });
  assert.equal(away.ok, false);
  assert.match(away.text, /names no Paseo project/);
  assert.equal(h.workspaces.size, made, "no workspace, and so no project, was made for the copy");
  h.runtime.dispose();
});

test("a ledger the desk cannot read is not written over, and the seat is told why", async () => {
  const h = harness("outbox-badledger.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Real work", outcome: "x", acceptance: ["a"], ...scope });
  assert.ok(h.ledger().lanes.L1, "there is something on record to lose");

  // Whatever wrote it, an unreadable ledger must not read like a project that has not started.
  const file = join(h.project.state, "ledger.json");
  const kept = '{ "version": 1, "lanes": ';
  writeFileSync(file, kept);

  const refused = await h.call(sup, "supervisor", "open_lane", { title: "After", outcome: "y", acceptance: ["a"], ...scope });
  assert.equal(refused.ok, false);
  assert.match(refused.text, /could not be read/, "the seat is told, rather than getting a lane in a project that forgot the first one");
  assert.equal(readFileSync(file, "utf-8"), kept, "an empty ledger written over it forgets every lane, task and working copy on record");

  // Reading is held to the same rule: status used to answer "No open lanes."
  const status = await h.call(sup, "supervisor", "status", {});
  assert.equal(status.ok, false);
  assert.match(status.text, /could not be read/);
  assert.doesNotMatch(status.text, /No open lanes/);
  h.runtime.dispose();
});

test("a detour hands back to the lane that was waiting on it, and cannot be opened for a lane that is not", async () => {
  const h = harness("outbox-detour.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Checkout", outcome: "an order can be paid for", acceptance: ["a"], ...scope });
  const waiting = h.ledger().lanes.L1!;

  const nowhere = await h.call(sup, "supervisor", "open_lane", { title: "Money type", outcome: "money is not a float", acceptance: ["a"], detourOf: "L7", ...scope });
  assert.equal(nowhere.ok, false, "a detour for a lane that does not exist is a letter with nowhere to go");

  const detour = await h.call(sup, "supervisor", "open_lane", { title: "Money type", outcome: "money is not a float", acceptance: ["a"], detourOf: "l1", ...scope });
  assert.equal(detour.ok, true, detour.text);
  const lane = h.ledger().lanes.L2!;
  assert.equal(lane.detourOf, "L1");
  assert.match(h.agents.get(lane.lead!)!.prompt!, /clears the way for L1/, "the detour's Lead is told to do that and no more");

  assert.equal((await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: false, reason: "done" })).ok, true);
  await h.idle(waiting.lead!);
  assert.match(h.agents.get(waiting.lead!)!.sent.join("\n"), /CLEARED L2[\s\S]*ask if your work needs it there/, "the lane that waited cannot see the other one, so it has to be told");
  h.runtime.dispose();
});

test("a lane closed while its Lead is still writing keeps the working copy until that turn ends", async () => {
  const h = harness("outbox-closerace.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Cut short", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], isolate: true });
  const lane = h.ledger().lanes.L1!;
  writeFileSync(join(lane.worktree!, "half-written.txt"), "not committed yet\n");

  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "the outcome was wrong" });
  assert.equal(closed.ok, true, closed.text);
  assert.equal(existsSync(join(lane.worktree!, "half-written.txt")), true, "the Lead is mid-turn, and removing its copy --force would take what it has not committed");
  assert.ok(h.ledger().slots[lane.slot!], "and the copy still belongs to the lane, so nothing else is sent into it");
  assert.match(closed.text, new RegExp(`put away once ${lane.lead}`), "the Supervisor is told what it is waiting on, not that the copy is free");

  h.agents.get(lane.lead!)!.status = "idle";
  await h.endTurn(lane.lead!, "stopping");
  assert.equal(existsSync(lane.worktree!), false, "once the Lead stops, the copy is put away");
  assert.equal(existsSync(dirname(lane.worktree!)), false, "and the folder the desk made for this project's copies goes with the last of them");
  assert.deepEqual(Object.keys(h.ledger().slots), []);
  assert.equal(h.git(h.root, "branch", "--list", lane.branch).trim().length > 0, true, "a lane closed without landing keeps its branch for the Human");
  h.runtime.dispose();
});

/** Three lanes as a run opens them: the first in the project's own copy, the other two in copies of their own. */
async function threeLanes(outbox: string, gate: string) {
  const h = harness(outbox);
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate });
  const scope = { outOfScope: ["anything else in the repository"] };
  for (const [title, path] of [["Part A", "a/**"], ["Part B", "b/**"], ["Part C", "c/**"]] as const) {
    const opened = await h.call(sup, "supervisor", "open_lane", { title, outcome: title, acceptance: ["done"], writeSet: [path], isolate: title !== "Part A", ...scope });
    assert.equal(opened.ok, true, opened.text);
  }
  const lanes = h.ledger().lanes;
  for (const lane of Object.values(lanes)) h.agents.get(lane.lead!)!.status = "idle";
  const work = (lane: { worktree?: string }, file: string, text = `${file}\n`) => {
    mkdirSync(join(lane.worktree!, dirname(file)), { recursive: true });
    writeFileSync(join(lane.worktree!, file), text);
    h.git(lane.worktree!, "add", "-A");
    h.git(lane.worktree!, "commit", "-qm", file);
  };
  return { h, sup, lanes, work };
}

test("a lane lands after another lane moved main, even while a third holds the project's own copy", async () => {
  const { h, sup, lanes, work } = await threeLanes("outbox-threelanes.json", "true");
  assert.equal(lanes.L1!.slot, undefined, "the first lane works in the project's own copy");
  work(lanes.L2!, "b/b.txt");
  work(lanes.L3!, "c/c.txt");

  const third = await h.call(sup, "supervisor", "close_lane", { lane: "L3", land: true });
  assert.equal(third.ok, true, third.text);
  // main moved on and the only copy on it carries L1, yet L2 must still be landed, not closed unlanded.
  const second = await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: true });
  assert.equal(second.ok, true, second.text);
  assert.doesNotMatch(second.text, /not landed/);
  assert.equal(h.git(h.root, "show", "main:b/b.txt"), "b/b.txt\n");
  assert.equal(h.git(h.root, "show", "main:c/c.txt"), "c/c.txt\n");
  assert.equal(h.git(h.root, "branch", "--list", lanes.L2!.branch, lanes.L3!.branch).trim(), "", "landed branches go with their copies");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), lanes.L1!.branch, "the lane in the project's own copy is not moved for it");
  assert.equal(h.ledger().lanes.L1!.status, "open");
  h.runtime.dispose();
});

test("the gate that lets a lane land runs on the lane with main's newer work in it", async () => {
  const { h, sup, lanes, work } = await threeLanes("outbox-mergedgate.json", "test ! -f b/b.txt || test -f c/c.txt");
  work(lanes.L2!, "b/b.txt");
  work(lanes.L3!, "c/c.txt");
  assert.equal((await h.call(sup, "supervisor", "close_lane", { lane: "L3", land: true })).ok, true);
  const second = await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: true });
  assert.equal(second.ok, true, second.text);
  assert.equal(h.git(h.root, "show", "main:b/b.txt"), "b/b.txt\n");
  h.runtime.dispose();
});

test("a lane main cannot be merged into is refused and stays open, its copy as it was", async () => {
  const { h, sup, lanes, work } = await threeLanes("outbox-lanefight.json", "true");
  work(lanes.L2!, "shared.txt", "b side\n");
  work(lanes.L3!, "shared.txt", "c side\n");
  assert.equal((await h.call(sup, "supervisor", "close_lane", { lane: "L3", land: true })).ok, true);
  const before = h.git(lanes.L2!.worktree!, "rev-parse", "HEAD");
  const second = await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: true });
  assert.equal(second.ok, false, second.text);
  assert.match(second.text, /shared\.txt/);
  assert.equal(h.ledger().lanes.L2!.status, "open", "refused before anything was closed, so it can still land");
  assert.equal(h.git(lanes.L2!.worktree!, "rev-parse", "HEAD"), before);
  assert.equal(h.git(lanes.L2!.worktree!, "status", "--porcelain"), "");
  h.runtime.dispose();
});

test("a lane closed in the project's own copy keeps that copy until its Lead stops, and the next lane waits for it or takes a copy of its own", async () => {
  const h = harness("outbox-stalerestore.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["anything else in the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "First", outcome: "x", acceptance: ["a"], ...scope });
  const first = h.ledger().lanes.L1!;
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), first.branch);

  // Closed while its Lead is mid-turn, so putting the branch back waits for that Lead.
  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "wrong outcome" });
  assert.equal(closed.ok, true, closed.text);
  assert.deepEqual(h.ledger().lanes.L1!.restoring!.writers, [first.lead!], "and the wait is on the record, not in memory");

  // Switched now, the first Lead's next commit would land on the next lane's branch.
  const asked = { title: "Second", outcome: "y", acceptance: ["a"], ...scope };
  assert.match((await h.call(sup, "supervisor", "open_lane", asked)).text, /Lane L1 is closed, but its Lead is still ending a turn in the project's own copy, which goes back to main when that turn ends\. Pass isolate/);
  assert.match((await h.call(sup, "supervisor", "status", {})).text, /Lane L1 is closed, and its Lead is ending a turn in it; it goes back to main after\./);
  const next = await h.call(sup, "supervisor", "open_lane", { ...asked, isolate: true });
  assert.equal(next.ok, true, next.text);
  const second = h.ledger().lanes.L2!;
  assert.ok(second.slot, "in a copy of its own");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), first.branch, "the copy the first Lead is writing in is not moved under it");

  h.agents.get(first.lead!)!.status = "idle";
  await h.endTurn(first.lead!, "stopping");
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "main", "once it stops, the project's copy is back on its base");
  const copy = h.ledger().slots[second.slot!]!.path;
  h.commit(copy, "a.txt", "L2 work\n");
  assert.equal(h.git(h.root, "log", "-1", "--format=%s", second.branch).trim(), "edit a.txt", "and L2's commits are on L2's branch");

  // And a Lead that never comes back at all: the round finishes what its turn was holding up.
  assert.equal((await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: false, reason: "done" })).ok, true);
  h.agents.get(second.lead!)!.archivedAt = new Date().toISOString();
  await h.tick(Date.now());
  assert.deepEqual(Object.keys(h.ledger().slots), [], "its copy is put away, not left behind for good");
  h.runtime.dispose();
});

test("a copy waiting on a seat that never ends its turn is put away in the round, not left for good", async () => {
  const h = harness("outbox-reap.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Abandoned", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], isolate: true });
  const lane = h.ledger().lanes.L1!;
  await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "the outcome was wrong" });
  assert.equal(existsSync(lane.worktree!), true, "the Lead is mid-turn, so the copy waits for it");
  assert.deepEqual(h.ledger().slots[lane.slot!]!.releasing!.writers, [lane.lead!], "and what it is waiting on is on the record, not only in memory");

  // The turn never ends: archived, crashed, or the desk restarted; nothing writes there any more.
  h.agents.get(lane.lead!)!.archivedAt = new Date().toISOString();
  await h.tick(Date.now());

  assert.equal(existsSync(lane.worktree!), false, "the round puts it away rather than leaving a copy and a workspace for good");
  assert.deepEqual(Object.keys(h.ledger().slots), []);
  h.runtime.dispose();
});

test("a copy two seats are writing in is put away by the last of them to stop, not the first", async () => {
  const h = harness("outbox-lastout.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Both in here", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"], isolate: true });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "In the lane's copy", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;
  assert.equal(h.agents.get(task.peer!)!.cwd, lane.worktree, "a lane-mode Peer writes in the lane's own copy, beside its Lead");
  writeFileSync(join(lane.worktree!, "half-written.txt"), "the Peer is mid-sentence\n");

  const closed = await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "the outcome was wrong" });
  assert.equal(closed.ok, true, closed.text);
  assert.match(closed.text, new RegExp(`${lane.lead} and ${task.peer}`), "both are named, because both are still writing there");

  h.agents.get(task.peer!)!.status = "idle";
  await h.endTurn(task.peer!, "stopping");
  assert.equal(existsSync(join(lane.worktree!, "half-written.txt")), true, "the Peer stopped, and the Lead is still in there");
  assert.ok(h.ledger().slots[lane.slot!], "so the copy is still the lane's");

  h.agents.get(lane.lead!)!.status = "idle";
  await h.endTurn(lane.lead!, "stopping too");
  assert.equal(existsSync(lane.worktree!), false, "the last one out puts it away");
  assert.deepEqual(Object.keys(h.ledger().slots), []);
  h.runtime.dispose();
});

test("with gateOn task, the gate really runs on a lane-mode task and the Lead is told the result, not a description", async () => {
  const h = harness("outbox-taskgate.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "test ! -f BROKEN", gateOn: "task" });
  const scope = { outOfScope: ["the rest of the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;

  await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"], ...scope });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  h.commit(lane.worktree!, "a.txt", "one\ntwo\nthree\nfour\n");
  await h.call(peer, "peer", "done", { outcome: "complete", summary: "four" });
  h.agents.get(peer)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);

  // The task is on the default, non-parallel path — the one where the task gate used to be skipped in silence.
  await h.idle(lane.lead!);
  const letter = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(letter, /MERGED L1-T1/);
  assert.match(letter, /Gate: test ! -f BROKEN passed in/, "the Lead has to be told what the gate did, not what it would do later");
  assert.doesNotMatch(letter, /Gate: runs on the whole lane/, "gateOn task means the lane note is a lie for this task");
});

test("a red task gate reaches the Lead with the hand-back, and landing it anyway is the Lead's call", async () => {
  const h = harness("outbox-gateundo.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "echo red; exit 1", gateOn: "task" });
  await h.call(sup, "supervisor", "open_lane", { title: "Bee", outcome: "b.txt changes", acceptance: ["b"], outOfScope: ["anything else in the repository"], writeSet: ["b.txt"] });
  const lane = h.ledger().lanes.L1!;
  const started = await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], outOfScope: ["the rest of the repository"], parallel: true });
  assert.equal(started.ok, true, started.text);
  const task = h.ledger().tasks["L1-T1"]!;
  h.commit(task.worktree!, "b.txt", "B\n");
  await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "b" });

  // LEAD.md promises the per-task verdict with the hand-back, as evidence and not a veto.
  await h.idle(lane.lead!);
  const handback = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(handback, /Gate: echo red; exit 1: the gate failed with exit 1/);
  assert.match(handback, /evidence for your decision, not a decision/);

  h.agents.get(task.peer!)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);
  await h.runtime.desk.settled(h.project);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged", "accepted with the verdict in hand, it lands");
  assert.match(h.git(lane.worktree!, "log", "-1", "--format=%s"), /^Merge L1-T1/);
  h.runtime.dispose();
});

test("a commit made while the lane's copy is off its branch is not accepted as landed", async () => {
  const h = harness("outbox-detached.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Regression", outcome: "the bug goes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Find it", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;

  // What a bisect leaves behind: a clean copy, on no branch, with the fix committed into nothing.
  h.git(lane.worktree!, "checkout", "-q", "--detach", "HEAD");
  h.commit(lane.worktree!, "a.txt", "fixed at the source\n");
  const handed = await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "found and fixed it" });
  assert.equal(handed.ok, true, "the hand-back is not refused — the Peer is told, while it can still put it right");
  assert.match(handed.text, new RegExp(`not on ${lane.branch} any more`));
  assert.match(handed.text, /git bisect reset/);

  h.agents.get(task.peer!)!.status = "idle";
  const accepted = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(accepted.ok, false, "clean and detached is what the desk used to read as landed");
  assert.match(accepted.text, /nothing committed in it is on the lane branch/);
  assert.equal(h.git(lane.worktree!, "show", `${lane.branch}:a.txt`), "one\ntwo\nthree\n", "and the lane branch really does not have it");
  h.runtime.dispose();
});

test("a task cannot be told to open a skill its Peer does not have", async () => {
  const h = harness("outbox-skills.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Skilled", outcome: "x", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  const scope = { goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] };

  // Nothing in a Lead's context lists the Peer's skills, so a guessed one must be refused.
  const guessed = await h.call(lane.lead!, "lead", "start_task", { title: "Guessed", ...scope, skills: ["tdd"] });
  assert.equal(guessed.ok, false);
  assert.match(guessed.text, /no skill called tdd/);
  assert.match(guessed.text, /They have: /, "and the refusal is where the Lead finds out what there is");

  const real = guessed.text.split("They have: ")[1]!.replace(/\.$/, "").split(", ")[0]!;
  const named = await h.call(lane.lead!, "lead", "start_task", { title: "Named", ...scope, skills: [real] });
  assert.equal(named.ok, true, named.text);
  const started = Object.values(h.ledger().tasks).find((task) => task.title === "Named")!;
  assert.match(h.agents.get(started.peer!)!.prompt!, new RegExp(`Skills to open: ${real}`));
  assert.equal(Object.values(h.ledger().tasks).some((task) => task.title === "Guessed"), false, "a refused task does not take an id either");
  h.runtime.dispose();
});

test("a hand-back the Lead has not accepted still holds the lane's copy, so nothing is sent in beside it", async () => {
  const h = harness("outbox-holds.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["the rest of the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Two in a row", outcome: "a and b change", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "A", goal: "g", acceptance: ["a"], owned: ["a.txt"], ...scope });
  const first = h.ledger().tasks["L1-T1"]!;
  h.commit(lane.worktree!, "a.txt", "A\n");
  await h.call(first.peer!, "peer", "done", { outcome: "complete", summary: "a" });
  h.agents.get(first.peer!)!.status = "idle";

  // Its Peer is still seated and rework would wake it in that directory, so the copy is not free yet.
  const second = await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], ...scope });
  assert.equal(second.ok, false);
  assert.match(second.text, /L1-T1 has handed back and is waiting on you/);
  assert.match(second.text, /Accept or cut it first/, "and the way out is named");

  // With the second task never started, the copy is clean and the first accepts as it always did.
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);
  const now = await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], ...scope });
  assert.equal(now.ok, true, now.text);

  // And a rework that would wake a Peer into another task's writing is refused, not prescribed.
  const back = await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "commit it" });
  assert.equal(back.ok, false);
  assert.match(back.text, /is merged/, "an accepted task has nothing to rework");
  await h.call(lane.lead!, "lead", "start_task", { title: "C", goal: "g", acceptance: ["c"], owned: ["c.txt"], ...scope, parallel: true });
  const par = Object.values(h.ledger().tasks).find((task) => task.title === "C")!;
  writeFileSync(join(lane.worktree!, "b.txt"), "half\n");
  const reworkPar = await h.call(lane.lead!, "lead", "rework", { task: par.id, text: "again" });
  assert.equal(reworkPar.ok, true, "a parallel task has a copy of its own, so its rework is nobody else's business");
  h.runtime.dispose();
});

test("a task whose honest answer is that nothing needed changing can be accepted, not only cut", async () => {
  const h = harness("outbox-nochange.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Audit", outcome: "the parser is checked", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Check the parser", goal: "find out whether it drops input", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;

  // The Peer investigates, finds the code already correct, and commits nothing. That is a real outcome.
  await h.call(peer, "peer", "done", { outcome: "nothing needed changing", summary: "the parser already handles it" });
  h.agents.get(peer)!.status = "idle";
  const accepted = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(accepted.ok, true, accepted.text);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged", "the Lead judges the hand-back; the desk does not decide that no diff means no work");

  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /changed no files/, "the letter says plainly that nothing moved");
});

test("a seat reaches only the tools its own role holds, whatever it asks for", async () => {
  const h = harness("outbox-reach.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Work", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Edit", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;

  // The tool exists on the desk, and this seat's role is not given it.
  const reach = await h.call(peer, "peer", "open_lane", { title: "Mine", outcome: "x", acceptance: ["y"], outOfScope: ["z"] });
  assert.equal(reach.ok, false);
  assert.match(reach.text, /Unknown tool open_lane/);
  assert.equal(Object.keys(h.ledger().lanes).length, 1, "nothing was opened");

  // And a seat cannot borrow another role's name to get at them either.
  const borrowed = await h.call(peer, "lead", "start_task", { title: "Mine", goal: "g", acceptance: ["a"], owned: ["b.txt"], outOfScope: ["z"] });
  assert.equal(borrowed.ok, false);
  assert.match(borrowed.text, /lead tools are not available to it/);
});

test("two supervising seats hold one project, and each lane's mail goes to the seat that opened it", async () => {
  const h = harness("outbox-two-sups.json");
  const architecture = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "architecture");
  const safety = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "safety");
  const scope = { outOfScope: ["anything else"] };

  await h.call(architecture, "supervisor", "open_lane", { title: "Schema", outcome: "the schema moves", acceptance: ["a"], ...scope });
  // The hole found mid-lane gets its own Lead and its own copy, rather than the first lane widening to swallow it.
  await h.call(safety, "supervisor", "open_lane", { title: "Permissions", outcome: "writes are checked", acceptance: ["a"], isolate: true, detourOf: "L1", ...scope });
  const lanes = h.ledger().lanes;
  assert.equal(lanes.L1!.opener, architecture);
  assert.equal(lanes.L2!.opener, safety);
  assert.equal(lanes.L2!.detourOf, "L1");
  assert.match(h.agents.get(lanes.L2!.lead!)!.prompt ?? "", /clears the way for L1/, "the detour's Lead is told what it is unblocking");

  await h.call(lanes.L1!.lead!, "lead", "report", { summary: "schema done", ready: false });
  await h.call(lanes.L2!.lead!, "lead", "report", { summary: "permissions done", ready: false });
  await h.idle(architecture);
  await h.idle(safety);
  assert.match(h.agents.get(architecture)!.sent.join("\n"), /schema done/);
  assert.doesNotMatch(h.agents.get(architecture)!.sent.join("\n"), /permissions done/, "one supervising seat does not read another's lane");
  assert.match(h.agents.get(safety)!.sent.join("\n"), /permissions done/);
});

test("reaching a Peer directly tells its Lead what reached it, and is refused when there is no Lead to tell", async () => {
  const h = harness("outbox-reconcile.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Pricing", outcome: "discounts round correctly", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Round", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const task = h.ledger().tasks["L1-T1"]!;

  const reached = await h.call(sup, "supervisor", "message", { to: "L1-T1", text: "Use banker's rounding, not half-up." });
  assert.equal(reached.ok, true, reached.text);
  await h.idle(task.peer!);
  await h.idle(lane.lead!);
  assert.match(h.agents.get(task.peer!)!.sent.join("\n"), /banker's rounding/);

  // The Lead is not merely copied: it is given back the five things it needs to hold the room's state.
  const toLead = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(toLead, /RECONCILE L1/);
  assert.match(toLead, /banker's rounding/, "what reached the Peer");
  assert.match(toLead, /Current intent: discounts round correctly/);
  assert.match(toLead, /Ownership: L1-T1 .* is still owned by/);
  assert.match(toLead, /Topology: unchanged/);
  assert.match(toLead, /Integration and acceptance: unchanged/);

  // The same instruction again is a second instruction, not a repeat to drop by its words.
  await h.idle(task.peer!);
  await h.idle(lane.lead!);
  assert.equal((await h.call(sup, "supervisor", "message", { to: "L1-T1", text: "Use banker's rounding, not half-up." })).ok, true);
  await h.idle(task.peer!);
  await h.idle(lane.lead!);
  assert.equal(h.agents.get(task.peer!)!.sent.join("\n").split("banker's rounding").length - 1, 2, "both reached the Peer");
  assert.equal(h.agents.get(lane.lead!)!.sent.join("\n").split("RECONCILE L1").length - 1, 2, "and the Lead was told both times");

  // With no Lead to reconcile to, the intervention is refused rather than run behind its back.
  Object.assign(h.agents.get(lane.lead!)!, { archivedAt: new Date().toISOString(), status: "closed" });
  const orphaned = await h.call(sup, "supervisor", "message", { to: "L1-T1", text: "One more thing." });
  assert.equal(orphaned.ok, false);
  assert.match(orphaned.text, /no running Lead/);

  // A task already cut has no Peer left to steer.
  await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false });
  const cut = await h.call(sup, "supervisor", "message", { to: "L1-T1", text: "One more thing." });
  assert.equal(cut.ok, false);
  assert.match(cut.text, /L1-T1 is cut/);
});

test("an ask answered by the owner over a Lead's head is told to that Lead, not run behind its back", async () => {
  const h = harness("outbox-answeredfor.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Columns", outcome: "the column goes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Drop it", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] });
  const task = h.ledger().tasks["L1-T1"]!;

  // Unanswered asks escalate to the owner, so the owner answering one is the design.
  const asked = await h.call(task.peer!, "peer", "ask", { question: "Drop the column or keep it nullable?", tried: "read the migration" });
  assert.equal(asked.ok, true, asked.text);
  const ask = Object.values(h.ledger().asks)[0]!;
  assert.equal(ask.to, lane.lead, "an ask goes upward, to the Lead");

  const answered = await h.call(sup, "supervisor", "answer", { ask: ask.id, text: "Drop it and migrate." });
  assert.equal(answered.ok, true, answered.text);
  await h.idle(task.peer!);
  assert.match(h.agents.get(task.peer!)!.sent.join("\n"), /Drop it and migrate/, "the Peer gets its answer");

  await h.idle(lane.lead!);
  const toLead = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(toLead, new RegExp(`ANSWERED FOR YOU: ${ask.id}`), "the Lead cannot hold the room's state on an answer it never saw");
  assert.match(toLead, /Drop it and migrate/);
  assert.match(toLead, /accepting it is still yours to judge/);
  h.runtime.dispose();
});

test("a seat opening in a project writes the team's block there, and the first lane still takes the copy the Human left clean", async () => {
  const h = harness("outbox-team-file.json");
  const open = (h.runtime as unknown as { openSession(request: { provider: string; cwd: string; env: Record<string, string> }): unknown }).openSession.bind(h.runtime);
  open({ provider: "sw2-supervisor-claude", cwd: h.root, env: {} });
  assert.match(readFileSync(join(h.root, "AGENTS.md"), "utf-8"), /seatworks:begin[\s\S]*## Working here as a team/);
  assert.match(readFileSync(join(h.root, "CLAUDE.md"), "utf-8"), /^@AGENTS\.md$/m);
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");

  // Untracked, and nothing of the Human's: the lane takes the copy as if it were clean.
  const first = await h.call(sup, "supervisor", "open_lane", { title: "First", outcome: "x", acceptance: ["y"], outOfScope: ["z"] });
  assert.equal(first.ok, true, first.text);
  assert.doesNotMatch(first.text, /not committed/, "a lane in the project's own copy has the block where it stands");
  // A copy of its own is made from what is committed, so that lane starts without the team's rules.
  const own = await h.call(sup, "supervisor", "open_lane", { title: "Own", outcome: "x", acceptance: ["y"], outOfScope: ["z"], isolate: true });
  assert.equal(own.ok, true, own.text);
  assert.match(own.text, /team block in AGENTS\.md and CLAUDE\.md is not committed/);
  await h.call(sup, "supervisor", "close_lane", { lane: "L2", land: false, reason: "done" });
  const lead = h.ledger().lanes.L1!.lead!;
  await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "done" });
  h.agents.get(lead)!.status = "idle";
  await h.endTurn(lead, "done");

  // The Human's own line in the same file is their work in progress, and a lane does not carry it off.
  writeFileSync(join(h.root, "AGENTS.md"), `Use pnpm.\n\n${readFileSync(join(h.root, "AGENTS.md"), "utf-8")}`);
  const second = await h.call(sup, "supervisor", "open_lane", { title: "Second", outcome: "x", acceptance: ["y"], outOfScope: ["z"] });
  assert.equal(second.ok, false);
  assert.match(second.text, /uncommitted changes/);
});

test("the team's block left uncommitted in the project's own copy does not hold up accepting or reporting the lane there", async () => {
  const h = harness("outbox-team-file-accept.json");
  const open = (h.runtime as unknown as { openSession(request: { provider: string; cwd: string; env: Record<string, string> }): unknown }).openSession.bind(h.runtime);
  open({ provider: "sw2-supervisor-claude", cwd: h.root, env: {} });
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "set_project", { gate: "true" });
  assert.equal((await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "x", acceptance: ["y"], outOfScope: ["z"] })).ok, true);
  const lane = h.ledger().lanes.L1!;
  assert.deepEqual(Object.keys(h.ledger().slots), [], "the lane works in the project's own copy, where the block is");
  await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const task = h.ledger().tasks["L1-T1"]!;
  writeFileSync(join(h.root, "a.txt"), "four\n");
  h.git(h.root, "commit", "-qam", "add four");
  const done = await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "four" });
  assert.doesNotMatch(done.text, /uncommitted/);
  h.agents.get(task.peer!)!.status = "idle";
  const accepted = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(accepted.ok, true, accepted.text);
  const reported = await h.call(lane.lead!, "lead", "report", { summary: "four is in", ready: true });
  assert.equal(reported.ok, true, reported.text);
  assert.match(readFileSync(join(h.project.state, "events.log"), "utf-8"), /"gate.passed"/, "the gate ran instead of refusing the copy");
  assert.match(h.git(h.root, "status", "--porcelain"), /AGENTS\.md/, "the block is still the Human's to commit");
  h.runtime.dispose();
});

test("a Lead is pointed at the project's concept once the Human has settled one, and set_project keeps no pages", async () => {
  const h = harness("outbox-concept.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");

  // Nothing is written for the Supervisor, and a Lead is not sent to read a file that is not there.
  await h.call(sup, "supervisor", "open_lane", { title: "First", outcome: "x", acceptance: ["y"], outOfScope: ["z"], writeSet: ["a.txt"] });
  const first = h.ledger().lanes.L1!;
  assert.equal(existsSync(join(h.project.state, "CONTEXT.md")), false);
  assert.doesNotMatch(h.agents.get(first.lead!)!.prompt ?? "", /CONTEXT\.md/);

  writeFileSync(join(h.project.state, "CONTEXT.md"), "# Shop\n\n## Behavior\n\n- A guest may check out.\n");
  await h.call(sup, "supervisor", "open_lane", { title: "Second", outcome: "x", acceptance: ["y"], outOfScope: ["z"], writeSet: ["b.txt"], isolate: true });
  const second = h.ledger().lanes.L2!;
  const directive = h.agents.get(second.lead!)!.prompt ?? "";
  assert.match(directive, new RegExp(`is in ${join(h.project.state, "CONTEXT.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. Read it before you start`));
  assert.match(directive, /ask with kind question, and leave the file as it is/, "it is the Human's word, not the Lead's to edit");

  const pages = await h.call(sup, "supervisor", "set_project", { docs: ["decision"] });
  assert.equal(pages.ok, false, "the shelf of pages is gone, and so is the argument that kept them");
});

test("a review hands back a verdict and its findings, and the Lead is told both", async () => {
  const h = harness("outbox-review.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Rounding", outcome: "money rounds correctly", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Round", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  h.commit(lane.worktree!, "a.txt", "rounded\n");
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  await h.call(peer, "peer", "done", { outcome: "complete", summary: "rounded" });
  h.agents.get(peer)!.status = "idle";

  const opened = await h.call(lane.lead!, "lead", "start_review", { task: "L1-T1", focus: "Is half-up right for money here?" });
  assert.equal(opened.ok, true, opened.text);
  const review = Object.values(h.ledger().tasks).find((task) => task.kind === "review")!;
  const reviewer = review.peer!;

  // A reviewer hands back a judgement in its own tool set's words, which must reach the Lead intact.
  const handed = await h.call(reviewer, "reviewer", "done", {
    verdict: "accept",
    findings: "P3 a.txt:1 — banker's rounding would be safer at the boundary, but half-up matches the spec.",
    checks: "Read the diff and ran the rounding cases.",
  });
  assert.equal(handed.ok, true, handed.text);
  assert.equal(h.ledger().tasks[review.id]!.handback?.outcome, "accept", "an accepted review is recorded as accepted, not as changes");

  await h.idle(lane.lead!);
  const toLead = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(toLead, /Verdict: accept/);
  assert.match(toLead, /banker's rounding would be safer/, "the review itself reaches the Lead rather than being dropped");
});

test("a copy a reviewer is reading is not taken away when the task it reviews is accepted", async () => {
  const h = harness("outbox-reviewshare.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["the rest of the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Reviewed", outcome: "a changes", acceptance: ["a"], outOfScope: ["anything else in the repository"], writeSet: ["a.txt"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "A", goal: "g", acceptance: ["a"], owned: ["a.txt"], ...scope, parallel: true });
  const task = h.ledger().tasks["L1-T1"]!;
  h.commit(task.worktree!, "a.txt", "A\n");
  await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "a" });
  h.agents.get(task.peer!)!.status = "idle";

  // The documented way to review a task's commits: it reads them in that task's own working copy.
  assert.equal((await h.call(lane.lead!, "lead", "start_review", { task: "L1-T1", focus: "Is this right at the boundary?" })).ok, true);
  const review = Object.values(h.ledger().tasks).find((entry) => entry.kind === "review")!;
  assert.equal(review.slot, task.slot, "the ledger says which copy the reviewer is living in");

  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);
  await h.runtime.desk.settled(h.project);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged");
  assert.equal(existsSync(review.worktree!), true, "the reviewer is mid-turn, and its verdict is what the Lead was told to wait for");

  h.agents.get(review.peer!)!.status = "idle";
  await h.endTurn(review.peer!, "verdict sent");
  assert.equal(existsSync(review.worktree!), false, "once it stops, the copy goes as it always did");

  // A copy already marked for teardown goes when the task's Peer ends its turn, so no review is seated in it.
  await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], ...scope, parallel: true });
  const second = Object.values(h.ledger().tasks).find((entry) => entry.title === "B")!;
  h.commit(second.worktree!, "b.txt", "B\n");
  await h.call(second.peer!, "peer", "done", { outcome: "complete", summary: "b" });
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: second.id })).ok, true);
  await h.runtime.desk.settled(h.project);
  assert.ok(h.ledger().slots[second.slot!]?.releasing, "its Peer is mid-turn, so the copy is waiting to be put away");

  assert.equal((await h.call(lane.lead!, "lead", "start_review", { task: second.id, focus: "and this one?" })).ok, true);
  const late = Object.values(h.ledger().tasks).find((entry) => entry.kind === "review" && entry.of === second.id)!;
  assert.notEqual(late.worktree, second.worktree, "it reads the merge from the lane's copy instead");
  assert.match(h.agents.get(late.peer!)!.prompt!, /as the merge/);
  h.runtime.dispose();
});

test("a review of a parallel task whose copy went back is pointed at the merge that holds the change", async () => {
  const h = harness("outbox-reviewgone.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  const scope = { outOfScope: ["the rest of the repository"] };
  await h.call(sup, "supervisor", "open_lane", { title: "Two files", outcome: "both change", acceptance: ["a"], outOfScope: ["anything else in the repository"], writeSet: ["a.txt", "b.txt"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "A", goal: "g", acceptance: ["a"], owned: ["a.txt"], ...scope, parallel: true });
  const task = h.ledger().tasks["L1-T1"]!;
  h.commit(task.worktree!, "a.txt", "A\n");
  await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "a" });
  h.agents.get(task.peer!)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);
  await h.runtime.desk.settled(h.project);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged");
  assert.equal(Object.keys(h.ledger().slots).length, 0, "the copy the task worked in has gone back");

  const opened = await h.call(lane.lead!, "lead", "start_review", { task: "L1-T1", focus: "Does this hold at the boundary?" });
  assert.equal(opened.ok, true, opened.text);
  const review = Object.values(h.ledger().tasks).find((entry) => entry.kind === "review")!;
  const merge = h.ledger().tasks["L1-T1"]!.mergeSha!;
  const brief = h.agents.get(review.peer!)!.prompt!;
  assert.match(brief, new RegExp(`The change is in ${lane.branch}, as the merge ${merge.slice(0, 7)}`), "its own copy and branch are both gone once the work lands");
  assert.match(brief, new RegExp(`git diff ${merge}\\^1\\.\\.${merge}`), "a range that shows nothing is a review of nothing");
  assert.equal(h.git(lane.worktree!, "diff", "--name-only", `${merge}^1..${merge}`).trim(), "a.txt", "and the range really shows the task's work");

  // A task cut before it committed leaves neither a copy nor a branch, and there is nothing to read.
  await h.call(lane.lead!, "lead", "start_task", { title: "B", goal: "g", acceptance: ["b"], owned: ["b.txt"], ...scope, parallel: true });
  const empty = Object.values(h.ledger().tasks).find((entry) => entry.title === "B")!;
  const cutReply = await h.call(lane.lead!, "lead", "cut", { task: empty.id, reason: "wrong shape" });
  assert.equal(cutReply.ok, true, cutReply.text);
  assert.equal(h.git(h.root, "branch", "--list", empty.branch!).trim(), "", "a cut task with no commits of its own leaves no branch behind");
  const nothing = await h.call(lane.lead!, "lead", "start_review", { task: empty.id, focus: "anything?" });
  assert.equal(nothing.ok, false);
  assert.match(nothing.text, /neither a merge nor a branch is left to read it from/);
  h.runtime.dispose();
});

test("a task branch is dropped once its work is in the lane's, whichever branch the project's own copy is on", async () => {
  const h = harness("outbox-branchdrop.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  // The lane's own copy keeps the project's copy on main, which is what `git branch -d` would read.
  await h.call(sup, "supervisor", "open_lane", { title: "Apart", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"], isolate: true });
  const lane = h.ledger().lanes.L1!;
  assert.equal(h.git(h.root, "branch", "--show-current").trim(), "main");
  await h.call(lane.lead!, "lead", "start_task", { title: "A", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"], parallel: true });
  const task = h.ledger().tasks["L1-T1"]!;
  h.commit(task.worktree!, "a.txt", "A\n");
  await h.call(task.peer!, "peer", "done", { outcome: "complete", summary: "a" });
  h.agents.get(task.peer!)!.status = "idle";
  assert.equal((await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" })).ok, true);
  await h.runtime.desk.settled(h.project);

  assert.equal(h.ledger().tasks["L1-T1"]!.status, "merged");
  assert.equal(h.git(lane.worktree!, "show", `${lane.branch}:a.txt`), "A\n", "the work is in the lane's branch");
  assert.equal(h.git(h.root, "branch", "--list", task.branch!).trim(), "", "and its own branch has nothing the lane does not, so it goes");
  h.runtime.dispose();
});

test("a task goes to a role that writes, and a review to one that reads, and neither stands in for the other", async () => {
  const h = harness("outbox-lenses.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["anything else in the repository"] });
  const lane = h.ledger().lanes.L1!;

  // The preset's Reviewer holds `work` for routing but is denied every write, so it is no second kind of Peer.
  const readOnly = await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"], role: "reviewer" });
  assert.equal(readOnly.ok, false, "a role that only reads cannot be given a task to write");
  assert.match(readOnly.text, /no reviewer that can take a task/i);
  assert.match(readOnly.text, /peer/, "and the refusal names who can, rather than recommending the one that cannot");
  assert.deepEqual(Object.keys(h.ledger().tasks), [], "and nothing was started or recorded");

  const wrongLens = await h.call(lane.lead!, "lead", "start_review", { focus: "Is the rounding right?", role: "peer" });
  assert.equal(wrongLens.ok, false);
  assert.match(wrongLens.text, /no peer that can review/i);
  assert.match(wrongLens.text, /reviewer/, "the refusal names what there is to choose from");

  const byDefault = await h.call(lane.lead!, "lead", "start_task", { title: "Add five", goal: "g", acceptance: ["a"], owned: ["b.txt"], outOfScope: ["the rest"] });
  assert.equal(byDefault.ok, true, byDefault.text);
  const seated = Object.values(h.ledger().tasks).find((task) => task.title === "Add five")!;
  assert.match(h.agents.get(seated.peer!)!.provider, /peer/, "left out, it is the preset's own default");
  h.runtime.dispose();
});

test("two projects on one daemon both name their first task L1-T1, and both Leads are told when their Peer is gone", async () => {
  const h = harness("outbox-twoprojects.json");
  const second = repo();
  const other = projectOf(second.root);

  const open = async (where: string, name: string) => {
    const sup = h.add("sw2-supervisor-claude/claude-opus-5", where, name);
    await h.call(sup, "supervisor", "open_lane", { title: "Numbers", outcome: "a.txt gains words", acceptance: ["four"], outOfScope: ["the rest"] }, where);
    const lane = h.ledger(where === h.root ? undefined : other).lanes.L1!;
    await h.call(lane.lead!, "lead", "start_task", { title: "Add four", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] }, where);
    return lane;
  };
  const here = await open(h.root, "sup-a");
  const there = await open(second.root, "sup-b");

  const mine = h.ledger().tasks.L1_T1 ?? h.ledger().tasks["L1-T1"]!;
  const theirs = h.ledger(other).tasks["L1-T1"]!;
  assert.equal(mine.id, theirs.id, "the two ledgers really do use the same task id");

  for (const task of [mine, theirs]) h.agents.get(task.peer!)!.archivedAt = new Date().toISOString();
  await h.tick(Date.now());
  await h.idle(here.lead!);
  await h.idle(there.lead!);

  assert.match(h.agents.get(here.lead!)!.sent.join("\n"), /the Peer on L1-T1/, "the first project's Lead is told");
  assert.match(h.agents.get(there.lead!)!.sent.join("\n"), /the Peer on L1-T1/, "and so is the second's — the letter key and the seen-it flag are per project");
  assert.equal(h.ledger(other).tasks["L1-T1"]!.status, "stalled", "and the second project's task is recorded stalled, not skipped");
  h.runtime.dispose();
});

test("a Peer stopped on a question is answered by its Lead's message, and one stopped on anything else waits for the Human", async () => {
  const h = harness("outbox-question.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Colours", outcome: "the button is coloured", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Colour", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  const question: Pending = {
    id: "permission-1",
    kind: "question",
    name: "AskUserQuestion",
    title: "Which colour should the button be?",
    input: { questions: [{ question: "Which colour should the button be?", header: "Colour", options: [{ label: "Blue" }, { label: "Green" }] }] },
  };
  h.agents.get(peer)!.pending.push(question);
  await h.permission(peer, question);
  await h.idle(lane.lead!);
  const letter = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(letter, /WAITING FOR PERMISSION/);
  assert.match(letter, /1\. Which colour should the button be\?\n {3}Options: Blue \/ Green/, "the question itself, not only that there is one");
  assert.match(letter, /`message` to L1-T1/);

  // The Peer reads nothing until the question is answered, so a message held for it would never land.
  const answered = await h.call(lane.lead!, "lead", "message", { to: "L1-T1", text: "Blue, to match the header." });
  assert.equal(answered.ok, true, answered.text);
  assert.match(answered.text, /as the answer/);
  const words = "From your lead: Blue, to match the header.";
  assert.deepEqual(h.agents.get(peer)!.answered, [
    { requestId: "permission-1", response: { behavior: "allow", updatedInput: { answers: { "Which colour should the button be?": words, Colour: words } } } },
  ]);
  await h.idle(peer);
  assert.doesNotMatch(h.agents.get(peer)!.sent.join("\n"), /Blue, to match/, "answered once, not also mailed");

  // Leave to run something is the Human's to give; the desk answers nothing on anyone's behalf.
  const command: Pending = { id: "permission-2", kind: "tool", name: "Bash", title: "rm -rf build" };
  h.agents.get(peer)!.pending.push(command);
  await h.permission(peer, command);
  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /Bash: rm -rf build\n\nOnly the Human can answer this/);
  const held = await h.call(lane.lead!, "lead", "message", { to: "L1-T1", text: "Go ahead." });
  assert.equal(held.ok, true, held.text);
  assert.match(held.text, /stopped on a permission only the Human can give/);
  assert.equal(h.agents.get(peer)!.answered.length, 1);
  assert.equal(h.runtime.outbox.pending(peer).length, 1, "and the message waits for it");
});

test("mail reaches a running seat inside its turn where its harness can take it there, and waits where it cannot", async () => {
  const h = harness("outbox-steer.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Pricing", outcome: "discounts round correctly", acceptance: ["a"], outOfScope: ["anything else"] });
  const lane = h.ledger().lanes.L1!;
  await h.call(lane.lead!, "lead", "start_task", { title: "Round", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest"] });
  const peer = h.ledger().tasks["L1-T1"]!.peer!;
  assert.equal(h.agents.get(lane.lead!)!.status, "running");
  assert.equal(h.agents.get(peer)!.status, "running");

  // Paseo turns a steer the provider cannot take yet into replacing the turn, so a new turn is left alone.
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    h.beginTurn(lane.lead!);
    h.beginTurn(peer);
    const early = await h.call(sup, "supervisor", "message", { to: "L1", text: "Is the premise right?" });
    assert.match(early.text, /Queued for the Lead of L1/);
    mock.timers.tick(2 * 60_000);
    await h.tick();
    assert.match(h.agents.get(lane.lead!)!.steered.join("\n"), /Is the premise right\?/, "the round delivers it once the turn has settled");

    const toLead = await h.call(sup, "supervisor", "message", { to: "L1", text: "Stop: the premise is wrong." });
    assert.match(toLead.text, /Delivered to the Lead of L1/);
    assert.match(h.agents.get(lane.lead!)!.steered.join("\n"), /the premise is wrong/, "the Lead's harness takes it mid-turn");

    const toPeer = await h.call(lane.lead!, "lead", "message", { to: "L1-T1", text: "Stop: the premise is wrong." });
    assert.match(toPeer.text, /Queued for the Peer on L1-T1/);
    assert.deepEqual(h.agents.get(peer)!.sent, [], "the Peer's harness cannot, and sending would replace its turn");
  } finally {
    mock.timers.reset();
  }
});

const watchersOf = (h: ReturnType<typeof harness>) => [...h.agents.values()].filter((agent) => agent.provider.startsWith("sw2-watcher-"));
const bySeat = (extra: Record<string, unknown> = {}) => ({ attention: { by: "seat", ...extra } });

test("by a seat, one Watcher sits in the project while a lane is open, on the Peer's agent, and goes when the lanes do", async () => {
  const h = harness("outbox-watcher-seat.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify(bySeat()));
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.tick();
  assert.deepEqual(watchersOf(h), [], "no lane, no Watcher");
  await h.call(sup, "supervisor", "open_lane", { title: "Build", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  await h.tick();
  await h.tick();
  const [watcher, ...more] = watchersOf(h);
  assert.deepEqual(more, [], "one, however many rounds find it");
  assert.equal(watcher!.provider, "sw2-watcher-devin/swe-2-max", "on the Peer's agent and model, nothing having been set for it");
  assert.equal(watcher!.cwd, h.project.root, "in the project, not in a lane's copy");
  assert.equal(watcher!.status, "running");

  // Its turn is let finish before it goes, as a Lead's is.
  const lane = h.ledger().lanes.L1!;
  h.agents.get(lane.lead!)!.status = "idle";
  await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false, reason: "done" });
  await h.tick();
  assert.equal(watcher!.archivedAt, null, "not archived mid-turn");
  watcher!.status = "idle";
  await h.tick();
  assert.ok(watcher!.archivedAt, "and archived once idle, with no lane left to watch");
  h.runtime.dispose();
});

test("by Jev there is no Watcher, and one already seated is let go", async () => {
  const h = harness("outbox-watcher-jev.json");
  const settings = join(HOME, ".local", "share", "seatworks-v2", "settings.json");
  writeFileSync(settings, JSON.stringify(bySeat()));
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Build", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  await h.tick();
  const [watcher] = watchersOf(h);
  watcher!.status = "idle";
  writeFileSync(settings, JSON.stringify({ attention: { by: "jev" } }));
  await h.tick();
  assert.ok(watcher!.archivedAt);
  await h.tick();
  assert.equal(watchersOf(h).filter((agent) => !agent.archivedAt).length, 0);
  h.runtime.dispose();
});

test("a Watcher reads what a Peer did, said and thought as it works, never a key, and only what is new", async () => {
  const { h, peer, timeline } = await laneWithPeer("outbox-reading.json", bySeat());
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "reasoning", text: "The suite is red; deleting the failing test would make it pass." }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "OPENROUTER_API_KEY=sk-or-v1-0123456789abcdef0123 npm test", output: "1 failing", exitCode: 1 } }, "t1");
  timeline.add({ type: "assistant_message", text: "Done, all green." }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.idle(watcher!.id);
  // A failed call is read at once, mid-turn; the turn's end brings what came after it.
  const first = watcher!.sent.join("\n");
  assert.match(first, new RegExp(`READING R1 of the Peer on L1-T1 \\(Clean build\\), agent ${peer}\\. It is still working\\.`));
  assert.match(first, /What it was asked:\nTask L1-T1: Clean build\nGoal: g/, "the brief, the first time");
  assert.match(first, /R1\.S1 thought: The suite is red; deleting the failing test would make it pass\./, "what it thought, as a step it can be held to");
  assert.match(first, /R1\.S2 ran: .*npm test \(failed, exit 1\) → 1 failing/, "what it ran and what that printed");
  assert.match(first, /READING R2 [^\n]*Its turn has ended\.[\s\S]*It ended on: R2\.S3 said: Done, all green\./, "and what it claimed, apart from the evidence");
  assert.doesNotMatch(first, /sk-or-v1-0123/, "a key it typed is never mailed on");
  assert.equal(first.match(/What it was asked/g)!.length, 1);

  timeline.beat("turn_started", "t2");
  timeline.add({ type: "tool_call", callId: "c2", name: "Bash", status: "completed", detail: { type: "shell", command: "npm run lint", output: "clean" } }, "t2");
  timeline.beat("turn_completed", "t2");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.idle(watcher!.id);
  const third = watcher!.sent.at(-1)!;
  assert.match(third, /READING R3 /);
  assert.match(third, /R3\.S4 ran: npm run lint → clean/);
  assert.doesNotMatch(third, /What it was asked|The suite is red|npm test|all green/, "nothing it has already been shown is sent again");
  assert.equal(h.runtime.outbox.letters().filter((letter) => letter.to === peer).length, 0, "and nothing of it is queued for the Peer");
  h.runtime.dispose();
});

test("a reading never steers into a Watcher's turn: it waits, and what came meanwhile arrives with it", async () => {
  const { h, timeline } = await laneWithPeer("outbox-reading-held.json", { ...bySeat(), roles: { watcher: { harness: "claude" } } });
  const [watcher] = watchersOf(h);
  assert.equal(watcher!.provider, "sw2-watcher-claude/claude-opus-5", "on an agent that takes a message into a running turn");
  h.runtime.outbox.turnStarted(watcher!.id, Date.now() - 120_000);
  for (const turn of ["t1", "t2"]) {
    timeline.beat("turn_started", turn);
    timeline.add({ type: "tool_call", callId: `c-${turn}`, name: "Bash", status: "completed", detail: { type: "shell", command: `echo ${turn}`, output: turn } }, turn);
    timeline.beat("turn_completed", turn);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual([watcher!.sent, watcher!.steered], [[], []], "nothing reaches it while it is reading");
  assert.equal(h.runtime.outbox.pending(watcher!.id).length, 2);
  await h.idle(watcher!.id);
  assert.equal(watcher!.sent.length, 1, "both at once, when it is done");
  assert.match(watcher!.sent[0]!, /2 messages[\s\S]*READING R1[\s\S]*echo t1[\s\S]*READING R2[\s\S]*echo t2/);
  h.runtime.dispose();
});

test("a Watcher that has taken its share of readings is replaced once it is idle and nothing waits for it", async () => {
  const { h, timeline } = await laneWithPeer("outbox-rotate.json", bySeat({ watcherRotateAfter: 1 }));
  const [first] = watchersOf(h);
  await h.idle(first!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "ls", output: "a.txt" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(first!.sent.length, 1);
  // Another reading comes while it is still on the first: that one waits for it, so it stays.
  timeline.beat("turn_started", "t2");
  timeline.add({ type: "tool_call", callId: "c2", name: "Bash", status: "completed", detail: { type: "shell", command: "pwd", output: "/" } }, "t2");
  timeline.beat("turn_completed", "t2");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  first!.status = "idle";
  await h.tick();
  assert.equal(first!.archivedAt, null, "not while a reading waits for it, which would be lost with it");
  await h.idle(first!.id);
  await h.tick();
  assert.ok(first!.archivedAt, "let go after its share");
  await h.tick();
  const live = watchersOf(h).filter((agent) => !agent.archivedAt);
  assert.equal(live.length, 1);
  assert.notEqual(live[0]!.id, first!.id, "and a fresh one sits in its place");
  const reader = (h.runtime as unknown as { reader: { readings(id: string): number; sent(id: string, ref: string): unknown } }).reader;
  assert.deepEqual([reader.readings(first!.id), reader.sent(first!.id, "R1.S1")], [0, undefined], "and nothing of the one it replaced is kept");
  h.runtime.dispose();
});

async function read(h: ReturnType<typeof harness>, watcher: string) {
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await h.idle(watcher);
}

test("a Watcher raises against a step it was read: the step, not its words, reaches whoever answers for the seat", async () => {
  const { h, sup, lane, peer, timeline } = await laneWithPeer("outbox-raise.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  assert.match(watcher!.prompt!, /missing_mechanism \(attend\): Built a stand-in[^\n]*For example: "patch\.js is missing/, "seated knowing what it may raise, with an example of each, from the kit");
  assert.match(watcher!.prompt!, /What the code raises and you judge before anyone is told:\n- stuck: Going round in circles\.\n- no-recovery: Did not recover from a failure\./, "each with what it means, as the kinds it raises are");
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "reasoning", text: "The caller still wants the old shape, so a small adapter will keep it compiling." }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Write", status: "completed", detail: { type: "write", filePath: "src/legacy-adapter.ts", content: "export const old = () => fresh();\n" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await read(h, watcher!.id);
  assert.match(watcher!.sent.join("\n"), /R1\.S1 thought: The caller still wants the old shape/);

  const raise = (args: Record<string, unknown>, by = watcher!.id) => h.call(by, "watcher", "raise", { why: "an adapter for a shape nothing shipped needs", ...args });
  const unknown = await raise({ kind: "bad_vibes", step: "R1.S1" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.text, /bad_vibes is not a kind you raise\. You raise unsafe_action, .*reasoning_astray\./);
  const invented = await raise({ kind: "missing_mechanism", step: "R4.S9" });
  assert.equal(invented.ok, false);
  assert.match(invented.text, /R4\.S9 is not a step a reading sent you/, "a step it was never read cannot be reported");
  const other = h.add("sw2-watcher-devin/swe-2-max", h.project.root, "another watcher");
  assert.equal((await raise({ kind: "missing_mechanism", step: "R1.S1" }, other)).ok, false, "nor one read to another Watcher");

  const raised = await raise({ kind: "missing_mechanism", step: "R1.S1" });
  assert.equal(raised.ok, true, raised.text);
  assert.match(raised.text, /^Raised I1, missing_mechanism on the Peer on L1-T1 \(Clean build\): whoever answers for that seat has been told\.$/);
  await h.idle(sup);
  await h.idle(lane.lead!);
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/, "one about a Peer is its Lead's");
  const told = h.agents.get(lane.lead!)!.sent.join("\n");
  assert.match(told, /INCIDENT I1 \(missing_mechanism, attend\) on the Peer on L1-T1/);
  assert.match(told, /What to do is yours as its Lead/);
  assert.match(told, /What was seen: S1 thought: The caller still wants the old shape/, "the step as it was read, without the reading's number");
  assert.doesNotMatch(told, /nothing shipped needs/, "and not the Watcher's reason, which stays on record");
  assert.match(readFileSync(join(h.project.state, "events.log"), "utf-8"), /"kind":"watch\.raised".*"step":"R1\.S1".*"why":"an adapter for a shape nothing shipped needs"/);
  assert.deepEqual([...h.agents.get(peer)!.sent, ...h.agents.get(peer)!.steered].filter((text) => /INCIDENT|adapter/i.test(text)), [], "nothing of it reaches the Peer");

  const again = await raise({ kind: "missing_mechanism", step: "R1.S1" });
  assert.match(again.text, /^I1 already stands for missing_mechanism/, "raised twice, it is one incident seen twice");

  // A Watcher still on its last turn after the watch went to Jev reports into nothing.
  writeFileSync(join(h.project.state, "settings.json"), JSON.stringify({ attention: { by: "jev", watch: true } }));
  const late = await raise({ kind: "goal_drift", step: "R1.S1" });
  assert.equal(late.ok, false);
  assert.match(late.text, /by Jev now/);
  assert.match((await h.call(watcher!.id, "watcher", "judge", { incident: "I1", says: "vetoes", why: "x" })).text, /by Jev now/);
  h.runtime.dispose();
});

test("what the code raises on a fact a Watcher judges waits for it: vetoed it is held back, confirmed it is told", async () => {
  for (const says of ["vetoes", "confirms"] as const) {
    const { h, sup, lane, timeline } = await laneWithPeer(`outbox-judge-${says}.json`, bySeat({ watch: true }));
    const [watcher] = watchersOf(h);
    await h.idle(watcher!.id);
    timeline.beat("turn_started", "t1");
    timeline.add({ type: "user_message", text: "Make the build pass" }, "t1");
    for (let index = 0; index < 3; index++) timeline.add({ type: "tool_call", callId: `c${index}`, name: "Bash", status: "failed", detail: { type: "shell", command: "npm run build", output: "error TS2345", exitCode: 2 } }, "t1");
    await read(h, watcher!.id);
    const held = incidentsOf(h.project.state);
    const id = Object.entries(held).find(([, item]) => item.kind === "stuck")![0];
    assert.equal(held[id]!.held, "awaiting", "not told before the Watcher has looked");
    assert.match(watcher!.sent.join("\n"), new RegExp(`waiting for your judge before anyone is told:\\n- ${id}\\.1 stuck \\(attend\\)`), "and the Watcher is read it");

    const wrong = await h.call(watcher!.id, "watcher", "judge", { incident: "I99.1", says, why: "x" });
    assert.match(wrong.text, /There is no incident I99/);
    const judged = await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says, why: "the third build ran after a fix to the same line" });
    assert.equal(judged.ok, true, judged.text);
    await h.idle(sup);
    await h.idle(lane.lead!);
    const after = incidentsOf(h.project.state)[id]! as { held?: string; told?: number; sensor?: { question: string; says: string; why?: string } };
    assert.deepEqual([after.sensor?.question, after.sensor?.says, after.sensor?.why], ["watcher", says, "the third build ran after a fix to the same line"]);
    const told = [...h.agents.get(sup)!.sent, ...h.agents.get(lane.lead!)!.sent].join("\n");
    if (says === "vetoes") {
      assert.equal(after.held, "vetoed");
      assert.doesNotMatch(told, /INCIDENT/, "held back from everyone");
    } else {
      assert.ok(after.told);
      assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), new RegExp(`INCIDENT ${id} \\(stuck, attend\\)`), "told to the Peer's Lead");
      assert.doesNotMatch(told, /fix to the same line/, "its reason is not sent");
    }
    assert.match((await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says, why: "again" })).text, /no longer waits for a judgement: it has been judged|it has been told/);
    h.runtime.dispose();
  }
});

test("a fact the patrol finds, with nothing else happening, is read to the Watcher at once", async () => {
  const { h, timeline } = await laneWithPeer("outbox-judge-wake.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  await settle();
  // A turn that runs on is found by the round, not by anything the seat does: no step comes to read.
  await h.tick(Date.now() + 31 * 60_000);
  await read(h, watcher!.id);
  const [id] = Object.entries(incidentsOf(h.project.state)).find(([, item]) => item.kind === "long-turn")!;
  const shows = () => (watcher!.sent.join("\n").match(new RegExp(`- ${id}\\.\\d+ long-turn \\(attend\\)`, "g")) ?? []).length;
  assert.equal(shows(), 1);
  assert.equal((await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says: "vetoes", why: "a long build" })).ok, true);

  // Seen again next turn, it waits for a fresh judgement though the seat does nothing to bring a reading.
  timeline.beat("turn_completed", "t1");
  timeline.beat("turn_started", "t2");
  await settle();
  await read(h, watcher!.id);
  await h.tick(Date.now() + 62 * 60_000);
  await read(h, watcher!.id);
  assert.equal(incidentsOf(h.project.state)[id]!.held, "awaiting");
  assert.equal(shows(), 2);
  h.runtime.dispose();
});

const failBuild = (timeline: ReturnType<ReturnType<typeof harness>["timelineOf"]>, turn: string, instruction: string) => {
  timeline.beat("turn_started", turn);
  timeline.add({ type: "user_message", text: instruction }, turn);
  for (let index = 0; index < 3; index++) timeline.add({ type: "tool_call", callId: `${turn}-c${index}`, name: "Bash", status: "failed", detail: { type: "shell", command: "npm run build", output: "error TS2345", exitCode: 2 } }, turn);
};

test("a fact a Watcher vetoed and that is seen again is read to it again, once, and is not told behind its back", async () => {
  const { h, sup, timeline } = await laneWithPeer("outbox-judge-again.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  failBuild(timeline, "t1", "Make the build pass");
  await read(h, watcher!.id);
  const [id] = Object.entries(incidentsOf(h.project.state)).find(([, item]) => item.kind === "stuck")!;
  const shows = () => (watcher!.sent.join("\n").match(new RegExp(`- ${id}\\.\\d+ stuck`, "g")) ?? []).length;
  assert.equal(shows(), 1);
  timeline.add({ type: "tool_call", callId: "t1-after", name: "Bash", status: "failed", detail: { type: "shell", command: "git diff --check", output: "trailing whitespace", exitCode: 2 } }, "t1");
  await read(h, watcher!.id);
  assert.match(watcher!.sent.at(-1)!, /git diff --check/);
  assert.equal(shows(), 1, "a reading about something else does not carry it again while it waits");
  assert.equal((await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says: "vetoes", why: "a fix between each" })).ok, true);

  failBuild(timeline, "t2", "Try once more");
  await read(h, watcher!.id);
  assert.equal(incidentsOf(h.project.state)[id]!.held, "awaiting", "seen again, it waits for a fresh judgement");
  assert.equal(shows(), 2, "and the Watcher is read it again rather than left to time out");
  const stale = await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says: "confirms", why: "from the first reading" });
  assert.equal(stale.ok, false);
  assert.match(stale.text, new RegExp(`has been seen again since the reading you judged it from[\\s\\S]*as ${id}\\.2`), "a judgement on the words it read first is not laid on the new ones");
  assert.match((await h.call(watcher!.id, "watcher", "judge", { incident: id, says: "confirms", why: "no count" })).text, new RegExp(`like ${id}\\.2`));
  const [a, b] = await Promise.all([
    h.call(watcher!.id, "watcher", "judge", { incident: `${id}.2`, says: "vetoes", why: "still fixing" }),
    h.call(watcher!.id, "watcher", "judge", { incident: `${id}.2`, says: "confirms", why: "going round" }),
  ]);
  assert.deepEqual([a.ok, b.ok], [true, false], "two judgements at once: the second does not overwrite the first");
  assert.match(b.text, /changed while you judged it/);
  assert.equal((incidentsOf(h.project.state)[id] as { sensor?: { says: string } }).sensor?.says, "vetoes");
  await h.idle(sup);
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/);
  h.runtime.dispose();
});

test("a Watcher is told when what it raises was marked noise, and cannot raise about a seat gone with its lane", async () => {
  const { h, sup, peer, timeline } = await laneWithPeer("outbox-raise-noise.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "reasoning", text: "A shim keeps the old import working." }, "t1");
  timeline.add({ type: "assistant_message", text: "Writing the adapter now." }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "ls", output: "a.txt" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await read(h, watcher!.id);
  const raise = (step: string) => h.call(watcher!.id, "watcher", "raise", { kind: "missing_mechanism", step, why: "a shim" });
  assert.match((await raise("R1.S1")).text, /^Raised I1/);
  assert.equal((await h.call(sup, "supervisor", "ack", { id: "I1", verdict: "noise", note: "expected: the brief asks for it" })).ok, true);
  assert.match((await raise("R1.S2")).text, /^Raised I2/, "another step opens another");
  const again = await raise("R1.S1");
  assert.match(again.text, /^Not raised: missing_mechanism on the Peer on L1-T1 \(Clean build\) in these words was marked noise before\.$/, "not told it was counted into I2, which it was not");

  h.agents.get(peer)!.status = "idle";
  assert.equal((await h.call(sup, "supervisor", "close_lane", { lane: "L1", land: false })).ok, true);
  assert.notEqual(h.agents.get(peer)!.archivedAt, null);
  const gone = await raise("R1.S2");
  assert.equal(gone.ok, false);
  assert.match(gone.text, /has gone/);
  h.runtime.dispose();
});

test("a seat let go while what it did was being recorded is not read to the Watcher afterwards", async () => {
  const { h, peer } = await laneWithPeer("outbox-dropped.json", bySeat({ watch: true }));
  const runtime = h.runtime as unknown as { watches: { get(id: string): unknown; drop(id: string): void }; noticed(watch: unknown, findings: unknown[]): void; reader: { pacers: Map<string, unknown> } };
  const watch = runtime.watches.get(peer);
  assert.ok(watch);
  runtime.noticed(watch, [{ kind: "stuck", level: "attend", quote: "round and round", facts: ["stuck"] }]);
  runtime.watches.drop(peer);
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(runtime.reader.pacers.has(peer), false, "no reader is left behind for a seat nobody follows");
  h.runtime.dispose();
});

test("in shadow a Watcher is still read what it judges, and its judgement is kept for calibration", async () => {
  const { h, timeline } = await laneWithPeer("outbox-judge-shadow.json", bySeat());
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Make the build pass" }, "t1");
  for (let index = 0; index < 3; index++) timeline.add({ type: "tool_call", callId: `c${index}`, name: "Bash", status: "failed", detail: { type: "shell", command: "npm run build", output: "error TS2345", exitCode: 2 } }, "t1");
  await read(h, watcher!.id);
  const [id, item] = Object.entries(incidentsOf(h.project.state)).find(([, entry]) => entry.kind === "stuck")!;
  assert.equal(item.held, "shadow");
  assert.match(watcher!.sent.join("\n"), new RegExp(`- ${id}\\.1 stuck`));
  assert.equal((await h.call(watcher!.id, "watcher", "judge", { incident: `${id}.1`, says: "vetoes", why: "ordinary" })).ok, true);
  const after = incidentsOf(h.project.state)[id]! as { held?: string; sensor?: { says: string } };
  assert.deepEqual([after.held, after.sensor?.says], ["shadow", "vetoes"]);
  h.runtime.dispose();
});

test("an incident about a Peer whose Lead is gone goes to whoever supervises, and a Lead reads and marks only its own lane's", async () => {
  const { h, sup, lane, peer } = await laneWithPeer("outbox-lead-marks.json", { attention: { watch: true } });
  const lead = lane.lead!;
  const about = (seat: string, kind: string, level: "attend" | "page" = "attend") =>
    h.runtime.desk.notice(h.project, { id: seat, provider: h.agents.get(seat)!.provider, title: seat }, [{ kind, level, quote: `${kind} seen`, facts: [kind] }]);
  await about(peer, "test-weakened");
  await about(lead, "long-turn");
  await h.idle(lead);
  await h.idle(sup);
  assert.match(h.agents.get(lead)!.sent.join("\n"), /INCIDENT I1 \(test-weakened, attend\)/);
  assert.match(h.agents.get(sup)!.sent.join("\n"), /INCIDENT I2 \(long-turn, attend\) on the Lead/, "one about the Lead goes above it");

  const listed = await h.call(lead, "lead", "incidents", {});
  assert.equal(listed.ok, true, listed.text);
  assert.match(listed.text, /I1 \[attend/);
  assert.doesNotMatch(listed.text, /I2/, "never one about itself");
  const own = await h.call(lead, "lead", "ack", { id: "I2", verdict: "noise", note: "expected" });
  assert.equal(own.ok, false, "nor may it mark one");
  assert.match(own.text, /no incident I2 here for you/);
  const marked = await h.call(lead, "lead", "ack", { id: "I1", verdict: "useful", note: "it was going round" });
  assert.equal(marked.ok, true, marked.text);
  assert.match((await h.call(sup, "supervisor", "incidents", { closed: true })).text, /I1 \[attend, closed, told [^\]]*, marked useful\]/, "whoever supervises sees what the Lead marked");

  h.agents.get(lead)!.archivedAt = new Date().toISOString();
  await about(peer, "suppressed");
  await h.idle(sup);
  assert.match(h.agents.get(sup)!.sent.join("\n"), /INCIDENT I3 \(suppressed, attend\) on the Peer/, "with its Lead gone, it goes above");
  h.runtime.dispose();
});

test("the Flow view by a seat carries the Watcher seat, what waits for it, and who raised and was told of each incident", async () => {
  const { h, lane, timeline } = await laneWithPeer("outbox-view-seat.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "reasoning", text: "A shim keeps the old import working." }, "t1");
  timeline.beat("turn_completed", "t1");
  await read(h, watcher!.id);
  await h.call(watcher!.id, "watcher", "raise", { kind: "missing_mechanism", step: "R1.S1", why: "a shim" });
  // Another reading comes while the Watcher is busy, and waits for it.
  watcher!.status = "running";
  timeline.beat("turn_started", "t2");
  timeline.add({ type: "tool_call", callId: "c2", name: "Bash", status: "completed", detail: { type: "shell", command: "ls", output: "a.txt" } }, "t2");
  timeline.beat("turn_completed", "t2");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const view = ((await h.runtime.control.flow(h.project.slug)) as { watch: WatchView }).watch;
  assert.equal(view.by, "seat");
  assert.deepEqual({ ...view.watcher!, minutes: 0 }, { id: watcher!.id, status: "running", minutes: 0, queued: 1 });
  assert.deepEqual(view.incidents.map((item) => [item.id, item.source, item.told, item.lane, item.quote]), [["I1", "watcher", "lead", lane.id, "S1 thought: A shim keeps the old import working."]]);
  h.runtime.dispose();
});

test("by Jev, a Jev that fails after it last answered is said to be failing, and one that answers again is not", async (t) => {
  const { h, timeline } = await laneWithPeer("outbox-view-failing.json");
  let status = 401;
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    if (status !== 200) return new Response("slow down", { status });
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }), { status: 200 });
  });
  const turn = async (id: string) => {
    timeline.beat("turn_started", id);
    timeline.add({ type: "user_message", text: `Go ${id}` }, id);
    timeline.add({ type: "tool_call", callId: `c-${id}`, name: "Bash", status: "completed", detail: { type: "shell", command: "ls", output: "a.txt" } }, id);
    timeline.beat("turn_completed", id);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  await turn("t1");
  const failing = ((await h.runtime.control.flow(h.project.slug)) as { watch: WatchView }).watch;
  assert.equal(failing.keyed, true);
  assert.match(failing.failing?.detail ?? "", /401/);
  status = 200;
  (h.runtime as unknown as { sensorNoted: Map<string, number> }).sensorNoted.clear();
  await turn("t2");
  const back = ((await h.runtime.control.flow(h.project.slug)) as { watch: WatchView }).watch;
  assert.equal(back.failing, null, "an answer since the failure clears it");
  h.runtime.dispose();
});

const incidentsOf = (state: string) => JSON.parse(readFileSync(join(state, "incidents.json"), "utf-8")).items as Record<string, { kind: string; held?: string; told?: number; level: string }>;

test("an irreversible command a Peer starts reaches the Supervisor before the call finishes, and nothing of it reaches the Peer", async () => {
  const { h, sup, peer, timeline } = await laneWithPeer("outbox-incident.json", { attention: { watch: true } });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "unknown", input: {}, output: null } }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "shell", command: "rm -rf build" } }, "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.idle(sup);
  const told = h.agents.get(sup)!.sent.join("\n");
  assert.match(told, /INCIDENT I1 \(destructive, page\) on the Peer on L1-T1 \(Clean build\)/);
  assert.match(told, /What was seen: rm -rf build/);
  assert.match(told, /not a verdict/);
  assert.ok(!timeline.rows.some((row) => row.item.status === "completed"), "the call it warns about is still running");
  assert.deepEqual(h.runtime.outbox.letters().filter((letter) => letter.to === peer), [], "nothing the watch concluded is even queued for the seat it watches");
  await h.idle(peer);
  const watched = h.agents.get(peer)!;
  assert.deepEqual([...watched.sent, ...watched.steered].filter((text) => /INCIDENT|destructive|rm -rf|incident/i.test(text)), [], "nor reaches it when its turn ends");
  h.runtime.dispose();
});

test("with the watch on but not telling, the desk records what it sees and sends nothing until the owner turns it on", async () => {
  const { h, sup, timeline } = await laneWithPeer("outbox-shadow.json");
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "shell", command: "git push --force origin main" } }, "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.idle(sup);
  assert.deepEqual(Object.values(incidentsOf(h.project.state)).map((item) => [item.kind, item.held]), [["destructive", "shadow"]]);
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/);
  const view = (await h.runtime.control.flow(h.project.slug)) as { watch: WatchView };
  assert.deepEqual(view.watch.incidents.map((item) => [item.name, item.source, item.quote, item.held]), [["Peer · L1-T1 Clean build", "code", "git push --force origin main", "shadow"]], "the card names the seat by its task, and shows the step, how it was raised and why it waits");
  h.runtime.dispose();
});

test("by Jev with no key, nothing is watched and nothing is recorded", async () => {
  const { h, sup, timeline } = await laneWithPeer("outbox-off.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({ attention: { by: "jev" } }));
  await h.tick();
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "shell", command: "git push --force origin main" } }, "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.idle(sup);
  // Off is off: with no key the seat is not followed, so not even an irreversible command is recorded.
  assert.equal(existsSync(join(h.project.state, "incidents.json")), false);
  h.runtime.dispose();
});

test("left as the kit ships it the watch is by a Watcher seat: a seat is followed without a key, and Jev is never asked even with one", async (t) => {
  for (const settings of [{}, { sensor: { key: "sk-or-seat-test" } }]) {
    const { h, sup, timeline } = await laneWithPeer("outbox-by-seat.json");
    writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify(settings));
    const asked = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }));
    await h.tick();
    timeline.beat("turn_started", "t1");
    timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "running", detail: { type: "shell", command: "git push --force origin main" } }, "t1");
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await h.idle(sup);
    const book = JSON.parse(readFileSync(join(h.project.state, "incidents.json"), "utf-8")) as { items: Record<string, { kind: string }> };
    assert.deepEqual(Object.values(book.items).map((item) => item.kind), ["destructive"], "what the code reads is recorded with or without a key");
    assert.equal(asked.mock.callCount(), 0, "the key alone no longer turns Jev on");
    asked.mock.restore();
    h.runtime.dispose();
  }
});

test("each assessment is kept with the state, questions, facts and answers it was made on, and is decided on the facts that were sent", async (t) => {
  const { h, peer, timeline } = await laneWithPeer("outbox-kept.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({ sensor: { key: "sk-or-kept-test" }, attention: { by: "jev" } }));
  const bodies: { questions: Record<string, unknown> }[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    bodies.push(body);
    await held;
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: name === "goal_drift" ? 0.9 : 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917", id: "gen-kept", usage: { cost: 0.00002 } }), { status: 200 });
  });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "tool_call", callId: "c0", name: "Edit", status: "completed", detail: { type: "edit", filePath: "b.txt", oldString: "x", newString: "y" } }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "rm -rf build", output: "" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  timeline.beat("turn_started", "t2");
  timeline.add({ type: "user_message", text: "Now the docs" }, "t2");
  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const kept = readAssessments(h.project.state).kept;
  const first = kept.find((record) => record.views.work?.instruction === "Clean the build");
  assert.ok(first, "the assessment is kept");
  assert.equal(first.seat, peer);
  assert.equal(first.model, "typesafe/jev-1.13-20260917");
  assert.equal(first.turnId, "t1", "filed under the turn it was asked about, though the next had begun when the answer came");
  assert.deepEqual(first.facts.map((fact) => fact.kind), ["outside-scope", "destructive"], "the facts noted when the state was taken");
  assert.deepEqual(first.found, ["goal_drift"], "decided on those facts, though the seat was told something new while the answer was on its way");
  assert.deepEqual(Object.keys(first.views).sort(), ["actions", "instruction", "work"], "every view it sent, and no claim from a turn that ended without a word");
  assert.deepEqual(Object.keys(first.questions).sort(), bodies.slice(0, 3).flatMap((body) => Object.keys(body.questions)).sort(), "one request per view, each kept with the questions it asked");
  assert.ok(!("unverified_success" in first.questions), "a turn that ends without a word claims nothing, so nothing is asked about a claim");
  assert.doesNotMatch(JSON.stringify(kept), /sk-or-kept-test/);
  h.runtime.dispose();
});

test("a turn is asked what applies to who sent its instruction, and kept with that turn", async (t) => {
  const { h, peer, timeline } = await laneWithPeer("outbox-turn.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({ sensor: { key: "sk-or-turn-test" }, attention: { by: "jev" } }));
  const asked: string[][] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    asked.push(Object.keys(body.questions));
    return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: 0.1 }])), model: "m", id: "g", usage: { cost: 0 } }), { status: 200 });
  });
  const turn = async (id: string, message: Record<string, unknown>) => {
    timeline.beat("turn_started", id);
    timeline.add({ type: "user_message", text: "Carry on", ...message }, id);
    timeline.add({ type: "tool_call", callId: `${id}-c`, name: "Edit", status: "completed", detail: { type: "edit", filePath: "a.txt", oldString: "x", newString: "y" } }, id);
    timeline.beat("turn_completed", id);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  await turn("t1", { clientMessageId: "sw2-amended-1", messageId: "sw2-amended-1" });
  assert.ok(!asked.flat().includes("agreed_without_checking"), "the desk granting what the seat asked for doubts nothing");
  await turn("t2", { clientMessageId: "c-2", messageId: "c-2" });
  assert.ok(asked.flat().includes("agreed_without_checking"), "a person's word may");
  const kept = readAssessments(h.project.state).kept.filter((record) => record.seat === peer);
  assert.deepEqual(kept.map((record) => record.turn?.from), [["amended"], ["person"]]);
  assert.deepEqual(kept[0]!.turn?.can, ["work", "write", "watched"]);
  h.runtime.dispose();
});

test("the flow screen can say what the watch is doing: which seats, how many readings, what they cost", async (t) => {
  const { h, peer, timeline } = await laneWithPeer("outbox-watchview.json");
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    // `unverified_success` reads high on every finished turn and opens nothing, so it is not the lean shown.
    const high: Record<string, number> = { goal_drift: 0.62, unverified_success: 0.99 };
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: high[name] ?? 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917", id: "gen-view", usage: { cost: 0.00013 } }), { status: 200 });
  });
  const off = (await h.runtime.control.flow(h.project.slug)) as { watch: WatchView };
  assert.equal(off.watch.on, true, "a key is set in this harness, so the watch is on");
  assert.deepEqual(off.watch.seats.map((seat: WatchSeat) => seat.name).sort(), ["Lead · L1 Build", "Peer · L1-T1 Clean build"], "the two roles that carry `watched`, and no Supervisor, each by its lane or task");
  assert.deepEqual(off.watch.seats.map((seat: WatchSeat) => seat.lean), [null, null], "nothing read yet");

  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  // Inside what the task owns, with goal_drift below its bar.
  timeline.add({ type: "tool_call", callId: "c1", name: "Edit", status: "completed", detail: { type: "edit", filePath: "a.txt", oldString: "x", newString: "y" } }, "t1");
  timeline.add({ type: "assistant_message", text: "Done — the build is clean." }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));

  const view = (await h.runtime.control.flow(h.project.slug)) as { watch: WatchView };
  const read = view.watch.seats.find((seat: WatchSeat) => seat.id === peer)!;
  assert.equal(view.watch.marks.open, 0, "nothing was opened");
  // The lean is an openable question within its unclear band, not the highest answer overall.
  assert.deepEqual(read.lean, { title: "Worked on something it was not asked for", p: 0.62, bar: 0.7 });
  assert.equal(view.watch.read.turns >= 1, true, "the project's own tally, not just the seats running now");
  assert.ok(view.watch.read.cost >= 4 * 0.00013 - 1e-12, "what Jev charged for the reading, a request for each of its four views");
  h.runtime.dispose();
});

test("the brief a Peer is read against names the tasks being written beside it", async (t) => {
  const { h, lane, peer } = await laneWithPeer("outbox-alongside.json");
  // Parallel, so it runs in its own copy beside L1-T1.
  const second = await h.call(lane.lead!, "lead", "start_task", { title: "Second part", goal: "g2", acceptance: ["a"], owned: ["b.txt"], outOfScope: ["the rest"], parallel: true });
  assert.equal(second.ok, true, second.text);
  const states: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { state: Record<string, unknown>; questions: Record<string, unknown> };
    states.push(body.state);
    return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map((n) => [n, { type: "noul", noul: 0.1 }])), model: "m", id: "g", usage: { cost: 0 } }), { status: 200 });
  });
  const timeline = h.timelineOf(peer);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "build it" }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const beside = String(states.find((state) => "role" in state)?.beside ?? "");
  // Parallel Peers find each other's files unwritten, and the sensor's question already excuses what `beside` names.
  assert.match(beside, /Being written in other copies/);
  assert.match(beside, /L1-T2 \(Second part\)/);
  assert.match(beside, /b\.txt/, "the paths this seat will find missing are the point of saying it");
  h.runtime.dispose();
});

test("the brief a Peer is read against carries what its Lead said in the task's context", async (t) => {
  const { h, lane } = await laneWithPeer("outbox-briefcontext.json");
  // Not shown the Lead's instruction, the sensor read this stand-in as an invented missing mechanism.
  const told = "write a small local applier inside test/b.test.js";
  const second = await h.call(lane.lead!, "lead", "start_task", { title: "Second part", goal: "g2", acceptance: ["a"], owned: ["b.txt"], outOfScope: ["the rest"], context: told, parallel: true });
  assert.equal(second.ok, true, second.text);
  await h.tick();
  const states: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { state: Record<string, unknown>; questions: Record<string, unknown> };
    states.push(body.state);
    return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map((n) => [n, { type: "noul", noul: 0.1 }])), model: "m", id: "g", usage: { cost: 0 } }), { status: 200 });
  });
  const timeline = h.timelineOf(h.ledger().tasks["L1-T2"]!.peer!);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "build it" }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(states.find((state) => "role" in state)?.context, told);
  h.runtime.dispose();
});

test("a stuck seat the sensor does not think stuck is held back from the Supervisor, and the sensor's word is kept on the incident", async (t) => {
  const { h, sup, timeline } = await laneWithPeer("outbox-vetoed.json", { attention: { watch: true } });
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }), { status: 200 });
  });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Make the build pass" }, "t1");
  for (let index = 0; index < 3; index++) timeline.add({ type: "tool_call", callId: `c${index}`, name: "Bash", status: "failed", detail: { type: "shell", command: "npm run build", output: "error TS2345", exitCode: 2 } }, "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));
  await h.idle(sup);
  const stuck = Object.values(JSON.parse(readFileSync(join(h.project.state, "incidents.json"), "utf-8")).items as Record<string, { kind: string; held?: string; told?: number; sensor?: { question: string; says: string } }>).find((item) => item.kind === "stuck");
  assert.ok(stuck, "the code still opens the incident");
  assert.equal(stuck.held, "vetoed");
  assert.deepEqual([stuck.sensor?.question, stuck.sensor?.says], ["worker_stuck", "vetoes"]);
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/);
  assert.ok(readAssessments(h.project.state).kept.some((record) => record.verdicts.some((verdict) => verdict.kind === "stuck" && verdict.says === "vetoes")), "the judgement is kept with the assessment it came from");
  h.runtime.dispose();
});

test("a turn that runs long is told without waiting on the sensor, which cannot see time", async () => {
  const { h, sup, lane, timeline } = await laneWithPeer("outbox-long-turn.json", { attention: { watch: true } });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Make the build pass" }, "t1");
  await settle();
  await h.tick(Date.now() + 31 * 60_000);
  await h.idle(sup);
  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /INCIDENT I1 \(long-turn, attend\)/, "one about a Peer goes to its Lead");
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT I1/);
  h.runtime.dispose();
});

test("a question that raises alone does so on one reading of a turn that ended, while one still running needs a second reading in the same turn", async (t) => {
  const { h, sup, lane, timeline } = await laneWithPeer("outbox-needs-human.json", { attention: { watch: true } });
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    // Always high, so only the turn's reading count and whether it ended decide what opens.
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: name === "missing_mechanism" ? 0.95 : 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }), { status: 200 });
  });
  const kinds = () => Object.values(incidentsOf(h.project.state)).map((item) => item.kind);
  const failing = (id: string, command: string) => ({ type: "tool_call", callId: id, name: "Bash", status: "failed", detail: { type: "shell", command, output: "no", exitCode: 1 } });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Tidy the build" }, "t1");
  timeline.add(failing("a1", "make one"), "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  timeline.beat("turn_started", "t2");
  timeline.add(failing("b1", "make two"), "t2");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(kinds(), [], "a reading in the turn before does not count as the second");
  timeline.beat("turn_completed", "t2");
  timeline.beat("turn_started", "t3");
  timeline.add({ type: "user_message", text: "Go on" }, "t3");
  timeline.add({ type: "assistant_message", text: "patch.js is missing, so I wrote a small applier of my own.", messageId: "m1" }, "t3");
  timeline.beat("turn_completed", "t3");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await h.idle(sup);
  await h.idle(lane.lead!);
  assert.deepEqual(kinds(), ["missing_mechanism"]);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /INCIDENT I1 \(missing_mechanism, attend\)/);
  h.runtime.dispose();
});

test("an incident a question opens quotes the step the sensor points at, not the question", async (t) => {
  const { h, timeline } = await laneWithPeer("outbox-pinpoint.json", { attention: { watch: true } });
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { state: { steps?: { id: string }[] }; questions: Record<string, { type: string }> };
    if (body.questions.where) {
      const last = body.state.steps!.at(-1)!.id;
      return new Response(JSON.stringify({ answers: { where: { type: "choice", choice: last, probabilities: { [last]: 0.93 }, confidence: 0.9 } }, model: "m" }), { status: 200 });
    }
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: name === "unsafe_action" ? 0.95 : 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }), { status: 200 });
  });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Check the deploy settings" }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "ls config", output: "deploy.yml" } }, "t1");
  timeline.add({ type: "tool_call", callId: "c2", name: "Bash", status: "completed", detail: { type: "shell", command: "cat ~/.aws/credentials", output: "[default]" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const opened = Object.values(incidentsOf(h.project.state)).find((item) => item.kind === "unsafe_action") as { quote: string } | undefined;
  assert.equal(opened?.quote, "S2 ran: cat ~/.aws/credentials", "the Supervisor is told where to look, by the step's id");
  h.runtime.dispose();
});

test("a stand-in for a file a sibling task is still writing is expected work, not an incident", async (t) => {
  // The sensor is literally right; what makes it expected is a ledger fact, so code decides it on the step it points at.
  const { h, lane, timeline } = await laneWithPeer("outbox-besidestub.json", { attention: { watch: true } });
  assert.equal((await h.call(lane.lead!, "lead", "start_task", { title: "Pointer", goal: "g2", acceptance: ["a"], owned: ["src/pointer.js"], outOfScope: ["the rest"], parallel: true })).ok, true);
  await h.tick();
  t.mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { state: { steps?: { id: string; note?: string }[] }; questions: Record<string, unknown> };
    if (body.questions.where) {
      const noted = body.state.steps!.find((step) => step.note)?.id ?? body.state.steps!.at(-1)!.id;
      return new Response(JSON.stringify({ answers: { where: { type: "choice", choice: noted, probabilities: { [noted]: 0.9 }, confidence: 0.9 } }, model: "m" }), { status: 200 });
    }
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [name, { type: "noul", noul: name === "missing_mechanism" ? 0.95 : 0.1 }]));
    return new Response(JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }), { status: 200 });
  });
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Build it" }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Edit", status: "completed", detail: { type: "edit", filePath: "a.txt", oldString: "one", newString: "uno" } }, "t1");
  timeline.add({ type: "assistant_message", text: "src/pointer.js is still a stub, so I parse paths in a.txt myself.", messageId: "m1" }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(Object.values(incidentsOf(h.project.state)).map((item) => item.kind), []);
  h.runtime.dispose();
});

test("a seat whose brief cannot be read is not described to the sensor as having none", async (t) => {
  const { h, timeline } = await laneWithPeer("outbox-unbriefed.json");
  writeFileSync(join(h.project.state, "ledger.json"), "{ not json");
  const asked = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }));
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Bash", status: "completed", detail: { type: "shell", command: "ls", output: "a" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(asked.mock.callCount(), 0);
  assert.match(readFileSync(join(h.project.state, "events.log"), "utf-8"), /"kind":"watch.unbriefed"/);
  h.runtime.dispose();
});

test("taking the key away does not release the incidents the watch was still holding", async () => {
  const { h, sup } = await laneWithPeer("outbox-retell-off.json", { attention: { watch: true } });
  // `stuck` is a kind the sensor confirms, so this is held "awaiting" its reading rather than sent.
  await h.runtime.desk.notice(h.project, { id: "p-a", provider: "sw2-peer-devin/swe-2-max", title: "p-a" }, [{ kind: "stuck", level: "attend", quote: "round and round", facts: ["stuck"] }]);
  assert.deepEqual(Object.values(incidentsOf(h.project.state)).map((item) => item.held), ["awaiting"]);

  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({}));
  await h.tick();
  await h.idle(sup);
  // With the key gone the confirming set is empty, so a naive retell would send the very mail the hold kept back.
  assert.deepEqual(Object.values(incidentsOf(h.project.state)).map((item) => item.held), ["awaiting"], "still held, not released by the watch being switched off");
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/);
  h.runtime.dispose();
});

test("a day's budget holds back what is only worth attention, however many arrive at once, and never what is irreversible", async () => {
  const { h, sup } = await laneWithPeer("outbox-budget.json", { attention: { watch: true, incidentsPerDay: 1 } });
  const seat = (id: string) => ({ id, provider: "sw2-peer-devin/swe-2-max", title: id });
  // Not `stuck`: the sensor confirms that one, so it would be held awaiting a reading before the budget has a say.
  const attend = (quote: string) => [{ kind: "test-weakened", level: "attend" as const, quote, facts: ["test-weakened"] }];
  await Promise.all([
    h.runtime.desk.notice(h.project, seat("p-a"), attend("one")),
    h.runtime.desk.notice(h.project, seat("p-b"), attend("two")),
    h.runtime.desk.notice(h.project, seat("p-c"), attend("three")),
    h.runtime.desk.notice(h.project, seat("p-d"), [{ kind: "destructive", level: "page", quote: "rm -rf /", facts: ["destructive"] }]),
  ]);
  const items = Object.values(incidentsOf(h.project.state));
  assert.equal(items.filter((item) => item.level === "attend" && item.told !== undefined).length, 1, "one attention a day, as set");
  assert.equal(items.filter((item) => item.held === "budget").length, 2);
  assert.ok(items.find((item) => item.kind === "destructive")!.told, "an irreversible act is never held for budget");
  await h.idle(sup);
  assert.equal((h.agents.get(sup)!.sent.join("\n").match(/INCIDENT/g) ?? []).length, 2);
  h.runtime.dispose();
});

test("two projects each hear about their own seats, though their incidents carry the same number", async () => {
  const { h, sup } = await laneWithPeer("outbox-two-projects.json", { attention: { watch: true } });
  const second = repo();
  const other = projectOf(second.root);
  mkdirSync(other.state, { recursive: true });
  writeFileSync(join(other.state, "settings.json"), JSON.stringify({ attention: { watch: true } }));
  const supB = h.add("sw2-supervisor-claude/claude-opus-5", second.root, "sup-b");
  const page = [{ kind: "destructive", level: "page" as const, quote: "rm -rf build", facts: ["destructive"] }];
  await h.runtime.desk.notice(h.project, { id: "p-a", provider: "sw2-peer-devin/swe-2-max" }, page);
  await h.runtime.desk.notice(other, { id: "p-b", provider: "sw2-peer-devin/swe-2-max" }, page);
  await h.idle(sup);
  await h.idle(supB);
  assert.match(h.agents.get(sup)!.sent.join("\n"), /INCIDENT I1 \(destructive, page\)/);
  assert.match(h.agents.get(supB)!.sent.join("\n"), /INCIDENT I1 \(destructive, page\)/, "the second project's owner is told too, not dropped as a repeat of the first");
  h.runtime.dispose();
});

test("a desk call the harness refused for bad JSON is recorded, though it never reached the desk", async () => {
  const { h, sup } = await laneWithPeer("outbox-malformed.json");
  h.beginTurn(sup);
  await h.endTurn(sup, "Opening the lane.", {
    type: "tool_call",
    callId: "c1",
    name: "mcp__team__open_lane",
    status: "failed",
    error: { content: "InputValidationError: mcp__team__open_lane was called with input that could not be parsed as JSON." },
    detail: { type: "unknown", input: { __unparsedToolInput: { raw: '{"title": "Build"' } }, output: null },
  });
  // The call never reached the desk and no watch follows the Supervisor, so this log is its only record.
  const log = readFileSync(join(h.project.state, "events.log"), "utf-8");
  assert.match(log, /"kind":"call\.malformed"/);
  assert.match(log, /"tool":"mcp__team__open_lane"/);
  assert.match(log, /"role":"supervisor"/, "the Supervisor is the one role no watch follows, so this is the only way it is ever said");
  assert.equal(log.match(/"ok":false/g), null, "and no failed desk call was recorded, because the desk was never reached");

  // Paseo hands the hook the whole session, so the next turn carries the same failed call again.
  await h.endTurn(sup, "Now the task.", { type: "tool_call", callId: "c2", name: "status", status: "completed", detail: {} });
  assert.equal(readFileSync(join(h.project.state, "events.log"), "utf-8").match(/"kind":"call\.malformed"/g)!.length, 1);

  // And it is trouble whatever the watch is doing: the harness refused the call, not the sensor.
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({ attention: { by: "jev" } }));
  const view = (await h.runtime.control.flow(h.project.slug)) as { watch: WatchView };
  assert.equal(view.watch.on, false);
  assert.deepEqual(view.watch.trouble.map((entry) => entry.kind), ["call.malformed"], "shown with the watch off, or nobody is told after all");
  h.runtime.dispose();
});

test("with the watch off a lane's own record is not gone through either", async () => {
  const { h, sup, lane, peer } = await laneWithPeer("outbox-history-off.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({ attention: { by: "jev" } }));
  for (const round of [1, 2, 3]) {
    await h.call(peer, "peer", "done", { outcome: "complete", summary: `round ${round}` });
    await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "not yet" });
  }
  await h.tick();
  await h.idle(sup);
  // History facts need no key to compute, which is why they once kept mailing with the watch off.
  assert.equal(existsSync(join(h.project.state, "incidents.json")), false);
  h.runtime.dispose();
});

test("by a Watcher seat a lane's own record is gone through with no key", async () => {
  const { h, sup, lane, peer } = await laneWithPeer("outbox-history-seat.json");
  writeFileSync(join(HOME, ".local", "share", "seatworks-v2", "settings.json"), JSON.stringify({}));
  for (const round of [1, 2, 3]) {
    await h.call(peer, "peer", "done", { outcome: "complete", summary: `round ${round}` });
    await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "not yet" });
  }
  await h.tick();
  await h.idle(sup);
  const book = JSON.parse(readFileSync(join(h.project.state, "incidents.json"), "utf-8")) as { items: Record<string, { kind: string }> };
  assert.deepEqual(Object.values(book.items).map((item) => item.kind), ["rework-loop"]);
  h.runtime.dispose();
});

test("a task the Lead keeps sending back is an incident about the Lead, raised once and never shown to it", async () => {
  const { h, sup, lane, peer } = await laneWithPeer("outbox-history.json", { attention: { watch: true } });
  for (const round of [1, 2, 3]) {
    await h.call(peer, "peer", "done", { outcome: "complete", summary: `round ${round}` });
    await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "not yet" });
  }
  assert.equal(h.ledger().tasks["L1-T1"]!.reworks, 3, "three sendings-back are on the record");

  await h.tick();
  await h.idle(sup);
  const told = h.agents.get(sup)!.sent.join("\n");
  assert.match(told, /INCIDENT I1 \(rework-loop, attend\) on the Lead of L1 \(Build\)/, "the seat it is about is the one that decides to send it back");
  assert.match(told, /What was seen: L1-T1 \(Clean build\) has been sent back 3 times/);

  // Three sendings-back stay three forever, so once marked the unchanged record must not raise again.
  const marked = await h.call(sup, "supervisor", "ack", { id: "I1", verdict: "noise", note: "expected: the brief changed under it" });
  assert.equal(marked.ok, true, marked.text);
  await h.tick();
  await h.tick();
  assert.deepEqual(Object.keys(incidentsOf(h.project.state)), ["I1"], "the same three sendings-back are not raised again once they have been marked");

  // A fourth is new evidence, and is raised.
  await h.call(peer, "peer", "done", { outcome: "complete", summary: "round 4" });
  await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "still not" });
  await h.tick();
  assert.deepEqual(Object.keys(incidentsOf(h.project.state)), ["I1", "I2"], "a fourth sending-back is something new to say");

  h.runtime.dispose();
});

test("a standing condition held back while the watch is off is still there to tell when it is turned on", async () => {
  // A lane's history never changes on its own, so a condition held while off must be told when turned on.
  const { h, sup, lane, peer } = await laneWithPeer("outbox-history-shadow.json");
  for (const round of [1, 2, 3]) {
    await h.call(peer, "peer", "done", { outcome: "complete", summary: `round ${round}` });
    await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "not yet" });
  }
  await h.tick();
  await h.idle(sup);
  assert.deepEqual(Object.values(incidentsOf(h.project.state)).map((item) => [item.kind, item.held]), [["rework-loop", "shadow"]]);
  assert.doesNotMatch(h.agents.get(sup)!.sent.join("\n"), /INCIDENT/);

  writeFileSync(join(h.project.state, "settings.json"), JSON.stringify({ attention: { watch: true } }));
  await h.tick();
  await h.idle(sup);
  assert.match(h.agents.get(sup)!.sent.join("\n"), /INCIDENT I1 \(rework-loop, attend\)/, "the same unchanged record is told once the owner turns it on");
  assert.deepEqual(Object.keys(incidentsOf(h.project.state)), ["I1"], "and it is the incident already on the book, not a second one");
  h.runtime.dispose();
});

test("a lane whose Lead has gone raises nothing about it, since nothing would ever close it", async () => {
  const { h, lane, peer } = await laneWithPeer("outbox-history-gone.json", { attention: { watch: true } });
  for (const round of [1, 2, 3]) {
    await h.call(peer, "peer", "done", { outcome: "complete", summary: `round ${round}` });
    await h.call(lane.lead!, "lead", "rework", { task: "L1-T1", text: "not yet" });
  }
  h.agents.get(lane.lead!)!.archivedAt = new Date().toISOString();
  await h.tick();
  assert.deepEqual(Object.keys(incidentsOf(h.project.state)), [], "an incident about a seat that has gone is one nobody can close");
  h.runtime.dispose();
});

test("every call is held to the schema the seat was shown, and told what it takes", async () => {
  // An unchecking harness sent prose, misnamed fields and lists, and the desk wrote "No summary given." into hand-backs.
  const { h, lane, peer } = await laneWithPeer("outbox-schema.json");
  const prose = await h.call(peer, "peer", "done", { outcome: "I finished the module and tests pass", summary: "built it" });
  assert.equal(prose.ok, false, prose.text);
  assert.match(prose.text, /outcome must be one of complete, partial, blocked/);
  const misnamed = await h.call(peer, "peer", "done", { outcome: "complete", summary: "built it", commits: "abc", checks: ["npm test"] });
  assert.equal(misnamed.ok, false);
  assert.match(misnamed.text, /no field commits/);
  assert.match(misnamed.text, /checks must be text/);
  assert.match(misnamed.text, /It takes outcome, summary, and optionally commit, checks, leftUndone, discovered/);
  assert.equal(h.ledger().tasks["L1-T1"]!.status, "running", "nothing was handed back");
  const report = await h.call(lane.lead!, "lead", "report", { summary: "done", carries: "a note" });
  assert.equal(report.ok, false);
  assert.match(report.text, /needs ready/);
  const blank = await h.call(peer, "peer", "done", { outcome: "complete", summary: "  " });
  assert.match(blank.text, /needs summary/, "a required text has to say something");
  h.runtime.dispose();
});

test("a patrol round files finished lanes past the newest few into the archive, and leaves the rest", async () => {
  const h = harness("outbox-archive.json");
  h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.tick(Date.now());
  const ledger = h.ledger();
  for (let n = 1; n <= KEEP_CLOSED_LANES + 1; n++) {
    ledger.lanes[`L${n}`] = { id: `L${n}`, title: `old ${n}`, outcome: "", acceptance: [], outOfScope: [], base: "main", branch: `lane/l${n}`, writeSet: [], contracts: [], opener: "sup", status: "closed", openedAt: n, tasks: 0, lead: `gone-lead-${n}` };
  }
  ledger.seq.lane = KEEP_CLOSED_LANES + 1;
  saveLedger(h.project.state, ledger);
  mkdirSync(join(h.project.state, "handbacks"), { recursive: true });
  writeFileSync(join(h.project.state, "handbacks", "L1-T1-1.md"), "what L1 handed back");
  await h.tick(Date.now());
  assert.ok(!existsSync(join(h.project.state, "handbacks", "L1-T1-1.md")), "its hand-back went with it");
  assert.equal(h.ledger().lanes.L1, undefined, "the oldest finished lane left the ledger");
  assert.equal(Object.keys(h.ledger().lanes).length, KEEP_CLOSED_LANES);
  const filed = gunzipSync(readFileSync(join(h.project.state, "archive", "L1.json.gz"))).toString("utf-8");
  assert.match(filed, /"id":"L1"/);
  assert.match(filed, /what L1 handed back/);
  h.runtime.dispose();
});

test("a Watcher's finding on a Peer whose work was accepted while it read still reaches the Lead, while the lane is open", async () => {
  const { h, lane, peer, timeline } = await laneWithPeer("outbox-raise-gone.json", bySeat({ watch: true }));
  const [watcher] = watchersOf(h);
  await h.idle(watcher!.id);
  timeline.beat("turn_started", "t1");
  timeline.add({ type: "user_message", text: "Clean the build" }, "t1");
  timeline.add({ type: "reasoning", text: "The caller still wants the old shape, so a small adapter will keep it compiling." }, "t1");
  timeline.add({ type: "tool_call", callId: "c1", name: "Write", status: "completed", detail: { type: "write", filePath: "src/legacy-adapter.ts", content: "export const old = () => fresh();\n" } }, "t1");
  timeline.beat("turn_completed", "t1");
  await read(h, watcher!.id);
  // As seen live: the Lead accepts and the Peer is let go a minute before the Watcher's reading of its last turn is done.
  assert.equal((await h.call(peer, "peer", "done", { outcome: "complete", summary: "done", checks: "none run" })).ok, true);
  h.agents.get(peer)!.status = "idle";
  const accepted = await h.call(lane.lead!, "lead", "accept", { task: "L1-T1" });
  assert.equal(accepted.ok, true, accepted.text);
  assert.notEqual(h.agents.get(peer)!.archivedAt, null);
  const raised = await h.call(watcher!.id, "watcher", "raise", { kind: "missing_mechanism", step: "R1.S1", why: "a shim" });
  assert.equal(raised.ok, true, raised.text);
  await h.idle(lane.lead!);
  assert.match(h.agents.get(lane.lead!)!.sent.join("\n"), /INCIDENT I1 \(missing_mechanism, attend\) on the Peer on L1-T1/);
  h.runtime.dispose();
});

test("mail a call brings about is not steered into the caller's turn until the caller has taken the call's answer", async () => {
  const h = harness("outbox-call-steer.json");
  const sup = h.add("sw2-supervisor-claude/claude-opus-5", h.root, "sup");
  await h.call(sup, "supervisor", "open_lane", { title: "Build", outcome: "a.txt changes", acceptance: ["a"], outOfScope: ["anything else in the repository"] });
  const lead = h.ledger().lanes.L1!.lead!;
  const seat = h.agents.get(lead)!;
  // As seen live: a Lead well into a long turn lays its plan out, and the plan's first task starts at once.
  seat.status = "running";
  h.runtime.outbox.turnStarted(lead, Date.now() - 2 * 60_000);
  const spool = (h.runtime as unknown as { spool: string }).spool;
  const replyFile = join(spool, "replies", "call-1.json");
  mkdirSync(join(spool, "requests"), { recursive: true });
  const task = { key: "build", title: "Clean build", goal: "g", acceptance: ["a"], owned: ["a.txt"], outOfScope: ["the rest of the repository"] };
  writeFileSync(join(spool, "requests", "call-1.json"), JSON.stringify({ id: "call-1", agent: lead, role: "lead", tool: "plan_tasks", args: { tasks: [task] }, cwd: h.root, at: Date.now() }));
  (h.runtime as unknown as { serveSpool(): void }).serveSpool();
  for (let i = 0; i < 100 && !existsSync(replyFile); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(readFileSync(replyFile, "utf-8"), /The plan is recorded/);
  assert.equal(h.ledger().tasks["L1-T1"]?.status, "running");
  assert.deepEqual([...seat.steered, ...seat.sent].filter((text) => /L1-T1/.test(text)), [], "a text arriving while a call waits is taken as the call being cut short");
  await h.tick();
  assert.deepEqual(seat.steered.filter((text) => /L1-T1/.test(text)), [], "answered is not taken: the bridge has not read it yet");
  // The bridge takes the answer, and the next round delivers what waited.
  rmSync(replyFile);
  await h.tick();
  assert.match(seat.steered.join("\n"), /L1-T1/);
  h.runtime.dispose();
});
