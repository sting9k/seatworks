import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EvidenceRunner } from "../../server/satellites/evidence/runner.ts";

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" }).trim();

function repo(script: string) {
  const root = mkdtempSync(join(tmpdir(), "sw-ev-"));
  run(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, "check.sh"), script);
  run(root, "add", ".");
  run(root, "commit", "-q", "-m", "start");
  const scratch = join(root, "..", `${root.split("/").pop()!}-runs`);
  return {
    root,
    scratch,
    head: run(root, "rev-parse", "HEAD"),
    runner: new EvidenceRunner(root, scratch, ["ECONNREFUSED", "Cannot find module"]),
  };
}

test("checks run on the very commit in a copy that is gone afterwards", async () => {
  const { runner, head, scratch } = repo("git rev-parse HEAD\n");
  const ran = await runner.run("k1", head, [{ name: "where", run: ["sh", "check.sh"] }], 30_000);
  assert.equal(ran.ok, true);
  assert.equal(ran.steps[0]?.exit, 0);
  assert.deepEqual(existsSync(scratch) ? readdirSync(scratch) : [], []);
});

test("a failing step stops the run, keeps its output's tail, and a known shape is named environment", async () => {
  const { runner, head } = repo("echo 'Error: Cannot find module left-pad' >&2\nexit 3\n");
  const ran = await runner.run(
    "k2",
    head,
    [
      { name: "unit", run: ["sh", "check.sh"] },
      { name: "never", run: ["true"] },
    ],
    30_000,
  );
  assert.equal(ran.ok, false);
  assert.deepEqual(
    ran.steps.map((s) => [s.name, s.exit, s.cause]),
    [["unit", 3, "environment"]],
  );
  assert.match(ran.summary, /Cannot find module/);
});

test("a step past its timeout is killed with what it started", async () => {
  const { runner, head } = repo("sleep 30 &\nsleep 30\n");
  const ran = await runner.run("k3", head, [{ name: "slow", run: ["sh", "check.sh"] }], 500);
  assert.equal(ran.steps[0]?.exit, 124);
  assert.match(ran.summary, /killed after/);
});
