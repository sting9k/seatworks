import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

// Rows of spec/CONFORMANCE.md, Installing and upkeep: the folders a team may be attached to.

const pluginDir = join(import.meta.dirname, "../..");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
const folder = (name: string) => realpathSync(mkdtempSync(join(tmpdir(), `sw-${name}-`)));

const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

async function started() {
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  return { plugin, paseo, root };
}

test("every project Paseo has is offered, with how it stands with git: ready with a commit, not yet with none, and a part of another's repository says whose", async () => {
  const { plugin, paseo } = await started();
  const ready = folder("ready");
  git(ready, "init", "-q", "-b", "main");
  writeFileSync(join(ready, "a.txt"), "a\n");
  git(ready, "add", ".");
  git(ready, "commit", "-q", "-m", "start");
  const plain = folder("plain");
  const begun = folder("begun");
  git(begun, "init", "-q", "-b", "main");
  const part = join(ready, "packages", "app");
  mkdirSync(part, { recursive: true });
  paseo.projects.push(ready, plain, begun, part);

  assert.deepEqual(
    (await plugin.unattached()).map((found) => [found.root, found.git, found.within]),
    [
      [ready, "ready", null],
      [plain, "none", null],
      [begun, "none", null],
      [part, "inside", ready],
    ],
  );
});

test("a folder that is no repository is set up from the page: what a first commit would hold is said first, then it is committed in the Human's name and is ready", async () => {
  const { plugin } = await started();
  const dir = folder("fresh");
  writeFileSync(join(dir, "app.ts"), "export {};\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  mkdirSync(join(dir, "node_modules/dep"), { recursive: true });
  writeFileSync(join(dir, "node_modules/dep/index.js"), "");

  const offer = await plugin.gitOffer(dir);
  assert.deepEqual(offer, { ok: true, files: 2, ignores: true }, "what is ignored is not counted");

  assert.equal((await plugin.folderAt(dir)).folder?.git, "none", "nothing is committed by being told");

  // The Human's name, as git reads one from where it runs: the commit is theirs, never the plugin's.
  const was = { ...process.env };
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: "Long",
    GIT_COMMITTER_NAME: "Long",
    GIT_AUTHOR_EMAIL: "long@example.test",
    GIT_COMMITTER_EMAIL: "long@example.test",
  });
  try {
    const done = await plugin.setUpGit(dir);
    assert.ok(done.ok, done.ok ? "" : done.says);
  } finally {
    process.env = was;
  }
  assert.equal(git(dir, "log", "--format=%an <%ae>"), "Long <long@example.test>", "one commit, the Human's");
  assert.deepEqual(git(dir, "ls-files").split("\n").sort(), [".gitignore", "app.ts"]);
  assert.equal((await plugin.folderAt(dir)).folder?.git, "ready");
});

test("a folder given by its path is offered as Paseo's own projects are; what is no folder, a part of another's repository, or attached already says so", async () => {
  const { plugin } = await started();
  const repo = folder("by-path");
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");

  assert.deepEqual((await plugin.folderAt(repo)).folder, {
    name: repo.split("/").pop(),
    root: repo,
    git: "ready",
    within: null,
  });
  const missing = await plugin.folderAt(join(repo, "nowhere"));
  assert.ok(!missing.ok);
  assert.match(missing.says, /no folder/);
  const file = await plugin.folderAt(join(repo, "a.txt"));
  assert.ok(!file.ok);
  mkdirSync(join(repo, "sub"));
  const inside = await plugin.gitOffer(join(repo, "sub"));
  assert.ok(!inside.ok, "git is not set up in a part of a repository");
  assert.match(inside.says, new RegExp(`part of the repository at ${repo}`));

  await plugin.openProject(repo, "main");
  await plugin.idle();
  const attached = await plugin.folderAt(repo);
  assert.ok(!attached.ok);
  assert.match(attached.says, /already has a team/);
});

/** A repository with one commit on main. */
function repository(name: string): string {
  const repo = folder(name);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  return repo;
}

