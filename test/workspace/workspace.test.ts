import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Workspace } from "../../server/satellites/workspace/workspace.ts";

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

function repo() {
  const root = mkdtempSync(join(tmpdir(), "sw-repo-"));
  run(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, "a.txt"), "one\n");
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "start");
  return { root: realpathSync(root), ws: new Workspace(realpathSync(root)) };
}

/** A worktree of the repository on a new branch off main, as the host makes one for work handed out. */
function tree(root: string, branch: string): string {
  const path = join(realpathSync(mkdtempSync(join(tmpdir(), "sw-trees-"))), branch.replaceAll("/", "-"));
  run(root, "worktree", "add", "-q", "-b", branch, path, "main");
  return path;
}

function commitIn(cwd: string, file: string, text: string): string {
  writeFileSync(join(cwd, file), text);
  run(cwd, "add", ".");
  run(cwd, "commit", "-q", "-m", `edit ${file}`);
  return run(cwd, "rev-parse", "HEAD");
}

test("the plugin's git runs no hook and no filter an agent planted in the repository", async () => {
  const { root, ws } = repo();
  const hook = join(root, "..", `hook-ran-${Date.now()}`);
  writeFileSync(join(root, ".git", "hooks", "post-merge"), `#!/bin/sh\ntouch ${hook}\n`);
  chmodSync(join(root, ".git", "hooks", "post-merge"), 0o755);
  const smudge = join(root, "..", `smudge-ran-${Date.now()}`);
  run(root, "config", "filter.x.smudge", `touch ${smudge}; cat`);
  writeFileSync(join(root, ".gitattributes"), "*.txt filter=x\n");
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "attributes");
  const from = run(root, "rev-parse", "main");
  const tip = commitIn(tree(root, "sw/p/1"), "b.txt", "work\n");
  // The landing checks the work out in the Human's own folder, where a hook and a filter would run.
  for (const ran of [hook, smudge]) if (existsSync(ran)) rmSync(ran);
  assert.deepEqual(await ws.advance("main", from, tip), { sha: tip });
  assert.equal(readFileSync(join(root, "b.txt"), "utf8"), "work\n", "the work is checked out there");
  assert.equal(existsSync(hook), false, "no hook ran");
  assert.equal(existsSync(smudge), false, "no smudge filter ran on the checkout");
});

test("a note is not written over an instruction file the Human keeps ignored in their checkout", async () => {
  const { root, ws } = repo();
  writeFileSync(join(root, ".gitignore"), "AGENTS.md\n");
  run(root, "add", ".gitignore");
  run(root, "commit", "-q", "-m", "ignore");
  writeFileSync(join(root, "AGENTS.md"), "MY PRIVATE NOTES\n");
  const main = run(root, "rev-parse", "main");
  const put = await ws.putBlock("main", "AGENTS.md", "seatworks", "The team's note.", "note");
  assert.ok("refused" in put, JSON.stringify(put));
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "MY PRIVATE NOTES\n");
  assert.equal(run(root, "rev-parse", "main"), main, "nothing committed");
});

test("a candidate takes the moved parent in without a checkout; a conflict names its files", async () => {
  const { root, ws } = repo();
  const copy = tree(root, "sw/p/1");
  const work = commitIn(copy, "b.txt", "peer\n");
  const clean = await ws.candidate(work, "main", "Integrate 1");
  assert.deepEqual(
    clean,
    { candidate: work, parentHead: run(root, "rev-parse", "main") },
    "nothing moved: the commit itself",
  );
  assert.deepEqual(
    await ws.candidate(work.slice(0, 9), "main", "Integrate 1"),
    clean,
    "named by an abbreviation it is the same commit, by its whole name",
  );

  commitIn(root, "c.txt", "base moved\n");
  const merged = await ws.candidate(work, "main", "Integrate 1");
  assert.ok("candidate" in merged && merged.candidate !== work);
  assert.equal(run(root, "show", `${merged.candidate}:b.txt`), "peer");
  assert.equal(run(root, "show", `${merged.candidate}:c.txt`), "base moved");

  const landed = commitIn(root, "a.txt", "base edit\n");
  const clash = commitIn(copy, "a.txt", "peer edit\n");
  assert.deepEqual(
    await ws.candidate(clash, "main", "Integrate 1"),
    { conflict: ["a.txt"], since: [`${landed.slice(0, 7)} edit a.txt`] },
    "with what the parent took in, in that file, since the two parted: not what it took in elsewhere",
  );
});

