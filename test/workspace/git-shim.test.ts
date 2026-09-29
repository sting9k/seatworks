import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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

function gitAs(cwd: string, writes: boolean, ...args: string[]) {
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
  };
  const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  return { code: run.status, err: run.stderr };
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
