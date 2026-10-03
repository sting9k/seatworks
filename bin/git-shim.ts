// First on every agent's PATH as `git`: refuses what only the plugin does, then runs the real git. It guards against
// mistakes, not intent: a git named by its full path, or one git itself starts, runs the real one (HARNESS.md).
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { holds } from "../shared/kernel/paths.ts";

const ALWAYS_REFUSED: Record<string, string> = {
  push: "pushing is the plugin's: the root's owner or the Human publishes",
  pull: "your branch is taken in by the plugin; hand back instead",
  checkout: "you stay on the branch your work is done on; `git restore` or `git switch` are not needed for it",
  switch: "you stay on the branch your work is done on",
  stash: "stashes outlive the copy they were made in; commit instead",
  "update-ref": "branches move only through the plugin",
  "symbolic-ref": "branches move only through the plugin",
  worktree: "worktrees are made and removed by the plugin",
};
const WRITERS_ONLY = new Set(["commit", "merge", "reset", "rebase", "cherry-pick", "revert", "am"]);
/** What takes away or rewrites more than one's own, in a worktree others work in. */
const SHARED_REFUSED: Record<string, string> = {
  reset:
    "others work in this worktree, and a reset takes their work with it; `git restore --staged <path>` unstages, `git restore <path>` drops your own edit, `git revert` undoes a commit",
  rebase: "others build on this branch's commits; they are never rewritten",
  clean: "others work in this worktree, and the files a clean removes may be theirs; remove your own by name",
};
const BRANCH_MOVES = new Set([
  "-d",
  "-D",
  "--delete",
  "-m",
  "-M",
  "--move",
  "-c",
  "-C",
  "--copy",
  "-f",
  "--force",
  "-u",
  "--set-upstream-to",
  "--unset-upstream",
]);

function realGit(): string {
  const shimDir = dirname(process.argv[1] ?? "");
  const names = process.platform === "win32" ? ["git.exe", "git.cmd"] : ["git"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || resolve(dir) === resolve(shimDir) || resolve(dir) === resolve(process.env.SEATWORKS_SHIM_DIR ?? ""))
      continue;
    for (const name of names) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here: keep looking along PATH.
      }
    }
  }
  return "git";
}

/** The subcommand and the directory git would act in, past git's own options. */
function parse(args: readonly string[]): { sub: string; rest: string[]; cwd: string; elsewhere: string | null } {
  let cwd = process.cwd();
  let elsewhere: string | null = null;
  let at = 0;
  while (at < args.length) {
    const a = args[at]!;
    if (a === "-C") cwd = resolve(cwd, args[++at] ?? ".");
    else if (["-c", "--namespace", "--exec-path", "--attr-source", "--config-env"].includes(a)) at++;
    else if (a.startsWith("--git-dir") || a.startsWith("--work-tree")) elsewhere = a;
    else if (a.startsWith("-")) {
      // Another of git's own options, such as --no-pager or -p.
    } else break;
    at++;
  }
  return { sub: args[at] ?? "", rest: args.slice(at + 1), cwd, elsewhere };
}

