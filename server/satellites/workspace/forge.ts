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

/** Where a remote points as a person reads it: its host and path, with no scheme and none of the account or secret a URL may carry. */
export function placeOf(url: string): string {
  const bare = (path: string) => path.replace(/\.git\/?$/, "");
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(url);
  if (scp) return `${scp[1]!}/${bare(scp[2]!)}`;
  if (URL.canParse(url)) {
    const at = new URL(url);
    if (at.host) return `${at.host}${bare(at.pathname)}`;
  }
  // What does not parse is still never shown with what stands before an @ in it.
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
}

/** The remotes a repository has, each by its name with where it points. */
export async function remotesOf(repo: string): Promise<{ name: string; at: string }[]> {
  const names = (await git(repo, ["remote"])).stdout.split("\n").filter(Boolean);
  return Promise.all(
    names.map(async (name) => ({ name, at: placeOf((await git(repo, ["remote", "get-url", name])).stdout.trim()) })),
  );
}

/** Where a project is published when its repository says: `origin` where it has one, else its only remote, else none. */
export async function publishedAt(repo: string): Promise<string | null> {
  const remotes = (await remotesOf(repo)).map((remote) => remote.name);
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
