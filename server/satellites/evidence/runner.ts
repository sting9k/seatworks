import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, Step } from "../../../shared/contracts/ledger.ts";
import { git, said, sha } from "../workspace/git.ts";

export type Ran = { ok: boolean; steps: Step[]; summary: string };

/** Output kept per step: its tail, where a failure says why; a long build log never sits whole in memory. */
const TAIL_BYTES = 8 * 1024;

/** Runs the project's checks on one commit in a throwaway copy; it never turns a failure into a pass. */
export class EvidenceRunner {
  private readonly repo: string;
  private readonly scratch: string;
  private readonly environment: readonly RegExp[];

  constructor(repo: string, scratch: string, environmentPatterns: readonly string[]) {
    this.repo = repo;
    this.scratch = scratch;
    this.environment = environmentPatterns.map((p) => new RegExp(p, "i"));
  }

  async run(key: string, subject: string, steps: readonly Check[], timeoutMs: number): Promise<Ran> {
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
        const r = await runStep(path, step, timeoutMs);
        results.push({
          name: step.name,
          exit: r.exit,
          seconds: r.seconds,
          cause: r.exit === 0 ? null : this.causeOf(r.tail),
        });
        if (r.exit !== 0) {
          failed = { name: step.name, tail: r.tail };
          break;
        }
      }
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

  private causeOf(tail: string): Step["cause"] {
    return this.environment.some((p) => p.test(tail)) ? "environment" : null;
  }
}

/** One step as argv, in its own process group, killed with everything it started when it runs past the timeout. */
function runStep(
  cwd: string,
  step: Check,
  timeoutMs: number,
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
      resolve({ exit, seconds: (Date.now() - started) / 1000, tail: tail.toString("utf8") + extra });
    };
    child.on("error", (error) => {
      done(127, `\n${error.message}`);
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
