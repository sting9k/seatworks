import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AS_PLUGIN, PLUGIN_EMAIL, git, isAncestor, said, sha } from "./git.ts";

/** A working copy of the repository a branch is checked out in, and whether it holds work not yet committed. */
export type Tree = { readonly path: string; readonly branch: string; readonly unsaved: boolean };
export type Candidate = { candidate: string; parentHead: string } | { conflict: string[]; since: string[] };
export type Moved = { sha: string } | { refused: string };

const DIFF_CAP = 60_000;
/** One repository's branches and the merges between them, made without touching any working copy an agent works in. */
export class Workspace {
  readonly repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  /** The repository's git directory, which every worktree's commits are written into, wherever it is kept. */
  async gitDir(): Promise<string> {
    const found = await git(this.repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    return found.code === 0 ? found.stdout.trim() : join(this.repo, ".git");
  }

  /** The commit a branch or a ref of the repository is at; none where it has no such ref. */
  headOf(ref: string): Promise<string | null> {
    return sha(this.repo, ref);
  }

  /** The commit to integrate: `commit` with `onto` taken in, made without touching any working copy. */
  async candidate(commit: string, onto: string, message: string): Promise<Candidate | { failed: string }> {
    const parentHead = await sha(this.repo, onto);
    if (!parentHead) return { failed: `${onto} does not exist` };
    // By its whole name, however it was named: a branch is moved to it, and a publish looks for it, by that name.
    const tip = await sha(this.repo, commit);
    if (!tip) return { failed: `${commit} is not in the repository` };
    if (await isAncestor(this.repo, parentHead, tip)) return { candidate: tip, parentHead };
    // Work committed on the parent's own branch is in it already: it is taken in as the parent stands.
    if (await isAncestor(this.repo, tip, parentHead)) return { candidate: parentHead, parentHead };
    const merged = await git(this.repo, ["merge-tree", "--write-tree", "--name-only", parentHead, tip]);
    if (merged.code === 1) {
      const conflict = conflictsOf(merged.stdout);
      // What the parent took in, in those files, that the commit does not hold: what whoever decides weighs it against.
      const took = await git(this.repo, ["log", "-10", "--format=%h %s", `${tip}..${parentHead}`, "--", ...conflict]);
      return { conflict, since: took.stdout.split("\n").filter(Boolean) };
    }
    if (merged.code !== 0) return { failed: said(merged) };
    const tree = merged.stdout.split("\n")[0]?.trim() ?? "";
    const made = await git(this.repo, [...AS_PLUGIN, "commit-tree", tree, "-p", parentHead, "-p", tip, "-m", message]);
    return made.code === 0 ? { candidate: made.stdout.trim(), parentHead } : { failed: said(made) };
  }

  /** Moves `branch` to `to` only from `from`, so nothing written in between is written over. */
  async advance(branch: string, from: string, to: string): Promise<Moved> {
    // What the branch holds already has landed, as it stands: asked again after a crash, or committed on the branch
    // itself by one who shares it, with a neighbour's commits over it since.
    const at = await sha(this.repo, `refs/heads/${branch}`);
    if (at !== null && (await isAncestor(this.repo, to, at))) return { sha: at };
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

  /** Each working copy a branch under `prefix` is checked out in, as git lists them, with whether it holds unsaved work. */
  async trees(prefix: string): Promise<Tree[]> {
    const listed = await git(this.repo, ["worktree", "list", "--porcelain"]);
    const found: Tree[] = [];
    for (const entry of listed.stdout.split("\n\n")) {
      const path = /^worktree (.+)$/m.exec(entry)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(entry)?.[1];
      if (path === undefined || branch === undefined || !branch.startsWith(prefix) || !existsSync(path)) continue;
      const status = await git(path, ["status", "--porcelain"]);
      found.push({ path, branch, unsaved: status.code !== 0 || status.stdout.trim() !== "" });
    }
    // Git lists them by where they are kept, which says nothing: by their branches, the order is the same each time.
    return found.sort((a, b) => a.branch.localeCompare(b.branch));
  }

  /** The working copy a branch is checked out in, the Human's own or a worktree; none where it is in none. */
  async treeOf(branch: string): Promise<Tree | null> {
    return (await this.trees(branch)).find((tree) => tree.branch === branch) ?? null;
  }

  /** Deletes a branch once `into` holds all of its work; one with commits nothing else holds stays. */
  async dropMerged(branch: string, into: string): Promise<void> {
    const tip = await sha(this.repo, `refs/heads/${branch}`);
    if (tip !== null && (await isAncestor(this.repo, tip, into))) await git(this.repo, ["branch", "-D", branch]);
  }

  /** The branches under `prefix`, each with how many of its commits `into` does not hold: none once it is merged. */
  async branchesUnder(prefix: string, into: string | null): Promise<{ branch: string; ahead: number }[]> {
    const listed = await git(this.repo, ["for-each-ref", "--format=%(refname)", `refs/heads/${prefix}`]);
    const found = [];
    for (const ref of listed.stdout.split("\n").filter(Boolean)) {
      const branch = ref.slice("refs/heads/".length);
      const beyond = into === null ? null : await this.commitsIn(`${into}..${branch}`);
      // A base that is not there holds none of them: counted as merged, the branch would be picked for removal.
      const ahead = beyond ?? (await this.commitsIn(branch));
      if (ahead === null) throw new Error(`git cannot count the commits of ${branch}`);
      found.push({ branch, ahead });
    }
    return found;
  }

  /** How many commits a revision or a range holds; none where git knows no such revision. */
  private async commitsIn(range: string): Promise<number | null> {
    const run = await git(this.repo, ["rev-list", "--count", range]);
    return run.code === 0 ? Number(run.stdout.trim()) : null;
  }

  /** Deletes a branch whatever it holds; git refuses one checked out in any copy. */
  async removeBranch(branch: string): Promise<{ removed: true } | { kept: string }> {
    const run = await git(this.repo, ["branch", "-D", branch]);
    return run.code === 0 ? { removed: true } : { kept: said(run) };
  }

  /** Puts `body` between `marker`'s lines in `file` on `branch` as one commit, leaving what the Human changed. */
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
    const at = (await this.treeOf(branch))?.path;
    if (at) {
      // An ignored file is the Human's own, kept out of git: writing the note over it would lose it.
      const status = await git(at, ["status", "--porcelain", "--ignored", "--", file]);
      if (status.code !== 0 || status.stdout.trim() !== "")
        return { refused: `${file} has uncommitted changes in ${at}: commit them, then try again` };
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

  /** What `tip` changed since it left `base`, capped so a huge change never fills a reader's context. */
  async diff(base: string, tip: string, within: readonly string[] = []): Promise<string> {
    const stat = await git(this.repo, ["diff", "--stat", `${base}...${tip}`, "--", ...within]);
    if (stat.code !== 0) return `No diff: ${said(stat)}`;
    const patch = await git(this.repo, ["diff", `${base}...${tip}`, "--", ...within]);
    // An answer of nothing reads as a tool that failed: a change that is none is said.
    if (patch.stdout.trim() === "")
      return `Nothing changed between ${base} and ${tip}${within.length > 0 ? ` under ${within.join(", ")}` : ""}.`;
    const body =
      patch.stdout.length > DIFF_CAP
        ? `${patch.stdout.slice(0, DIFF_CAP)}\n… cut at ${DIFF_CAP} characters; read the files for the rest.`
        : patch.stdout;
    return `${stat.stdout.trim()}\n\n${body}`;
  }

  /** Which of `names` appear as whole words in code that is not a test, at a revision or in a working tree. */
  async namesIn(cwd: string, rev: string | null, names: readonly string[], tests: RegExp): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    // In a working tree, files the agent has not committed yet count too. Each match is a line `path<NUL>name`.
    const args = [
      "grep",
      ...(rev ? [] : ["--untracked"]),
      "-w",
      "-o",
      "-z",
      "-I",
      ...names.flatMap((n) => ["-e", n]),
      ...(rev ? [rev] : []),
      "--",
      ".",
    ];
    const run = await git(cwd, args, 60_000);
    const found = new Set<string>();
    for (const line of run.stdout.split("\n")) {
      const [file, name] = line.split("\0");
      if (file === undefined || name === undefined || !names.includes(name)) continue;
      const path = rev && file.startsWith(`${rev}:`) ? file.slice(rev.length + 1) : file;
      if (!tests.test(path)) found.add(name);
    }
    return found;
  }

  /** Each file `tip` changed since it left `base`, with its own diff, capped per file and at twenty files. */
  async fileDiffs(
    base: string,
    tip: string,
    within: readonly string[] = [],
  ): Promise<{ path: string; text: string }[]> {
    const listed = await git(this.repo, ["diff", "--name-only", `${base}...${tip}`, "--", ...within]);
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

  /** Whether `tip` is `from` with nothing over it but commits of the plugin's own, none of them a merge. */
  private async oursOnly(from: string, tip: string): Promise<boolean> {
    if (!(await isAncestor(this.repo, from, tip))) return false;
    const over = await git(this.repo, ["log", "--format=%ae %P", `${from}..${tip}`]);
    const commits = over.stdout.split("\n").filter((line) => line !== "");
    return (
      over.code === 0 && commits.every((line) => line.split(" ").length === 2 && line.startsWith(`${PLUGIN_EMAIL} `))
    );
  }

  /** Pushes a branch to a remote, never forced; a tip that moved since the request is refused, saying what it found. */
  async publish(
    branch: string,
    remote: string,
    expectedSha: string,
  ): Promise<{ sha: string } | { refused: string; at: string | null }> {
    const tip = await sha(this.repo, branch);
    if (!tip) return { refused: `${branch} does not exist`, at: null };
    if (tip !== expectedSha && !(await this.oursOnly(expectedSha, tip)))
      return { refused: `${branch} moved since the publish was asked`, at: tip };
    const run = await git(
      this.repo,
      ["push", "--no-verify", remote, `refs/heads/${branch}:refs/heads/${branch}`],
      300_000,
    );
    return run.code === 0 ? { sha: tip } : { refused: said(run), at: tip };
  }
}

/** `text` with `marker`'s block holding `body`, or without it when `body` is null; the rest stays. */
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
