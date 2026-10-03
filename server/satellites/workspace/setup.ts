import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { git, said } from "./git.ts";

/** How a folder stands with git: a repository of its own with a commit, none of that yet, or a part of another's. */
export type GitState = "ready" | "none" | "inside";

/** The repository a folder is part of, if any: its top, as git says it. */
async function topOf(dir: string): Promise<string | null> {
  const top = await git(dir, ["rev-parse", "--show-toplevel"]);
  return top.code === 0 ? realpathSync(top.stdout.trim()) : null;
}

/** The repository a folder belongs to and is not itself: one it sits inside, or one it is a worktree of. */
async function withinOf(dir: string): Promise<string | null> {
  const top = await topOf(dir);
  if (top === null) return null;
  if (top !== realpathSync(dir)) return top;
  const dirs = await git(dir, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]);
  const [own, common] = dirs.stdout.trim().split("\n");
  if (dirs.code !== 0 || own === undefined || common === undefined || own === common) return null;
  // A worktree keeps its git directory inside its repository's: the repository is the folder that holds that one.
  return realpathSync(basename(common) === ".git" ? dirname(common) : common);
}

/** How a folder stands with git, and the repository it is a part of where it is one's. */
export async function gitStateOf(dir: string): Promise<{ git: GitState; within: string | null }> {
  const within = await withinOf(dir);
  if (within !== null) return { git: "inside", within };
  const committed = (await git(dir, ["rev-parse", "--verify", "-q", "HEAD"])).code === 0;
  return { git: committed ? "ready" : "none", within: null };
}

/** Makes a folder a repository where it is none, and says what a first commit of it would hold. */
export async function firstCommitOf(dir: string): Promise<{ files: number; ignores: boolean } | { refused: string }> {
  const within = await withinOf(dir);
  if (within !== null)
    return { refused: `it is part of the repository at ${within}: a team is attached to a repository whole` };
  if ((await topOf(dir)) === null) {
    const made = await git(dir, ["init", "-q", "-b", "main"]);
    if (made.code !== 0) return { refused: said(made) };
  }
  const listed = await git(dir, ["ls-files", "--others", "--cached", "--exclude-standard", "-z"]);
  if (listed.code !== 0) return { refused: said(listed) };
  return { files: listed.stdout.split("\0").filter(Boolean).length, ignores: existsSync(join(dir, ".gitignore")) };
}

/** Commits a folder as it stands, as the Human's own first commit: their name, and their signing where they sign. */
export async function commitAll(dir: string): Promise<{ committed: true } | { refused: string }> {
  const added = await git(dir, ["add", "--all"], 300_000);
  if (added.code !== 0) return { refused: said(added) };
  const made = await git(dir, ["commit", "-q", "--allow-empty", "-m", "Add the project as it stands"], 300_000);
  return made.code === 0 ? { committed: true } : { refused: said(made) };
}