test("the root's agent works in the repository itself and an agent under it in a copy made for its work; Paseo lists both under the repository's project, is given no project for a copy, and a seat taken again keeps its workspace", async () => {
  const { plugin, paseo } = await started();
  const { socketPath } = await plugin.whenReady();
  const repo = repository("placed");
  paseo.projects.push(repo);
  await plugin.openProject(repo, "main");
  await plugin.idle();

  const root = paseo.created[0];
  assert.ok(root, "the root's agent is made");
  assert.deepEqual([root.cwd, root.project], [repo, repo], "where the Human works, and under their project");
  assert.deepEqual(
    git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length,
    1,
    "no copy is made for it",
  );

  const supervisor = await agentTools(socketPath, root.env);
  const lane = { parent: "root", role: "lead", paths: ["src/"], brief: { goal: { text: "Lane" }, kind: "discovery" } };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  const lead = paseo.created[1];
  assert.ok(lead, "the lane's agent is made");
  assert.notEqual(lead.cwd, repo);
  assert.ok(existsSync(join(lead.cwd, ".git")), "in a copy of its own, made when its work was opened");
  assert.equal(lead.project, repo, "and filed under the repository's project");
  assert.deepEqual(paseo.projects, [repo], "Paseo is given no project of the copy's folder");
  assert.deepEqual(await plugin.unattached(), [], "so no copy is ever offered to attach a team to");

  assert.ok((await supervisor.call("reseat", { scope: "1", reason: "anew", model: null })).ok);
  await plugin.idle();
  assert.equal(paseo.created.length, 3);
  assert.equal(paseo.created[2]?.workspace, lead.workspace, "one workspace a copy, however often its seat is taken");
  assert.equal(paseo.workspaces.length, 2);
  supervisor.close();
});

test("a repository Paseo keeps no project for is opened in Paseo when its first agent is made, and the team is filed under it", async () => {
  const { plugin, paseo } = await started();
  const repo = repository("unlisted");
  await plugin.openProject(repo, "main");
  await plugin.idle();

  assert.deepEqual(paseo.projects, [repo], "the repository is a project in Paseo now, and its copy is none");
  assert.equal(paseo.created[0]?.project, repo);
});

test("a worktree of a repository, and a folder the plugin keeps for itself, are never offered to attach a team to", async () => {
  const { plugin, paseo, root } = await started();
  const repo = repository("with-worktree");
  const tree = join(folder("trees"), "feature");
  git(repo, "worktree", "add", "-q", "--detach", tree);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  // What a Paseo that was once given a copy's folder alone still lists: a project of that folder.
  const copy = join(realpathSync(root), "projects", project, "copies", "1");
  mkdirSync(copy, { recursive: true });
  paseo.projects.push(tree, copy);

  assert.deepEqual(
    (await plugin.unattached()).map((found) => [found.root, found.git, found.within]),
    [[tree, "inside", repo]],
    "the worktree says whose it is, and the plugin's own folder is not listed at all",
  );
  const offered = await plugin.gitOffer(tree);
  assert.ok(!offered.ok, "nor is git set up in a worktree");
  assert.match(offered.says, new RegExp(`part of the repository at ${repo}`));
  const own = await plugin.folderAt(copy);
  assert.ok(!own.ok, "given by its path, the plugin's own folder is refused");
  assert.match(own.says, /Seatworks keeps/);
});

test("a project takes the remote its repository has as where it is published: origin where there is one, else its only one, else none", async () => {
  const { plugin } = await started();
  const elsewhere = folder("bare");
  git(elsewhere, "init", "-q", "--bare");
  const remoteOf = async (...remotes: string[]) => {
    const repo = repository("remotes");
    for (const name of remotes) git(repo, "remote", "add", name, elsewhere);
    const { project } = await plugin.openProject(repo, "main");
    await plugin.idle();
    return (await plugin.view(project))?.human.remote;
  };

  assert.equal(await remoteOf(), null);
  assert.equal(await remoteOf("upstream"), "upstream");
  assert.equal(await remoteOf("upstream", "origin"), "origin");
  assert.equal(
    await remoteOf("upstream", "fork"),
    null,
    "two, and neither is origin: the Human names one when they publish",
  );
});

