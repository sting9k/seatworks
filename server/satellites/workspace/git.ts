import { execFile } from "node:child_process";
import { devNull } from "node:os";

export type Run = { code: number; stdout: string; stderr: string };

/** Keys whose value git runs as a command; one planted in a repository's own config is emptied for the plugin's git. */
const RUNS_COMMAND =
  "^(filter\\..+\\.(clean|smudge|process)|merge\\..+\\.driver|diff\\..+\\.(textconv|command)|core\\.(sshcommand|gitproxy|askpass|editor)|sequence\\.editor|gpg\\.(.+\\.)?program)$";

/** Subcommands that read or move refs and never run a filter or driver, so the config need not be read for them. */
const REFS_ONLY = new Set([
  "rev-parse",
  "symbolic-ref",
  "show-ref",
  "rev-list",
  "merge-base",
  "update-ref",
  "commit-tree",
  "for-each-ref",
  "branch",
  "config",
]);

/** Whose every commit of the plugin's own is, which is how one is told from anyone else's. */
export const PLUGIN_EMAIL = "seatworks@localhost";

/** What the plugin commits is made as seatworks and unsigned: the Human's name and signer are for their commits. */
export const AS_PLUGIN = [
  "-c",
  "user.name=seatworks",
  "-c",
  `user.email=${PLUGIN_EMAIL}`,
  "-c",
  "commit.gpgSign=false",
];

function spawn(args: readonly string[], timeout: number, env: Readonly<Record<string, string>> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        const code = error
          ? typeof (error as { code?: unknown }).code === "number"
            ? (error as { code: number }).code
            : 1
          : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** git as the plugin runs it: no hooks, and every command the repository's config names emptied against a planted one. */
export async function git(
  cwd: string,
  args: readonly string[],
  timeout = 60_000,
  env: Readonly<Record<string, string>> = {},
): Promise<Run> {
  const safe = ["-c", `core.hooksPath=${devNull}`, "-c", "core.fsmonitor=false", "-c", "core.quotePath=false"];
  if (!REFS_ONLY.has(args[0] ?? "")) {
    const listed = await spawn(
      ["-C", cwd, "config", "--show-scope", "--name-only", "--get-regexp", RUNS_COMMAND],
      30_000,
    );
    for (const line of listed.stdout.split("\n")) {
      const [scope, key] = line.split("\t");
      if (key && (scope === "local" || scope === "worktree")) safe.push("-c", `${key}=`);
    }
  }
  return spawn(["-C", cwd, ...safe, ...args], timeout, env);
}

export async function sha(cwd: string, ref: string): Promise<string | null> {
  const run = await git(cwd, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
  return run.code === 0 ? run.stdout.trim() || null : null;
}

export async function isAncestor(cwd: string, ancestor: string, of: string): Promise<boolean> {
  return (await git(cwd, ["merge-base", "--is-ancestor", ancestor, of])).code === 0;
}

export function said(run: Run): string {
  return (run.stderr || run.stdout).trim().slice(-1500) || `git exited ${run.code} with nothing to say`;
}
