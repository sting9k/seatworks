import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { packed } from "../../editor/template/pack.ts";
import { Plugin } from "../../server/bridge/plugin.ts";
import { slpFiles } from "../editor/slp.ts";
import { fakePaseo } from "./fake-paseo.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: a shared file on this machine, read and then installed.

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

async function started() {
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  return { plugin, root, paseo };
}

/** The shipped template as its editor shares it, under another name and with whatever else a case changes. */
function shared(change: (files: Map<string, string>) => void = () => undefined): string {
  const files = new Map(slpFiles());
  files.set("template.json", JSON.stringify({ name: "Night Crew", description: "A crew for the night shift." }));
  change(files);
  const path = join(mkdtempSync(join(tmpdir(), "sw-shared-")), "night-crew.template.json");
  writeFileSync(path, packed(files));
  return path;
}
const installed = (root: string) => (existsSync(join(root, "profiles")) ? readdirSync(join(root, "profiles")) : []);
const leftAside = (root: string) => (existsSync(join(root, "staging")) ? readdirSync(join(root, "staging")) : []);

test("a shared template is read before it is installed: what it would bring is listed, and nothing is the machine's yet", async () => {
  const { plugin, root } = await started();
  const path = shared();

  const read = await plugin.template(path, null);

  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.equal(read.offer.name, "night-crew");
  assert.equal(read.offer.title, "Night Crew");
  assert.equal(read.offer.replaces, false);
  assert.deepEqual([...read.offer.roles].sort(), ["lead", "peer", "reviewer", "supervisor", "watcher"]);
  assert.deepEqual(
    read.offer.agentProfiles.filter((profile) => !profile.there).map((profile) => profile.name),
    ["slp-peer-alt"],
  );
  assert.ok(read.offer.agentProfiles.some((profile) => profile.name === "slp-lead" && profile.there));
  assert.deepEqual(read.offer.servers, []);
  assert.deepEqual(read.offer.variables, []);
  assert.deepEqual(installed(root), []);
  assert.deepEqual(leftAside(root), []);
  assert.deepEqual(
    (await plugin.profiles()).map((profile) => profile.name),
    ["slp"],
  );
});

test("a template the Human agreed to is installed under its name, and listed to attach a project with", async () => {
  const { plugin, root } = await started();
  const path = shared();
  const read = await plugin.template(path, null);
  assert.ok(read.ok);

  const made = await plugin.template(path, { hash: read.offer.hash, agents: {} });

  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(installed(root), ["night-crew"]);
  assert.deepEqual(leftAside(root), []);
  assert.deepEqual(
    (await plugin.profiles()).map((profile) => `${profile.name}: ${profile.title}`),
    ["night-crew: Night Crew", "slp: SLP"],
  );
  const again = await plugin.template(path, null);
  assert.ok(again.ok && again.offer.replaces);
});

test("a shared file that would not load, reaches outside its own directory, or changed since it was read is not installed", async () => {
  const { plugin, root } = await started();
  const twoRoots = shared((files) => {
    files.set("profile.yaml", files.get("profile.yaml")!.replace("  lead:\n", "  lead:\n    root: true\n"));
  });
  const reachingOut = shared((files) => {
    files.set("../outside.md", "x");
  });
  const notATemplate = join(mkdtempSync(join(tmpdir(), "sw-shared-")), "notes.json");
  writeFileSync(notATemplate, JSON.stringify({ roles: {} }));

  for (const [path, why] of [
    [twoRoots, /it does not load: .*exactly one role must be `root`/],
    [reachingOut, /\.\.\/outside\.md is not a path inside a template/],
    [notATemplate, /not a packed template/],
    [join(root, "no-such-file.json"), /there is no file at/],
  ] as const) {
    const read = await plugin.template(path, null);
    assert.ok(!read.ok, path);
    assert.match(read.says, why);
  }

  const good = shared();
  const read = await plugin.template(good, null);
  assert.ok(read.ok);
  writeFileSync(
    good,
    packed(
      new Map([...slpFiles(), ["template.json", JSON.stringify({ name: "Night Crew", description: "Changed." })]]),
    ),
  );
  const stale = await plugin.template(good, { hash: read.offer.hash, agents: {} });
  assert.ok(!stale.ok);
  assert.match(stale.says, /changed since it was read/);

  assert.deepEqual(installed(root), []);
  assert.deepEqual(leftAside(root), []);
  assert.ok(!existsSync(join(root, "outside.md")) && !existsSync(join(root, "staging", "outside.md")));
});

