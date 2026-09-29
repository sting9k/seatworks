// First on every agent's PATH as `git`: refuses what only the plugin does, then runs the real git. It guards against
// mistakes, not intent: a git named by its full path, or one git itself starts, runs the real one (HARNESS.md).
import { spawnSync } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";

const ALWAYS_REFUSED: Record<string, string> = {
  push: "pushing is the plugin's: the Supervisor or the Human publishes",
  pull: "your branch is taken in by the plugin; hand back instead",
  checkout: "you stay on your own branch; `git restore` or `git switch` are not needed for your work",
  switch: "you stay on your own branch",
  stash: "stashes outlive the copy they were made in; commit instead",
  "update-ref": "branches move only through the plugin",
  "symbolic-ref": "branches move only through the plugin",
  worktree: "copies are made and removed by the plugin",
};
const WRITERS_ONLY = new Set(["commit", "merge", "reset", "rebase", "cherry-pick", "revert", "am"]);
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
if (WRITERS_ONLY.has(sub) && process.env.SEATWORKS_WRITES !== "1")
  refuse(`\`git ${sub}\`: you do not write in this scope; your copy is for reading and running`);
const given = (alias ? alias.split(/\s+/).slice(1) : []).concat(rest);
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