test("work committed on the parent's own branch is taken in as the parent stands: no merge is made of it", async () => {
  const { ws } = repo();
  const lane = tree(ws.repo, "sw/p/1");
  const first = commitIn(lane, "b.txt", "one peer\n");
  const head = commitIn(lane, "c.txt", "another, after it\n");
  assert.deepEqual(await ws.candidate(first, "sw/p/1", "Integrate 1.1"), { candidate: head, parentHead: head });
  assert.deepEqual(await ws.candidate(head, "sw/p/1", "Integrate 1.2"), { candidate: head, parentHead: head });
  assert.deepEqual(await ws.advance("sw/p/1", head, head), { sha: head }, "and the branch, checked out there, stays");
});

test("advance moves a branch only from the head it was read at, and a checked-out base only when clean", async () => {
  const { root, ws } = repo();
  const from = run(root, "rev-parse", "main");
  const tip = commitIn(tree(root, "sw/p/1"), "b.txt", "x\n");
  writeFileSync(join(root, "a.txt"), "dirty\n");
  assert.deepEqual(await ws.advance("main", from, tip), { refused: "main is checked out with uncommitted changes" });
  run(root, "checkout", "--", "a.txt");
  assert.deepEqual(await ws.advance("main", from, tip), { sha: tip });
  assert.equal(run(root, "rev-parse", "main"), tip);
  assert.deepEqual(await ws.advance("main", from, tip), { sha: tip }, "asked again once it landed: landed");

  run(root, "branch", "lane", from);
  assert.deepEqual(await ws.advance("lane", tip, tip), { refused: "moved" });
});

test("publish pushes only the head it was asked at, and a moved tip is refused with what it found", async () => {
  const { root, ws } = repo();
  const remote = mkdtempSync(join(tmpdir(), "sw-remote-"));
  run(remote, "init", "-q", "--bare", "-b", "main");
  run(root, "remote", "add", "origin", remote);
  const head = run(root, "rev-parse", "main");

  const moved = await ws.publish("main", "origin", "0".repeat(40));
  assert.ok("refused" in moved);
  assert.equal(moved.at, head);
  assert.equal(run(remote, "for-each-ref"), "", "nothing was pushed");

  assert.deepEqual(await ws.publish("main", "origin", head), { sha: head });
  assert.equal(run(remote, "rev-parse", "refs/heads/main"), head);

  const next = commitIn(root, "b.txt", "landed meanwhile\n");
  const again = await ws.publish("main", "origin", head);
  assert.ok("refused" in again);
  assert.equal(again.at, next);
  assert.equal(run(remote, "rev-parse", "refs/heads/main"), head, "the new tip was not pushed");
  assert.deepEqual(await ws.publish("main", "origin", next), { sha: next });

  const note = await ws.putBlock("main", "AGENTS.md", "seatworks", "The team's note.", "note");
  assert.ok("sha" in note);
  assert.deepEqual(
    await ws.publish("main", "origin", next),
    { sha: note.sha },
    "a tip that holds only the plugin's own commits over the head asked for is that landing",
  );
  const theirs = commitIn(root, "c.txt", "the Human's\n");
  const over = await ws.putBlock("main", "AGENTS.md", "seatworks", "The team's note, again.", "note");
  assert.ok("sha" in over);
  const mixed = await ws.publish("main", "origin", note.sha);
  assert.ok("refused" in mixed, "a commit of anyone else's among them is a base that moved");
  assert.equal(mixed.at, over.sha);
  assert.equal(run(remote, "rev-parse", "refs/heads/main"), note.sha);
  assert.notEqual(theirs, over.sha);
});

