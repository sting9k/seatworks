import { execFile } from "node:child_process";
import { git } from "./git.ts";

type Ran = { readonly code: number; readonly stdout: string; readonly stderr: string };

/** GitHub's command line as the Human set it up on this machine: their account, never one of the plugin's. */
function gh(args: readonly string[]): Promise<Ran> {
  return new Promise((resolve) => {
    execFile(
      "gh",
      args,
      { timeout: 120_000, env: { ...process.env, GH_PROMPT_DISABLED: "1" } },
      (error, stdout, stderr) => {
        resolve({ code: error ? 1 : 0, stdout, stderr: stderr || (error?.message ?? "") });
      },
    );
  });
}

/** The remotes a repository has, by name. */
export async function remotesOf(repo: string): Promise<string[]> {
  return (await git(repo, ["remote"])).stdout.split("\n").filter(Boolean);
}

/** Where a project is published when its repository says: `origin` where it has one, else its only remote, else none. */
export async function publishedAt(repo: string): Promise<string | null> {
  const remotes = await remotesOf(repo);
  return remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0]! : null;
}

/** The account GitHub's command line is signed in as here; none where it is not installed or not signed in. */
export async function githubLogin(): Promise<string | null> {
  const asked = await gh(["api", "user", "--jq", ".login"]);
  return asked.code === 0 ? asked.stdout.trim() || null : null;
}

/** Makes a repository on GitHub under the Human's account and names it as this repository's `origin`. */
export async function createOnGitHub(
  repo: string,
  name: string,
  visibility: "private" | "public",
): Promise<{ created: string } | { refused: string }> {
  const made = await gh(["repo", "create", name, `--${visibility}`, "--source", repo, "--remote", "origin"]);
  return made.code === 0
    ? { created: made.stdout.trim() }
    : { refused: (made.stderr || made.stdout).trim().slice(-800) || "GitHub's command line gave no reason" };
}
