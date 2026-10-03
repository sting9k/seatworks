import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { packed } from "../../shared/contracts/template.ts";
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
  // Paseo holds SLP's agent profiles but one: the watcher's is what a template would have made.
  const paseo = fakePaseo(pluginDir, "claude", ["slp-supervisor", "slp-lead", "slp-peer", "slp-reviewer"]);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  return { plugin, root, paseo };
}

/** SLP as its editor shares it, under another name and with whatever else a case changes. */
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

  const read = await plugin.template({ path }, null);

  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.equal(read.offer.name, "night-crew");
  assert.equal(read.offer.title, "Night Crew");
  assert.equal(read.offer.replaces, false);
  assert.deepEqual([...read.offer.roles].sort(), ["lead", "peer", "reviewer", "supervisor", "watcher"]);
  assert.deepEqual(
    read.offer.agentProfiles.filter((profile) => !profile.there).map((profile) => profile.name),
    ["slp-watcher"],
  );
  assert.ok(read.offer.agentProfiles.some((profile) => profile.name === "slp-lead" && profile.there));
  assert.deepEqual(read.offer.servers, []);
  assert.deepEqual(read.offer.variables, []);
  assert.deepEqual(
    read.offer.classifier,
    [
      { host: "openrouter.ai", model: "typesafe/jev-1.13" },
      { host: "api.typesafe.ai", model: "jev-1.13.0" },
    ],
    "each host its questions would be sent to, and the model asked there",
  );
  assert.deepEqual(installed(root), []);
  assert.deepEqual(leftAside(root), []);
  assert.deepEqual(plugin.profiles(), []);
});

test("a template the Human agreed to is installed under its name, and listed to attach a project with", async () => {
  const { plugin, root } = await started();
  const path = shared();
  const read = await plugin.template({ path }, null);
  assert.ok(read.ok);

  const made = await plugin.template({ path }, read.offer.hash);

  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(installed(root), ["night-crew"]);
  assert.deepEqual(leftAside(root), []);
  assert.deepEqual(
    plugin.profiles().map((profile) => `${profile.name}: ${profile.title}`),
    ["night-crew: Night Crew"],
  );
  const again = await plugin.template({ path }, null);
  assert.ok(again.ok && again.offer.replaces);
});

test("a shared file that would not load, reaches outside its own directory, or changed since it was read is not installed", async () => {
  const { plugin, root } = await started();
  const twoRoots = shared((files) => {
    files.set("profile.yaml", files.get("profile.yaml")!.replace("  lead:\n", "  lead:\n    root: true\n"));
  });
  const readsAndWrites = shared((files) => {
    files.set(
      "profile.yaml",
      files.get("profile.yaml")!.replace("    reading: true\n", "    reading: true\n    writes: true\n"),
    );
  });
  const reachingOut = shared((files) => {
    files.set("../outside.md", "x");
  });
  const notATemplate = join(mkdtempSync(join(tmpdir(), "sw-shared-")), "notes.json");
  writeFileSync(notATemplate, JSON.stringify({ roles: {} }));

  for (const [path, why] of [
    [twoRoots, /it does not load: .*exactly one role must be `root`/],
    [readsAndWrites, /it does not load: .*role reviewer is `reading` or `watches`, and may be nothing else/],
    [reachingOut, /\.\.\/outside\.md is not a path inside a template/],
    [notATemplate, /not a packed template/],
    [join(root, "no-such-file.json"), /there is no file at/],
  ] as const) {
    const read = await plugin.template({ path }, null);
    assert.ok(!read.ok, path);
    assert.match(read.says, why);
  }

  const good = shared();
  const read = await plugin.template({ path: good }, null);
  assert.ok(read.ok);
  writeFileSync(
    good,
    packed(
      new Map([...slpFiles(), ["template.json", JSON.stringify({ name: "Night Crew", description: "Changed." })]]),
    ),
  );
  const stale = await plugin.template({ path: good }, read.offer.hash);
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

  const read = await plugin.template({ path }, null);

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
const slp = async (plugin: Plugin) => (await plugin.presets()).find((preset) => preset.name === "slp");

test("nothing is installed at first: the template that comes with the plugin is listed, no project attaches until one is installed, and then it does", async () => {
  const { plugin, root, paseo } = await started();
  assert.deepEqual(await plugin.presets(), [
    { name: "slp", title: "SLP", description: (await slp(plugin))!.description, installed: "no" },
  ]);
  const repo = repository();
  const unattached = plugin.attaching(repo, undefined);
  assert.ok(!unattached.ok);
  assert.match(unattached.says, /no template is installed: install one on Seatworks' page/);
  await assert.rejects(plugin.openProject(repo, "main"), /no template is installed/);

  const read = await plugin.template({ preset: "slp" }, null);
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.equal(read.offer.name, "slp");
  assert.deepEqual(installed(root), []);
  assert.ok((await plugin.template({ preset: "slp" }, read.offer.hash)).ok);

  assert.equal((await slp(plugin))?.installed, "same");
  assert.deepEqual(installed(root), ["slp"]);
  assert.ok((await plugin.openProject(repo, "main")).outcome.ok);
  await plugin.idle();
  assert.match(paseo.created[0]?.systemPrompt ?? "", /^# Supervisor/);
});

test("an installed copy that is not as the plugin's own comes is said to differ, and is left alone until it is installed again", async () => {
  const { plugin, root } = await started();
  const read = await plugin.template({ preset: "slp" }, null);
  assert.ok(read.ok);
  assert.ok((await plugin.template({ preset: "slp" }, read.offer.hash)).ok);

  appendFileSync(join(root, "profiles", "slp", "roles", "peer.md"), "\nKeep commits small.\n");
  assert.equal((await slp(plugin))?.installed, "differs");
  const offered = await plugin.template({ preset: "slp" }, null);
  assert.ok(offered.ok && offered.offer.replaces);

  assert.ok((await plugin.template({ preset: "slp" }, offered.offer.hash)).ok);
  assert.equal((await slp(plugin))?.installed, "same");
});

test("a name that is no template of the plugin's, such as a path out of them, is read from nowhere", async () => {
  const { plugin, root } = await started();

  for (const preset of ["../templates/slp", "night-crew"]) {
    const read = await plugin.template({ preset }, null);
    assert.ok(!read.ok, preset);
    assert.match(read.says, /^no template named .* comes with Seatworks$/);
  }
  assert.deepEqual(leftAside(root), []);
});