test("a worktree is found by the branch checked out in it and says whether it holds work not yet committed; a branch goes once what it holds is merged", async () => {
  const { root, ws } = repo();
  const lane = tree(root, "sw/p/1");
  const other = tree(root, "sw/p/10");
  tree(root, "elsewhere");
  assert.deepEqual(await ws.trees("sw/p/"), [
    { path: lane, branch: "sw/p/1", unsaved: false },
    { path: other, branch: "sw/p/10", unsaved: false },
  ]);
  writeFileSync(join(lane, "wip.txt"), "unsaved");
  assert.deepEqual(await ws.treeOf("sw/p/1"), { path: lane, branch: "sw/p/1", unsaved: true }, "by its whole name");
  assert.deepEqual(await ws.treeOf("main"), { path: root, branch: "main", unsaved: false }, "the Human's own too");
  assert.equal(await ws.treeOf("sw/p/2"), null);

  run(lane, "add", ".");
  run(lane, "commit", "-q", "-m", "wip");
  run(root, "worktree", "remove", "--force", lane);
  await ws.dropMerged("sw/p/1", "main");
  assert.notEqual(run(root, "branch", "--list", "sw/p/1"), "", "a branch whose work nothing else holds stays");
  run(root, "merge", "-q", "--ff-only", "sw/p/1");
  await ws.dropMerged("sw/p/1", "main");
  assert.equal(run(root, "branch", "--list", "sw/p/1"), "", "merged, it goes");
});

test("a scope's change is read against where it started, and under its own paths where others work on the same branch", async () => {
  const { root, ws } = repo();
  const lane = tree(root, "sw/p/1");
  const start = run(lane, "rev-parse", "HEAD");
  execFileSync("mkdir", ["-p", join(lane, "src/a"), join(lane, "src/b")]);
  commitIn(lane, "src/a/one.txt", "mine\n");
  const tip = commitIn(lane, "src/b/two.txt", "another's\n");
  const whole = await ws.diff(start, tip);
  assert.match(whole, /src\/a\/one\.txt/);
  assert.match(whole, /src\/b\/two\.txt/);
  const mine = await ws.diff(start, tip, ["src/a/"]);
  assert.match(mine, /\+mine/);
  assert.doesNotMatch(mine, /two\.txt/, "what another did under its own paths is not this scope's change");
  assert.deepEqual(
    (await ws.fileDiffs(start, tip, ["src/a/"])).map((file) => file.path),
    ["src/a/one.txt"],
  );
  assert.equal(
    await ws.diff(tip, tip, ["src/a/"]),
    `Nothing changed between ${tip} and ${tip} under src/a/.`,
    "a change that is none says so, rather than answer with nothing",
  );
});

test("each branch made for a project says how many of its commits the base does not hold: none once merged, all where there is no base", async () => {
  const { root, ws } = repo();
  for (const key of ["1", "2"]) {
    const copy = tree(root, `sw/p/${key}`);
    commitIn(copy, `${key}.txt`, "work");
    if (key === "2") commitIn(copy, "more.txt", "more work");
  }
  run(root, "merge", "-q", "--ff-only", "sw/p/1");

  assert.deepEqual(await ws.branchesUnder("sw/p/", "main"), [
    { branch: "sw/p/1", ahead: 0 },
    { branch: "sw/p/2", ahead: 2 },
  ]);
  assert.deepEqual(
    (await ws.branchesUnder("sw/p/", "gone")).map((found) => found.ahead),
    [2, 3],
    "a base that is not there holds none of them, so nothing reads as merged",
  );
  assert.deepEqual(
    (await ws.branchesUnder("sw/p/", null)).map((found) => found.ahead),
    [2, 3],
  );
});

test("a name counts as settled when code outside the tests has it, at a revision or in a copy's working tree", async () => {
  const { root, ws } = repo();
  writeFileSync(join(root, "points.ts"), "export function addPoints() {}\n");
  execFileSync("mkdir", ["-p", join(root, "test")]);
  writeFileSync(join(root, "test", "points.test.ts"), "user.points = 1;\n");
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "points");
  const tests = /(^|\/)test\/|\.test\.[a-z]+$/;
  assert.deepEqual([...(await ws.namesIn(root, "main", ["addPoints", "points", "missing"], tests))], ["addPoints"]);
  const copy = tree(root, "sw/p/1");
  writeFileSync(join(copy, "user.ts"), "export type User = { points: number };\n");
  assert.deepEqual([...(await ws.namesIn(copy, null, ["points", "missing"], tests))], ["points"]);

  // Which paths are tests is the caller's to say: a profile that names them another way is read that way.
  writeFileSync(join(copy, "points_check.go"), "func checkBonus() {}\n");
  assert.deepEqual([...(await ws.namesIn(copy, null, ["checkBonus"], tests))], ["checkBonus"]);
  assert.deepEqual([...(await ws.namesIn(copy, null, ["checkBonus", "points"], /_check\.go$/))], ["points"]);
});