test("a shared template that declares an outside server says what it runs and which variables it reads, before anything is installed", async () => {
  process.env.SW_TEST_SET_ONE = "x";
  delete process.env.SW_TEST_UNSET_ONE;
  const { plugin, root } = await started();
  const path = shared((files) => {
    files.set(
      "profile.yaml",
      `${files.get("profile.yaml")!.replace("    humanDoor: true\n", "    humanDoor: true\n    servers: { tickets: [search] }\n")}
servers:
  tickets:
    type: http
    url: https://tickets.example/mcp
    headers: { Authorization: "Bearer $SW_TEST_UNSET_ONE", X-Team: $SW_TEST_SET_ONE }
`,
    );
  });

  const read = await plugin.template(path, null);

  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.deepEqual(read.offer.servers, [{ name: "tickets", runs: "https://tickets.example/mcp" }]);
  assert.deepEqual(read.offer.variables, [
    { name: "SW_TEST_SET_ONE", there: true },
    { name: "SW_TEST_UNSET_ONE", there: false },
  ]);
  assert.deepEqual(installed(root), []);
});

/** A git repository with one commit, for a team to be attached to. */
function repository(): string {
  const repo = mkdtempSync(join(tmpdir(), "sw-repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  return repo;
}

/** The shared template with its root's role naming an agent profile the Human does not have. */
const withACaptain = () =>
  shared((files) => {
    files.set(
      "profile.yaml",
      files.get("profile.yaml")!.replace("models: [slp-supervisor]", "models: [night-captain]"),
    );
  });

test("an agent profile a template names is matched, when it is installed, to one the Human has: the role's agent is made on that one", async () => {
  const { plugin, paseo } = await started();
  const path = withACaptain();
  const read = await plugin.template(path, null);
  assert.ok(read.ok);
  assert.deepEqual(
    read.offer.agentProfiles.find((profile) => profile.name === "night-captain"),
    { name: "night-captain", there: false, runsOn: null },
  );
  assert.ok(read.offer.available.includes("slp-supervisor"));

  const agents = { "night-captain": "slp-supervisor" };
  const made = await plugin.template(path, { hash: read.offer.hash, agents });
  assert.ok(made.ok, made.ok ? "" : made.says);
  const opened = await plugin.openProject(repository(), "main", "night-crew");
  await plugin.idle();

  assert.equal(paseo.created[0]?.provider, "claude/slp-supervisor");
  assert.deepEqual((await plugin.view(opened.project))?.stuck, []);
  const again = await plugin.template(path, null);
  assert.ok(again.ok);
  assert.equal(again.offer.agentProfiles.find((profile) => profile.name === "night-captain")?.runsOn, "slp-supervisor");

  const unmatched = await plugin.template(path, { hash: again.offer.hash, agents: {} });
  assert.ok(unmatched.ok);
  const after = await plugin.template(path, null);
  assert.ok(after.ok);
  assert.equal(after.offer.agentProfiles.find((profile) => profile.name === "night-captain")?.runsOn, null);
});

test("a matching to an agent profile Paseo does not have, or of a name the template does not give, installs nothing", async () => {
  const { plugin, root } = await started();
  const path = withACaptain();
  const read = await plugin.template(path, null);
  assert.ok(read.ok);

  const lacks = await plugin.template(path, { hash: read.offer.hash, agents: { "night-captain": "no-such" } });
  assert.ok(!lacks.ok);
  assert.match(lacks.says, /Paseo has no agent profile named no-such to run night-captain on/);
  const stray = await plugin.template(path, { hash: read.offer.hash, agents: { "night-owl": "slp-peer" } });
  assert.ok(!stray.ok);
  assert.match(stray.says, /night-owl is not an agent profile this template names/);

  assert.deepEqual(installed(root), []);
  assert.deepEqual(leftAside(root), []);
  assert.equal(existsSync(join(root, "agents")), false);
});
