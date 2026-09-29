import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Workspace, safeKey } from "../../server/satellites/workspace/workspace.ts";

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
  return { root, ws: new Workspace(root, join(root, "..", `${root.split("/").pop()!}-copies`)) };
}

function commitIn(cwd: string, file: string, text: string): string {
  writeFileSync(join(cwd, file), text);
  run(cwd, "add", ".");
  run(cwd, "commit", "-q", "-m", `edit ${file}`);
  return run(cwd, "rev-parse", "HEAD");
}

test("a writer gets a worktree on a branch of its own; asked again, the same copy", async () => {
  const { ws } = repo();
  const made = await ws.create("1.1", { kind: "writer", branch: "sw/p/1.1", from: "main" });
  assert.ok(made.ok);
  assert.equal(run(made.path, "symbolic-ref", "--short", "HEAD"), "sw/p/1.1");
  assert.deepEqual(await ws.create("1.1", { kind: "writer", branch: "sw/p/1.1", from: "main" }), made);
});

test("the plugin's git runs no hook and no filter an agent planted in the repository", async () => {
  const { root, ws } = repo();
  const hook = join(root, "..", `hook-ran-${Date.now()}`);
  writeFileSync(join(root, ".git", "hooks", "post-checkout"), `#!/bin/sh\ntouch ${hook}\n`);
  chmodSync(join(root, ".git", "hooks", "post-checkout"), 0o755);
  const smudge = join(root, "..", `smudge-ran-${Date.now()}`);
  run(root, "config", "filter.x.smudge", `touch ${smudge}; cat`);
  writeFileSync(join(root, ".gitattributes"), "*.txt filter=x\n");
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "attributes");
  const made = await ws.create("1", { kind: "writer", branch: "sw/p/1", from: "main" });
  assert.ok(made.ok);
  assert.equal(existsSync(hook), false, "no hook ran");
  assert.equal(existsSync(smudge), false, "no smudge filter ran on the copy's checkout");
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
  const copy = await ws.create("1", { kind: "writer", branch: "sw/p/1", from: "main" });
  assert.ok(copy.ok);
  const work = commitIn(copy.path, "b.txt", "peer\n");
  const clean = await ws.candidate(work, "main", "Integrate 1");
  assert.deepEqual(
    clean,
    { candidate: work, parentHead: run(root, "rev-parse", "main") },
    "nothing moved: the commit itself",
  );

  commitIn(root, "c.txt", "base moved\n");
  const merged = await ws.candidate(work, "main", "Integrate 1");
  assert.ok("candidate" in merged && merged.candidate !== work);
  assert.equal(run(root, "show", `${merged.candidate}:b.txt`), "peer");
  assert.equal(run(root, "show", `${merged.candidate}:c.txt`), "base moved");

  commitIn(root, "a.txt", "base edit\n");
  const clash = commitIn(copy.path, "a.txt", "peer edit\n");
  assert.deepEqual(await ws.candidate(clash, "main", "Integrate 1"), { conflict: ["a.txt"] });
});

test("advance moves a branch only from the head it was read at, and a checked-out base only when clean", async () => {
  const { root, ws } = repo();
  const copy = await ws.create("1", { kind: "writer", branch: "sw/p/1", from: "main" });
  assert.ok(copy.ok);
  const from = run(root, "rev-parse", "main");
  const tip = commitIn(copy.path, "b.txt", "x\n");
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
});

test("a copy holding uncommitted work is kept; a clean one goes, with its branch once merged", async () => {
  const { root, ws } = repo();
  const copy = await ws.create("1", { kind: "writer", branch: "sw/p/1", from: "main" });
  assert.ok(copy.ok);
  writeFileSync(join(copy.path, "wip.txt"), "unsaved");
  assert.ok("kept" in (await ws.remove("1", "sw/p/1", "main")));
  run(copy.path, "add", ".");
  run(copy.path, "commit", "-q", "-m", "wip");
  run(root, "merge", "-q", "--ff-only", "sw/p/1");
  assert.deepEqual(await ws.remove("1", "sw/p/1", "main"), { removed: true });
  assert.equal(existsSync(copy.path), false);
  assert.equal(run(root, "branch", "--list", "sw/p/1"), "");
});

test("a key with slashes and spaces becomes a safe path with a stable suffix", () => {
  assert.equal(safeKey("1.2"), "1.2");
  assert.match(safeKey("a b/c"), /^a_b_c-[0-9a-f]{8}$/);
  assert.equal(safeKey("a b/c"), safeKey("a b/c"));
});

test("a name counts as settled when code outside the tests has it, at a revision or in a copy's working tree", async () => {
  const { root, ws } = repo();
  writeFileSync(join(root, "points.ts"), "export function addPoints() {}\n");
  execFileSync("mkdir", ["-p", join(root, "test")]);
  writeFileSync(join(root, "test", "points.test.ts"), "user.points = 1;\n");
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "points");
  assert.deepEqual([...(await ws.namesIn(root, "main", ["addPoints", "points", "missing"]))], ["addPoints"]);
  const copy = await ws.create("1", { kind: "writer", branch: "sw/p/1", from: "main" });
  assert.ok(copy.ok);
  writeFileSync(join(copy.path, "user.ts"), "export type User = { points: number };\n");
  assert.deepEqual([...(await ws.namesIn(copy.path, null, ["points", "missing"]))], ["points"]);
});
