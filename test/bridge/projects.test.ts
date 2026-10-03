import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
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
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  return { plugin, paseo };
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
    (await plugin.unattached()).map((found) => [found.root, found.git]),
    [
      [ready, "ready"],
      [plain, "none"],
      [begun, "none"],
      [part, "inside"],
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

  assert.deepEqual((await plugin.folderAt(repo)).folder, { name: repo.split("/").pop(), root: repo, git: "ready" });
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
