import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { installShim } from "../../server/core/shim.ts";

const script = join(import.meta.dirname, "../../bin/git-shim.ts");
const shimDir = installShim(mkdtempSync(join(tmpdir(), "sw-shim-")), script);

function copy() {
  const root = mkdtempSync(join(tmpdir(), "sw-copy-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  writeFileSync(join(root, "a.txt"), "a\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "a"], { cwd: root });
  return root;
}

/** Runs git as a seat does, through the shim; `seat` is what its seat adds to its environment. */
function gitIn(cwd: string, writes: boolean, seat: Record<string, string>, ...args: string[]) {
  const env = {
    ...process.env,
    PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    SEATWORKS_COPY: cwd,
    SEATWORKS_WRITES: writes ? "1" : "0",
    SEATWORKS_SHIM_DIR: shimDir,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
    ...seat,
  };
  const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  return { code: run.status, err: run.stderr };
}

const gitAs = (cwd: string, writes: boolean, ...args: string[]) => gitIn(cwd, writes, {}, ...args);

/** A file that says which paths a seat's neighbours hold, as the plugin keeps one for each seat. */
function heldFile(lines: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "sw-held-")), "a3");
  writeFileSync(file, lines);
  return file;
}

test("the launcher runs the plugin's executable as Node even when it is an Electron binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-shim-env-"));
  const probe = join(dir, "probe.ts");
  writeFileSync(probe, `console.log(process.env.ELECTRON_RUN_AS_NODE ?? "unset");\n`);
  const bin = installShim(dir, probe);
  if (process.platform === "win32") return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const out = execFileSync(join(bin, "git"), ["status"], { encoding: "utf8", env }).trim();
  assert.equal(out, "1");
});

test("the shim refuses what only the plugin does, however it is spelled, and passes the rest to git", () => {
  const cwd = copy();
  assert.equal(gitAs(cwd, true, "status").code, 0);
  assert.match(gitAs(cwd, true, "push", "origin", "main").err, /refused: `git push`/);
  assert.match(gitAs(cwd, true, "-C", ".", "--no-pager", "checkout", "-b", "x").err, /refused: `git checkout`/);
  execFileSync("git", ["config", "alias.ship", "push"], { cwd });
  assert.match(gitAs(cwd, true, "ship").err, /refused: `git push`/);
  assert.match(gitAs(cwd, true, "branch", "-D", "main").err, /never move, copy or delete/);
  assert.equal(gitAs(cwd, true, "branch", "topic").code, 0);
  assert.match(gitAs(cwd, true, "branch", "-Df", "topic").err, /never move, copy or delete/, "flags run together");
  assert.match(gitAs(cwd, true, "fetch", ".", "HEAD:topic").err, /refused: `git fetch`/, "a fetch into a branch");
  assert.match(gitAs(cwd, true, "fetch", ".", "+main:refs/heads/topic").err, /refused: `git fetch`/);
  assert.match(
    gitAs(cwd, true, "--attr-source", "HEAD", "checkout", "topic").err,
    /refused: `git checkout`/,
    "an option's value is not the subcommand",
  );
});

test("a copy that does not write runs git to read, never to commit, merge or reset", () => {
  const cwd = copy();
  writeFileSync(join(cwd, "b.txt"), "b\n");
  assert.equal(gitAs(cwd, false, "add", "b.txt").code, 0);
  assert.match(gitAs(cwd, false, "commit", "-m", "x").err, /you do not write/);
  assert.equal(gitAs(cwd, true, "commit", "-q", "-m", "x").code, 0);
});

test("git pointed outside the agent's own copy is refused", () => {
  const cwd = copy();
  const other = copy();
  assert.match(gitAs(cwd, true, "-C", other, "status").err, /outside your own copy/);
  assert.match(gitAs(cwd, true, `--git-dir=${join(other, ".git")}`, "status").err, /another repository/);
});

test("in a worktree others work in, a seat's git takes nothing that is a neighbour's: to stage, commit or drop the edits of a file another scope holds is refused, naming the scope; its own passes", () => {
  const cwd = copy();
  for (const dir of ["src/a", "src/b"]) mkdirSync(join(cwd, dir), { recursive: true });
  writeFileSync(join(cwd, "src/a/one.txt"), "one\n");
  writeFileSync(join(cwd, "src/b/two.txt"), "two\n");
  const seat = { SEATWORKS_HELD: heldFile("src/b/\t1.2\n") };
  const theirs = /src\/b\/two\.txt is scope 1\.2's to write \(it holds src\/b\/\)/;

  assert.match(gitIn(cwd, true, seat, "add", "-A").err, theirs, "everything in the folder is not its own");
  assert.match(gitIn(cwd, true, seat, "add", ".").err, theirs);
  assert.equal(gitIn(cwd, true, seat, "add", "src/a").code, 0, "its own, by name");
  assert.equal(gitIn(cwd, true, seat, "commit", "-q", "-m", "mine").code, 0);
  assert.equal(
    execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], { cwd, encoding: "utf8" }).trim(),
    "src/a/one.txt",
  );

  // Its neighbour commits its own file, then edits it again: the edit lies in the folder both work in.
  execFileSync("git", ["add", "src/b"], { cwd });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "theirs"], { cwd });
  writeFileSync(join(cwd, "src/b/two.txt"), "two, half done\n");
  writeFileSync(join(cwd, "src/a/one.txt"), "one, more\n");
  assert.match(
    gitIn(cwd, true, seat, "commit", "-a", "-m", "all of it").err,
    theirs,
    "all that changed is not its own",
  );
  assert.match(gitIn(cwd, true, seat, "restore", ".").err, theirs, "nor is it its own to throw away");
  assert.equal(gitIn(cwd, true, seat, "commit", "-q", "-m", "mine again", "src/a/one.txt").code, 0);
  assert.equal(
    readFileSync(join(cwd, "src/b/two.txt"), "utf8"),
    "two, half done\n",
    "the neighbour's edit is as it was",
  );

  for (const [args, says] of [
    [["reset", "--hard"], /`git reset`: others work in this worktree/],
    [["rebase", "HEAD~1"], /`git rebase`: others build on this branch's commits/],
    [["clean", "-fd"], /`git clean`: others work in this worktree/],
    [["commit", "--amend", "-m", "again"], /`git commit --amend`: the last commit here may be another's/],
  ] as const)
    assert.match(gitIn(cwd, true, seat, ...args).err, says);

  writeFileSync(join(cwd, "src/b/new.txt"), "new\n");
  assert.equal(
    gitIn(cwd, true, { SEATWORKS_HELD: heldFile("") }, "add", "-A").code,
    0,
    "with no neighbour, all is its",
  );
  assert.equal(
    gitIn(cwd, true, {}, "reset", "-q", "--hard").code,
    0,
    "and a seat alone in its worktree resets as it likes",
  );
});

