import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    // Asked again after it landed, as after a crash before the result was recorded: it landed.
    if ((await sha(this.repo, `refs/heads/${branch}`)) === to) return { sha: to };
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

  /**
   * Each copy on disk under the copies root, the branch it stands on, and whether it holds unsaved work: uncommitted
   * changes on a branch, which `remove` keeps. What a detached reader's copy holds was never anyone's.
   */
  async onDisk(): Promise<{ key: string; path: string; branch: string | null; unsaved: boolean }[]> {
    if (!existsSync(this.copies)) return [];
    const found = [];
    for (const key of readdirSync(this.copies)) {
      const path = join(this.copies, key);
      const head = await git(path, ["symbolic-ref", "-q", "--short", "HEAD"]);
      const branch = head.code === 0 ? head.stdout.trim() || null : null;
      const status = branch === null ? null : await git(path, ["status", "--porcelain"]);
      found.push({ key, path, branch, unsaved: status !== null && (status.code !== 0 || status.stdout.trim() !== "") });
    }
    return found;
  }

  /** The branches under `prefix`, each with whether `into` already holds its tip. */
  async branchesUnder(prefix: string, into: string | null): Promise<{ branch: string; merged: boolean }[]> {
    const listed = await git(this.repo, ["for-each-ref", "--format=%(refname)", `refs/heads/${prefix}`]);
    const found = [];
    for (const ref of listed.stdout.split("\n").filter(Boolean)) {
      const branch = ref.slice("refs/heads/".length);
      found.push({ branch, merged: into !== null && (await isAncestor(this.repo, branch, into)) });
    }
    return found;
  }

  /** Deletes a branch whatever it holds; git refuses one checked out in any copy. */
  async removeBranch(branch: string): Promise<{ removed: true } | { kept: string }> {
    const run = await git(this.repo, ["branch", "-D", branch]);
    return run.code === 0 ? { removed: true } : { kept: said(run) };
  }

  /**
   * Puts `body` between `marker`'s lines in `file` on `branch`, or takes the block out when `body` is null, as one
   * commit of that file alone made through an index of its own. Where the branch is checked out, only `file` follows
   * it there, and only when it holds no uncommitted change: whatever else the Human has staged or changed stays so.
   */
  async putBlock(
    branch: string,
    file: string,
    marker: string,
    body: string | null,
    message: string,
  ): Promise<{ sha: string } | { unchanged: true } | { refused: string }> {
    const from = await sha(this.repo, `refs/heads/${branch}`);
    if (!from) return { refused: `${branch} does not exist` };
    const shown = await git(this.repo, ["show", `${from}:${file}`]);
    const before = shown.code === 0 ? shown.stdout : "";
    const after = withBlock(before, marker, body);
    if (after === before) return { unchanged: true };
    const at = await this.checkedOutAt(branch);
    if (at) {
      // An ignored file is the Human's own, kept out of git: writing the note over it would lose it.
      const status = await git(at, ["status", "--porcelain", "--ignored", "--", file]);
      if (status.code !== 0 || status.stdout.trim() !== "")
        return { refused: `${file} has uncommitted changes in ${at}: commit them, then attach again` };
    }
    const tmp = mkdtempSync(join(tmpdir(), "sw-block-"));
    try {
      const env = { GIT_INDEX_FILE: join(tmp, "index") };
      const read = await git(this.repo, ["read-tree", from], 60_000, env);
      if (read.code !== 0) return { refused: said(read) };
      if (after === "") {
        const removed = await git(this.repo, ["update-index", "--force-remove", "--", file], 60_000, env);
        if (removed.code !== 0) return { refused: said(removed) };
      } else {
        writeFileSync(join(tmp, "content"), after);
        const blob = await git(this.repo, ["hash-object", "-w", "--no-filters", join(tmp, "content")]);
        if (blob.code !== 0) return { refused: said(blob) };
        const added = await git(
          this.repo,
          ["update-index", "--add", "--cacheinfo", `100644,${blob.stdout.trim()},${file}`],
          60_000,
          env,
        );
        if (added.code !== 0) return { refused: said(added) };
      }
      const tree = await git(this.repo, ["write-tree"], 60_000, env);
      if (tree.code !== 0) return { refused: said(tree) };
      const made = await git(this.repo, [...AS_PLUGIN, "commit-tree", tree.stdout.trim(), "-p", from, "-m", message]);
      if (made.code !== 0) return { refused: said(made) };
      const commit = made.stdout.trim();
      const moved = await git(this.repo, ["update-ref", `refs/heads/${branch}`, commit, from]);
      if (moved.code !== 0) return { refused: `${branch} moved while ${file} was written` };
      if (at) await git(at, ["restore", `--source=${commit}`, "--staged", "--worktree", "--", file]);
      return { sha: commit };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  /** The working copy that has `branch` checked out, the Human's own or a copy, if any does. */
  private async checkedOutAt(branch: string): Promise<string | null> {
    const listed = await git(this.repo, ["worktree", "list", "--porcelain"]);
    let path: string | null = null;
    for (const line of listed.stdout.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      else if (line.trim() === `branch refs/heads/${branch}`) return path;
    }
    return null;
  }

  /** Forgets copies git still lists whose directory is gone. */
  async prune(): Promise<void> {
    await git(this.repo, ["worktree", "prune"]);
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

  /** Each file `tip` changed since it left `base`, with its own diff, capped per file and at twenty files. */
  async fileDiffs(base: string, tip: string): Promise<{ path: string; text: string }[]> {
    const listed = await git(this.repo, ["diff", "--name-only", `${base}...${tip}`]);
    if (listed.code !== 0) return [];
    const paths = listed.stdout
      .split("\n")
      .filter((p) => p !== "")
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

/**
 * `text` with the block between `marker`'s lines holding `body`, added at the end when it has none, or taken out when
 * `body` is null. What is outside the block stays; a file left with nothing else is empty.
 */
function withBlock(text: string, marker: string, body: string | null): string {
  const begin = `<!-- ${marker}:begin`;
  const end = `<!-- ${marker}:end -->`;
  const i = text.indexOf(begin);
  const j = i < 0 ? -1 : text.indexOf(end, i);
  const head = (j < 0 ? text : text.slice(0, i)).trimEnd();
  const tail = j < 0 ? "" : text.slice(j + end.length).trim();
  const block = body === null ? "" : `${begin} (kept by a plugin; edit outside it) -->\n${body.trim()}\n${end}`;
  const parts = [head, block, tail].filter((p) => p !== "");
  return parts.length === 0 ? "" : `${parts.join("\n\n")}\n`;
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