test("where a project is published is said as a host and a path: never the account or the secret its URL carries", async () => {
  const { plugin } = await started();
  const repo = repository("places");
  const local = folder("bare");
  git(repo, "remote", "add", "origin", "https://long:s3cret@github.com/you/shop-api.git");
  git(repo, "remote", "add", "over-ssh", "git@github.com:you/shop-api.git");
  git(repo, "remote", "add", "odd", "https://long:s3cret@host:not-a-port/x.git");
  git(repo, "remote", "add", "beside", local);
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();

  const read = await plugin.remoteOf(project);
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.deepEqual(Object.fromEntries(read.remotes.map((remote) => [remote.name, remote.at])), {
    origin: "github.com/you/shop-api",
    "over-ssh": "github.com/you/shop-api",
    odd: "https://host:not-a-port/x.git",
    beside: local,
  });
});

/** A stand-in for GitHub's command line, first on PATH: it says who is signed in and makes a repository as a bare one beside. */
function fakeGh(signedIn: boolean): { log: () => string[]; restore: () => void } {
  const home = folder("gh");
  const log = join(home, "asked.log");
  writeFileSync(log, "");
  writeFileSync(
    join(home, "gh"),
    `#!/bin/sh
echo "$*" >> "${log}"
if [ "$1" = "api" ]; then ${signedIn ? 'echo "long-test"; exit 0' : 'echo "not logged in" >&2; exit 4'}; fi
if [ "$1 $2" = "repo create" ]; then
  name="$3"; shift 3
  while [ $# -gt 0 ]; do case "$1" in --source) src="$2"; shift 2;; --remote) rem="$2"; shift 2;; *) shift;; esac; done
  git init -q --bare "${home}/$name.git" && git -C "$src" remote add "$rem" "${home}/$name.git" && echo "https://github.com/long-test/$name"
  exit $?
fi
exit 1
`,
  );
  chmodSync(join(home, "gh"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${home}:${path ?? ""}`;
  return {
    log: () => readFileSync(log, "utf8").split("\n").filter(Boolean),
    restore: () => {
      process.env.PATH = path;
    },
  };
}

test("a project with no remote is put on GitHub from the page, private or public, on the Human's word: a repository of the folder's name is made, the base is pushed there, and the record knows the remote", async () => {
  const { plugin } = await started();
  const repo = repository("unpublished");
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const gh = fakeGh(true);
  try {
    assert.deepEqual(await plugin.remoteOf(project), {
      ok: true,
      remotes: [],
      github: "long-test",
      name: repo.split("/").pop(),
    });

    const made = await plugin.createRemote(project, "private");
    assert.ok(made.ok, made.ok ? "" : made.says);
    await plugin.idle();

    assert.deepEqual(
      gh.log().filter((asked) => asked.startsWith("repo create")),
      [`repo create ${repo.split("/").pop()!} --private --source ${repo} --remote origin`],
    );
    assert.deepEqual((await plugin.remoteOf(project)).ok && (await plugin.remoteOf(project)), {
      ok: true,
      remotes: [{ name: "origin", at: git(repo, "remote", "get-url", "origin") }],
      github: "long-test",
      name: repo.split("/").pop(),
    });
    assert.equal(git(repo, "rev-parse", "origin/main"), git(repo, "rev-parse", "main"), "the base is there");
    assert.equal((await plugin.view(project))?.human.remote, "origin");

    const twice = await plugin.createRemote(project, "public");
    assert.ok(!twice.ok, "a project that has a remote is not given a second from here");
    assert.match(twice.says, /already has a remote/);
  } finally {
    gh.restore();
  }
});

test("where GitHub's command line is not signed in, the page is told so and no repository is made", async () => {
  const { plugin } = await started();
  const repo = repository("signed-out");
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const gh = fakeGh(false);
  try {
    const read = await plugin.remoteOf(project);
    assert.deepEqual([read.ok && read.remotes, read.ok && read.github], [[], null]);
    const made = await plugin.createRemote(project, "private");
    assert.ok(!made.ok);
    assert.match(made.says, /not signed in/);
    assert.deepEqual(
      gh.log().filter((asked) => asked.startsWith("repo create")),
      [],
    );
  } finally {
    gh.restore();
  }
});
