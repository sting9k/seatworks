import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { AS_PLUGIN, git, isAncestor, said, sha } from "./git.ts";

export type CopyKind =
  { kind: "writer"; branch: string; from: string } | { kind: "reader"; at: string; branch: string | null };
export type Candidate = { candidate: string; parentHead: string } | { conflict: string[] };
export type Moved = { sha: string } | { refused: string };

const DIFF_CAP = 60_000;
/** Test paths, left out when asking whether code already has a name. */
const NOT_TESTS = [
  ":(exclude,glob)**/test/**",
  ":(exclude,glob)**/tests/**",
  ":(exclude,glob)**/spec/**",
  ":(exclude,glob)**/__tests__/**",
  ":(exclude,glob)**/*.test.*",
  ":(exclude,glob)**/*.spec.*",
  ":(exclude,glob)**/test_*",
];

/** A key made safe for a path: `[A-Za-z0-9._-]`, with a stable hash when that changed it (Symphony's rule). */
export function safeKey(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9._-]/g, "_");
  return clean === key ? key : `${clean}-${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

/**
 * Copies of one repository for the agents that work on it, and the merges between their branches, done with git's own
 * CLI and never inside an agent's copy (PORTS.md, Workspace).
 */
export class Workspace {
  readonly repo: string;
  readonly copies: string;

  constructor(repo: string, copies: string) {
    this.repo = repo;
    this.copies = copies;
  }

  pathOf(scope: string): string {
    return join(this.copies, safeKey(scope));
  }

  /** A writer's worktree on a branch of its own, or a reader's detached copy. Asked again, it answers what it made. */
  async create(scope: string, copy: CopyKind): Promise<{ ok: true; path: string } | { ok: false; why: string }> {
    const path = this.pathOf(scope);
    if (existsSync(path)) return { ok: true, path };
    if (copy.kind === "writer") {
      const from = await sha(this.repo, copy.from);
      if (!from) return { ok: false, why: `${copy.from} does not exist` };
      const exists = (await sha(this.repo, `refs/heads/${copy.branch}`)) !== null;
      const run = await git(
        this.repo,
        ["worktree", "add", ...(exists ? [] : ["-b", copy.branch]), path, exists ? copy.branch : from],
        300_000,
      );
      if (run.code !== 0) return { ok: false, why: said(run) };
    } else {
      if (copy.branch !== null && (await sha(this.repo, `refs/heads/${copy.branch}`)) === null) {
        const made = await git(this.repo, ["branch", copy.branch, copy.at]);
        if (made.code !== 0) return { ok: false, why: said(made) };
      }
      const run = await git(this.repo, ["worktree", "add", "--detach", path, copy.at], 300_000);
      if (run.code !== 0) return { ok: false, why: said(run) };
    }
    await git(this.repo, ["worktree", "lock", "--reason", `seatworks scope ${scope}`, path]);
    return { ok: true, path };
  }

  /** The commit to integrate: `commit` with `onto` taken in, made without touching any working copy. */
  async candidate(commit: string, onto: string, message: string): Promise<Candidate | { failed: string }> {
    const parentHead = await sha(this.repo, onto);
    if (!parentHead) return { failed: `${onto} does not exist` };
    if (!(await sha(this.repo, commit))) return { failed: `${commit} is not in the repository` };
    if (await isAncestor(this.repo, parentHead, commit)) return { candidate: commit, parentHead };
    const merged = await git(this.repo, ["merge-tree", "--write-tree", "--name-only", parentHead, commit]);
    if (merged.code === 1) return { conflict: conflictsOf(merged.stdout) };
    if (merged.code !== 0) return { failed: said(merged) };
    const tree = merged.stdout.split("\n")[0]?.trim() ?? "";
    const made = await git(this.repo, [
      ...AS_PLUGIN,
      "commit-tree",
      tree,
      "-p",
      parentHead,
      "-p",
      commit,
      "-m",
      message,
    ]);
    return made.code === 0 ? { candidate: made.stdout.trim(), parentHead } : { failed: said(made) };
  }

  /**
   * Moves `branch` to `to` only from `from`: a fast-forward where the Human has it checked out and clean, otherwise a
   * ref update git refuses once the branch has moved. Nothing written in between is written over.
   */
  async advance(branch: string, from: string, to: string): Promise<Moved> {
    const head = await git(this.repo, ["symbolic-ref", "-q", "--short", "HEAD"]);
    if (head.code === 0 && head.stdout.trim() === branch) {
      const status = await git(this.repo, ["status", "--porcelain", "--untracked-files=no"]);
      if (status.code !== 0 || status.stdout.trim() !== "")
        return { refused: `${branch} is checked out with uncommitted changes` };
      if ((await sha(this.repo, branch)) !== from) return { refused: "moved" };
      const run = await git(this.repo, ["merge", "--ff-only", to]);
      return run.code === 0 ? { sha: to } : { refused: said(run) };
    }
    const listed = await git(this.repo, ["worktree", "list", "--porcelain"]);
    if (listed.stdout.split("\n").some((l) => l.trim() === `branch refs/heads/${branch}`))
      return { refused: `${branch} is checked out in another working copy` };
    const run = await git(this.repo, ["update-ref", `refs/heads/${branch}`, to, from]);
    return run.code === 0 ? { sha: to } : { refused: "moved" };
  }

  /** Points a reader's copy at a branch's new head; what the reader changed there was never anyone's. */
  async refresh(scope: string, branch: string): Promise<void> {
    const path = this.pathOf(scope);
    if (existsSync(path)) await git(path, ["checkout", "--detach", "--force", branch]);
  }

  /** Removes a scope's copy, and its branch once merged; a copy holding uncommitted work is kept and said so. */
  async remove(
    scope: string,
    branch: string | null,
    mergedInto: string | null,
  ): Promise<{ removed: true } | { kept: string }> {
    const path = this.pathOf(scope);
    if (existsSync(path)) {
      const status = await git(path, ["status", "--porcelain"]);
      const writer =
        branch !== null && (await git(path, ["symbolic-ref", "-q", "--short", "HEAD"])).stdout.trim() === branch;
      if (writer && status.stdout.trim() !== "") return { kept: `${path} holds uncommitted work` };
      await git(this.repo, ["worktree", "unlock", path]);
      const run = await git(this.repo, ["worktree", "remove", "--force", path], 120_000);
      if (run.code !== 0) return { kept: said(run) };
    }
    if (branch !== null && mergedInto !== null && (await sha(this.repo, `refs/heads/${branch}`)) !== null) {
      const tip = await sha(this.repo, branch);
      if (tip && (await isAncestor(this.repo, tip, mergedInto))) await git(this.repo, ["branch", "-D", branch]);
    }
    return { removed: true };
  }

  /** What `tip` changed since it left `base`, capped so a huge change never fills a reader's context. */
  async diff(base: string, tip: string): Promise<string> {
    const stat = await git(this.repo, ["diff", "--stat", `${base}...${tip}`]);
    if (stat.code !== 0) return `No diff: ${said(stat)}`;
    const patch = await git(this.repo, ["diff", `${base}...${tip}`]);
    const body =
      patch.stdout.length > DIFF_CAP
        ? `${patch.stdout.slice(0, DIFF_CAP)}\n… cut at ${DIFF_CAP} characters; read the files for the rest.`
        : patch.stdout;
    return `${stat.stdout.trim()}\n\n${body}`;
  }

  /**
   * Which of `names` appear as whole words in code outside test paths: at a revision of the repository, or in a copy's
   * working tree when `rev` is null. One git grep for all of them.
   */
  async namesIn(cwd: string, rev: string | null, names: readonly string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    // In a working tree, files the agent has not committed yet count too.
    const args = [
      "grep",
      ...(rev ? [] : ["--untracked"]),
      "-w",
      "-o",
      "-h",
      "-I",
      ...names.flatMap((n) => ["-e", n]),
      ...(rev ? [rev] : []),
      "--",
      ".",
      ...NOT_TESTS,
    ];
    const run = await git(cwd, args, 60_000);
    const found = new Set<string>();
    for (const line of run.stdout.split("\n")) {
      const name = (line.includes(":") ? line.slice(line.lastIndexOf(":") + 1) : line).trim();
      if (names.includes(name)) found.add(name);
    }
    return found;
  }

  /** Each file `tip` changed since it left `base` whose path matches `only`, with its own diff, capped per file. */
  async fileDiffs(base: string, tip: string, only: RegExp): Promise<{ path: string; text: string }[]> {
    const listed = await git(this.repo, ["diff", "--name-only", `${base}...${tip}`]);
    if (listed.code !== 0) return [];
    const paths = listed.stdout
      .split("\n")
      .filter((p) => p && only.test(p))
      .slice(0, 20);
    const out: { path: string; text: string }[] = [];
    for (const path of paths) {
      const one = await git(this.repo, ["diff", `${base}...${tip}`, "--", path]);
      out.push({ path, text: one.stdout.slice(0, DIFF_CAP / 4) });
    }
    return out;
  }

  /** Pushes a branch to a remote, never forced: a remote that moved refuses it. */
  async publish(remote: string, branch: string): Promise<Moved> {
    const tip = await sha(this.repo, branch);
    if (!tip) return { refused: `${branch} does not exist` };
    const run = await git(
      this.repo,
      ["push", "--no-verify", remote, `refs/heads/${branch}:refs/heads/${branch}`],
      300_000,
    );
    return run.code === 0 ? { sha: tip } : { refused: said(run) };
  }
}

/** The files a merge stops on, as `merge-tree --name-only` lists them after the tree; git's words when it names none. */
function conflictsOf(stdout: string): string[] {
  const lines = stdout.split("\n").slice(1);
  const end = lines.findIndex((l) => !l.trim());
  const files = [...new Set((end < 0 ? lines : lines.slice(0, end)).map((l) => l.trim()).filter(Boolean))];
  if (files.length > 0) return files;
  const told = lines.slice(end + 1).filter((l) => l.startsWith("CONFLICT"));
  return told.length > 0 ? told : ["a conflict git names no file for"];
}