test("a file is the innermost scope's that holds it: an owner that writes keeps off what it handed out, a task keeps off what its owner kept, and each takes its own", () => {
  const cwd = copy();
  mkdirSync(join(cwd, "src/a"), { recursive: true });
  writeFileSync(join(cwd, "src/a/one.txt"), "one\n");
  writeFileSync(join(cwd, "src/index.txt"), "index\n");
  // Each seat's file says whose a path is, the first line that holds a file deciding; a line with no scope is its own.
  const owner = { SEATWORKS_HELD: heldFile("src/a/\t1.1\nsrc/\t\n") };
  const task = { SEATWORKS_HELD: heldFile("src/a/\t\nsrc/\t1\n") };

  assert.match(
    gitIn(cwd, true, owner, "add", "-A").err,
    /src\/a\/one\.txt is scope 1\.1's to write \(it holds src\/a\/\)\. You handed it out: it is that scope's alone until it is taken in or dropped/,
    "what it handed out is the task's, though its own paths hold it too",
  );
  assert.match(
    gitIn(cwd, true, task, "add", "-A").err,
    /src\/index\.txt is scope 1's to write \(it holds src\/\)\. Name your own files; for a file another holds, ask the owner above you/,
    "what its owner kept is the owner's",
  );
  assert.equal(gitIn(cwd, true, task, "add", "src/a").code, 0, "the task takes its own");
  assert.equal(gitIn(cwd, true, task, "commit", "-q", "-m", "the task's").code, 0);
  assert.equal(gitIn(cwd, true, owner, "add", "src/index.txt").code, 0, "and the owner what it has not handed out");
  assert.equal(gitIn(cwd, true, owner, "commit", "-q", "-m", "the owner's own").code, 0);
  assert.equal(
    execFileSync("git", ["log", "--format=%s", "--name-only", "-2"], { cwd, encoding: "utf8" })
      .replace(/\n+/g, " ")
      .trim(),
    "the owner's own src/index.txt the task's src/a/one.txt",
  );
});

test("a lane's owner, which writes nothing, takes a branch in by hand: it merges, settles what conflicts in any file, and concludes the merge; no other commit is its to make", () => {
  const cwd = copy();
  execFileSync("git", ["branch", "base"], { cwd });
  const commit = (text: string) => {
    writeFileSync(join(cwd, "a.txt"), text);
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-am", text.trim()], { cwd });
  };
  commit("the lane's\n");
  execFileSync("git", ["checkout", "-q", "base"], { cwd });
  commit("the base's\n");
  execFileSync("git", ["checkout", "-q", "main"], { cwd });
  const owner = { SEATWORKS_HELD: heldFile("a.txt\t1.1\n"), SEATWORKS_MERGES: "1" };

  assert.match(gitIn(cwd, false, { SEATWORKS_HELD: owner.SEATWORKS_HELD }, "merge", "base").err, /you do not write/);
  writeFileSync(join(cwd, "b.txt"), "b\n");
  assert.equal(gitIn(cwd, false, owner, "add", "b.txt").code, 0);
  assert.match(
    gitIn(cwd, false, owner, "commit", "-m", "its own").err,
    /you do not write/,
    "with no merge to conclude",
  );
  execFileSync("git", ["rm", "-q", "--cached", "b.txt"], { cwd });

  const merged = gitIn(cwd, false, owner, "merge", "base");
  assert.doesNotMatch(merged.err, /refused/);
  assert.notEqual(merged.code, 0, "git stops at the conflict, for a hand to settle");
  writeFileSync(join(cwd, "a.txt"), "both\n");
  assert.equal(
    gitIn(cwd, false, owner, "add", "a.txt").code,
    0,
    "whoever merges settles a file a task of the lane holds",
  );
  assert.equal(gitIn(cwd, false, owner, "commit", "-q", "-m", "take the base in").code, 0);
  assert.equal(
    execFileSync("git", ["log", "-1", "--format=%p"], { cwd, encoding: "utf8" }).trim().split(" ").length,
    2,
  );
});
