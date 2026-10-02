import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EvidenceRunner } from "../../server/satellites/evidence/runner.ts";

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" }).trim();

const ENVIRONMENT = ["ECONNREFUSED", "Cannot find module"];

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
    runner: new EvidenceRunner(root, scratch),
  };
}

test("checks run on the very commit in a copy that is gone afterwards", async () => {
  const { runner, head, scratch } = repo("git rev-parse HEAD\n");
  const ran = await runner.run("k1", head, [{ name: "where", run: ["sh", "check.sh"] }], 30_000, ENVIRONMENT);
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
    ENVIRONMENT,
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
  const ran = await runner.run("k3", head, [{ name: "slow", run: ["sh", "check.sh"] }], 500, ENVIRONMENT);
  assert.equal(ran.steps[0]?.exit, 124);
  assert.match(ran.summary, /killed after/);
});

test("a step ends when its command does, and what it left running ends with it", async () => {
  // The sleeper keeps the step's output open: the step can only end at once if the sleeper was ended.
  const { runner, head } = repo("sleep 600 &\necho started\n");
  const ran = await runner.run("k4", head, [{ name: "leaves a server", run: ["sh", "check.sh"] }], 5_000, ENVIRONMENT);
  assert.deepEqual(
    ran.steps.map((s) => [s.name, s.exit]),
    [["leaves a server", 0]],
  );
  assert.equal(ran.ok, true);
});

test(
  "a runner stopped ends the step it runs, runs no further step, and its run is no pass",
  { timeout: 30_000 },
  async () => {
    const { runner, head, root, scratch } = repo("true\n");
    const gate = join(root, "..", `${root.split("/").pop()!}-gate`);
    execFileSync("mkfifo", [gate]);
    const steps = [
      { name: "slow", run: ["sh", "-c", `echo started > ${gate}; exec sleep 600`] },
      { name: "never", run: ["true"] },
    ];
    const running = runner.run("k5", head, steps, 600_000, ENVIRONMENT);
    assert.equal(await readFile(gate, "utf8"), "started\n", "the step is running");
    runner.stop();
    const ran = await running;
    assert.equal(ran.ok, false);
    assert.match(ran.summary, /stopped before its checks ended/);
    assert.deepEqual(
      ran.steps.map((s) => s.name),
      ["slow"],
    );
    assert.deepEqual(readdirSync(scratch), [], "and its copy is gone");
  },
);

test("a runner stopped while it makes the copy starts no step", async () => {
  const { runner, head, root } = repo("true\n");
  const ran = join(root, "..", `${root.split("/").pop()!}-ran`);
  const running = runner.run("k6", head, [{ name: "writes", run: ["touch", ran] }], 30_000, ENVIRONMENT);
  runner.stop();
  assert.deepEqual(await running, { ok: false, steps: [], summary: "the run was stopped before its checks ended" });
  assert.equal(existsSync(ran), false);
});