function aliasOf(git: string, cwd: string, sub: string): string | null {
  const run = spawnSync(git, ["-C", cwd, "config", "--get", `alias.${sub}`], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

function refuse(why: string): never {
  process.stderr.write(`seatworks: refused: ${why}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const git = realGit();
const { sub: named, rest, cwd, elsewhere } = parse(args);
const own = process.env.SEATWORKS_COPY;
if (elsewhere) refuse(`${elsewhere.split("=")[0] ?? elsewhere} points git at another repository or copy`);
if (own) {
  const inside = relative(realpathSync(own), realpathSync(cwd));
  if (inside.startsWith("..") || isAbsolute(inside)) refuse(`git outside your own copy (${own})`);
}
const alias = aliasOf(git, cwd, named);
if (alias?.startsWith("!")) refuse(`the alias \`${named}\` runs a shell command`);
const sub = alias ? (alias.split(/\s+/)[0] ?? named) : named;
const why = ALWAYS_REFUSED[sub];
if (why) refuse(`\`git ${sub}\`: ${why}`);
const given = (alias ? alias.split(/\s+/).slice(1) : []).concat(rest);
/** What git would answer in the directory it was asked in, read and never changed. */
const ask = (...asked: string[]) =>
  spawnSync(git, ["-C", cwd, "-c", "core.quotePath=false", ...asked], { encoding: "utf8" });
/** Whether a merge is being concluded there: whoever merges settles every file it touched. */
const merging = ask("rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;
// A lane's owner takes its parent's branch in by hand when the two conflict, whether or not it writes otherwise.
const mayMerge = process.env.SEATWORKS_MERGES === "1" && (sub === "merge" || (sub === "commit" && merging));
if (WRITERS_ONLY.has(sub) && process.env.SEATWORKS_WRITES !== "1" && !mayMerge)
  refuse(`\`git ${sub}\`: you do not write in this scope; your copy is for reading and running`);

/** The files a command would stage, commit or drop the edits of, as git's own dry run or listing names them. */
function taken(): string[] {
  const lines = (run: { stdout: string }) => run.stdout.split("\n").filter((line) => line !== "");
  if (sub === "add")
    return lines(ask("add", "--dry-run", ...given)).flatMap((line) => /^(?:add|remove) '(.+)'$/.exec(line)?.[1] ?? []);
  if (sub === "commit")
    return lines(ask("commit", "--dry-run", "--porcelain", ...given))
      .filter((line) => !" ?!".includes(line.charAt(0)))
      .flatMap((line) => line.slice(3).split(" -> "));
  if (sub === "restore") {
    const specs = given.filter((a, at) => !a.startsWith("-") && !["-s", "--source"].includes(given[at - 1] ?? ""));
    const staged = given.some((a) => a === "--staged" || /^-[A-Za-z]*S/.test(a));
    return [
      ...lines(ask("diff", "--name-only", "--", ...specs)),
      ...(staged ? lines(ask("diff", "--cached", "--name-only", "--", ...specs)) : []),
    ];
  }
  return [];
}

const heldAt = process.env.SEATWORKS_HELD;
if (heldAt !== undefined) {
  const shared = SHARED_REFUSED[sub];
  if (shared) refuse(`\`git ${sub}\`: ${shared}`);
  if (sub === "commit" && given.includes("--amend"))
    refuse("`git commit --amend`: the last commit here may be another's, and others build on it; make a new commit");
  // Each line is a path a scope of the lane holds, and the scope, none for the seat's own: the first line that holds a
  // file says whose it is. Kept by the plugin as the team's record moves.
  const held = existsSync(heldAt)
    ? readFileSync(heldAt, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.split("\t") as [string, string])
    : [];
  // Lines before the seat's own are what it handed out; lines after are a neighbour's, or kept by a writer over it.
  const mine = held.findIndex(([, scope]) => scope === "");
  if (!merging && held.length > 0)
    for (const file of taken()) {
      const at = held.findIndex(([path]) => holds(path, file));
      const by = held[at];
      if (!by || by[1] === "") continue;
      const next =
        mine !== -1 && at < mine
          ? "You handed it out: it is that scope's alone until it is taken in or dropped"
          : "Name your own files; for a file another holds, ask the owner above you";
      refuse(`\`git ${sub}\`: ${file} is scope ${by[1]}'s to write (it holds ${by[0]}). ${next}`);
    }
}
/** A branch option that moves, copies or deletes, alone or among short flags run together such as `-Df`. */
const moves = (a: string) =>
  BRANCH_MOVES.has(a) ||
  a.startsWith("--set-upstream") ||
  (/^-[A-Za-z]{2,}$/.test(a) && Array.from(a.slice(1), (c) => `-${c}`).some((c) => BRANCH_MOVES.has(c)));
if (sub === "branch" && given.some(moves))
  refuse("`git branch` may list or create branches, never move, copy or delete one");
/** A fetch refspec that writes a local branch, `src:dst` with `dst` under refs/heads, however it is named. */
const intoBranch = (a: string) => {
  const dst = a.includes(":") && !a.startsWith("-") ? a.slice(a.indexOf(":") + 1) : "";
  return dst !== "" && !/^refs\/(remotes|tags)\//.test(dst);
};
if (sub === "fetch" && given.some(intoBranch))
  refuse("`git fetch`: fetching into a branch moves it, and branches move only through the plugin");

const ran = spawnSync(git, args, { stdio: "inherit" });
process.exit(ran.status ?? 1);
