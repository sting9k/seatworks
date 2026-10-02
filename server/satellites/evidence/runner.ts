import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, Step } from "../../../shared/contracts/ledger.ts";
import { git, said, sha } from "../workspace/git.ts";

export type Ran = { ok: boolean; steps: Step[]; summary: string };

/** Output kept per step: its tail, where a failure says why; a long build log never sits whole in memory. */
const TAIL_BYTES = 8 * 1024;

/** What a guard runs: when its input ends, it ends the process group it was started for. */
const GUARD = `
process.stdin.on("end", () => {
  const group = Number(process.argv[1]);
  try {
    process.kill(process.platform === "win32" ? group : -group, "SIGKILL");
  } catch {}
});
process.stdin.resume();
`;

/** A process beside a step, on a pipe from this one: once this process is gone, however it went, it ends the step. */
function guard(group: number): { end(): Promise<void> } {
  const child = spawn(process.execPath, ["-e", GUARD, String(group)], {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
    // This process may run as an Electron binary, which is Node only when told so.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  // A guard that could not start guards nothing: the step runs all the same, and `stop` still ends it.
  const gone = new Promise<void>((resolve) => {
    child.on("error", () => {
      resolve();
    });
    child.on("close", () => {
      resolve();
    });
  });
  child.stdin.on("error", () => undefined);
  return {
    end: () => {
      child.stdin.end();
      return gone;
    },
  };
}

/** Runs the project's checks on one commit in a throwaway copy; it never turns a failure into a pass. */
export class EvidenceRunner {
  private readonly repo: string;
  private readonly scratch: string;
  /** The process group of each step now running, which `stop` ends. */
  private readonly running = new Set<number>();
  private stopped = false;

  constructor(repo: string, scratch: string) {
    this.repo = repo;
    this.scratch = scratch;
  }

  /** Ends every step now running with what it started: a check left running would outlive whoever asked for it. */
  stop(): void {
    this.stopped = true;
    for (const group of this.running) killGroup(group);
  }

  /** `environment` holds the shapes of a failure that is the environment's and not the code's. */
  async run(
    key: string,
    subject: string,
    steps: readonly Check[],
    timeoutMs: number,
    environment: readonly string[],
  ): Promise<Ran> {
    const at = await sha(this.repo, subject);
    if (at === null) return { ok: false, steps: [], summary: `${subject} is not in the repository` };
    mkdirSync(this.scratch, { recursive: true });
    const path = join(this.scratch, key.replace(/[^A-Za-z0-9._-]/g, "_"));
    if (existsSync(path)) await git(this.repo, ["worktree", "remove", "--force", "--force", path]);
    const made = await git(this.repo, ["worktree", "add", "--detach", path, at], 300_000);
    if (made.code !== 0) {
      // A failed add can leave git's record of the copy behind; prune it so nothing accumulates.
      await git(this.repo, ["worktree", "prune"]);
      return { ok: false, steps: [], summary: `no copy for the run: ${said(made)}` };
    }
    try {
      const results: Step[] = [];
      let failed: { name: string; tail: string } | null = null;
      for (const step of steps) {
        if (this.stopped) break;
        const r = await runStep(path, step, timeoutMs, this.running);
        results.push({
          name: step.name,
          exit: r.exit,
          seconds: r.seconds,
          cause: r.exit !== 0 && environment.some((p) => new RegExp(p, "i").test(r.tail)) ? "environment" : null,
        });
        if (r.exit !== 0) {
          failed = { name: step.name, tail: r.tail };
          break;
        }
      }
      if (this.stopped) return { ok: false, steps: results, summary: "the run was stopped before its checks ended" };
      if ((await sha(path, "HEAD")) !== at)
        return { ok: false, steps: results, summary: "the copy moved while the checks ran" };
      if (failed)
        return {
          ok: false,
          steps: results,
          summary: `${failed.name} failed:\n${failed.tail.split("\n").slice(-40).join("\n")}`,
        };
      return { ok: true, steps: results, summary: `${results.length} check${results.length === 1 ? "" : "s"} passed` };
    } finally {
      await git(this.repo, ["worktree", "remove", "--force", "--force", path], 120_000);
    }
  }
}

/** One step as argv, in its own process group, which is ended whole when the command ends or runs past the timeout. */
function runStep(
  cwd: string,
  step: Check,
  timeoutMs: number,
  running: Set<number>,
): Promise<{ exit: number; seconds: number; tail: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const [command, ...args] = step.run;
    const child = spawn(command ?? "", args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
    });
    const group = child.pid;
    const guarded = group === undefined ? null : guard(group);
    if (group !== undefined) running.add(group);
    let tail = Buffer.alloc(0);
    const keep = (chunk: Buffer) => {
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > TAIL_BYTES) tail = tail.subarray(tail.length - TAIL_BYTES);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    const done = (exit: number, extra = "") => {
      clearTimeout(timer);
      if (group !== undefined) running.delete(group);
      const ran = { exit, seconds: (Date.now() - started) / 1000, tail: tail.toString("utf8") + extra };
      // The step is over once its guard is gone too, so a run that has answered has left no process behind.
      void (guarded?.end() ?? Promise.resolve()).then(() => {
        resolve(ran);
      });
    };
    child.on("error", (error) => {
      done(127, `\n${error.message}`);
    });
    // The command's end is the step's: what it left running holds the step's output open, and nothing would end it.
    child.on("exit", () => {
      killGroup(group);
    });
    child.on("close", (code, signal) => {
      done(timedOut ? 124 : (code ?? (signal ? 128 : 1)), timedOut ? `\nkilled after ${timeoutMs / 1000}s` : "");
    });
  });
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
  } catch {
    // Already gone: nothing is left to stop.
  }
}
