import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { oneOn } from "../../client/state/matching.ts";
import { packed } from "../../shared/contracts/template.ts";
import { Plugin } from "../../server/bridge/plugin.ts";
import { slpFiles } from "../editor/slp.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: the agent profiles a profile names, matched to the Human's.

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** A plugin beside a Paseo that holds SLP's agent profiles but one, or the ones named. */
async function started(profiles?: readonly string[]) {
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir, "claude", profiles);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  return { plugin, root, paseo };
}

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

/** What the page is shown of one profile's agent profiles. */
async function shown(plugin: Plugin, profile: string) {
  const read = await plugin.agents(null);
  assert.ok(read.ok, read.ok ? "" : read.says);
  const one = read.profiles.find((listed) => listed.name === profile);
  assert.ok(one, `${profile} is listed`);
  return {
    ...one,
    available: read.available,
    providers: read.providers,
    of: (name: string) => one.agents.find((agent) => agent.name === name),
  };
}
const keptIn = (root: string, profile: string, text: string) => {
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(join(root, "agents", `${profile}.json`), text);
};

test("an agent profile a profile's roles name is matched to one the Human has, SLP's too: its agent is made from that one", async () => {
  const { plugin, paseo } = await started();
  const before = await shown(plugin, "slp");
  assert.deepEqual(before.of("slp-peer-alt"), { name: "slp-peer-alt", runsOn: "slp-peer-alt", there: false });
  assert.deepEqual(before.of("slp-supervisor"), { name: "slp-supervisor", runsOn: "slp-supervisor", there: true });
  assert.ok(before.available.includes("slp-lead"));

  const matching = { "slp-supervisor": "slp-lead", "slp-peer-alt": "slp-peer" };
  const matched = await plugin.agents({ profile: "slp", matching });
  assert.ok(matched.ok, matched.ok ? "" : matched.says);
  const opened = await plugin.openProject(repository(), "main");
  await plugin.idle();

  assert.equal(paseo.created[0]?.provider, "claude/slp-lead");
  assert.deepEqual((await plugin.view(opened.project))?.stuck, []);
  const after = await shown(plugin, "slp");
  assert.deepEqual(after.of("slp-peer-alt"), { name: "slp-peer-alt", runsOn: "slp-peer", there: true });
  assert.equal(after.problem, null);
});

test("a matching of a profile nobody installed, of a name its roles do not give, or to an agent profile Paseo lacks is refused whole", async () => {
  const { plugin, root } = await started();

  for (const [profile, matching, why] of [
    ["../slp", { "slp-lead": "slp-peer" }, /no profile named \.\.\/slp is installed/],
    ["night-crew", { "slp-lead": "slp-peer" }, /no profile named night-crew is installed/],
    ["slp", { "slp-lead": "slp-peer", "night-owl": "slp-peer" }, /night-owl is not an agent profile slp names/],
    ["slp", { "slp-lead": "no-such" }, /Paseo has no agent profile named no-such to run slp-lead on/],
  ] as const) {
    const refused = await plugin.agents({ profile, matching });
    assert.ok(!refused.ok, profile);
    assert.match(refused.says, why);
  }
  assert.equal(existsSync(join(root, "agents")), false);
});

test("a matching that does not read seats no agent and says why, on the page and on the seat; matched again, the seat is taken", async () => {
  const { plugin, root, paseo } = await started();
  keptIn(root, "slp", "{ not a matching");
  assert.match((await shown(plugin, "slp")).problem ?? "", /does not read: match them again/);

  const opened = await plugin.openProject(repository(), "main");
  await plugin.idle();
  assert.deepEqual(paseo.created, []);
  assert.match(JSON.stringify(await plugin.view(opened.project)), /does not read: match them again/);

  assert.ok((await plugin.agents({ profile: "slp", matching: {} })).ok);
  assert.equal((await shown(plugin, "slp")).problem, null);
  assert.ok((await plugin.human(opened.project, { type: "reseat", scope: "root", reason: "matched", model: null })).ok);
  await plugin.idle();
  assert.equal(paseo.created.length, 1);
});

test("a name matched to an agent profile the Human has since removed: the page says Paseo lacks it, and the seat says which name was matched to it", async () => {
  const { plugin, root, paseo } = await started();
  keptIn(root, "slp", JSON.stringify({ "slp-supervisor": "long-gone" }));
  assert.deepEqual((await shown(plugin, "slp")).of("slp-supervisor"), {
    name: "slp-supervisor",
    runsOn: "long-gone",
    there: false,
  });

  const opened = await plugin.openProject(repository(), "main");
  await plugin.idle();

  assert.deepEqual(paseo.created, []);
  assert.match(
    JSON.stringify(await plugin.view(opened.project)),
    /no Paseo agent profile named long-gone[^"]*\(slp-supervisor is matched to it\)/,
  );
});

test("the names a template gives that Paseo has no profile for are made in Paseo on the Human's word, on the provider they chose; what Paseo holds is left as it is", async () => {
  const { plugin, root, paseo } = await started();
  keptIn(root, "slp", JSON.stringify({ "slp-supervisor": "long-gone", "slp-lead": "slp-peer" }));
  const before = await shown(plugin, "slp");
  assert.deepEqual(before.providers, ["claude"], "only a provider Paseo finds on this machine is offered");
  assert.deepEqual(
    before.agents.filter((agent) => !agent.there).map((agent) => agent.name),
    ["slp-peer-alt", "slp-supervisor"],
  );
  const mine = structuredClone(paseo.held);

  const made = await plugin.createAgents("slp", "claude", "sonnet");
  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(made.made, ["slp-peer-alt"], "a name Paseo holds a profile of is not made again");
  assert.deepEqual(paseo.held.slice(0, mine.length), mine, "every profile Paseo held goes back as the Human shaped it");
  assert.deepEqual(paseo.held.slice(mine.length), [
    { id: "slp-peer-alt", name: "slp-peer-alt", provider: "claude", model: "sonnet" },
  ]);
  const after = await shown(plugin, "slp");
  assert.deepEqual(
    after.agents.filter((agent) => !agent.there),
    [],
    "nothing is left to match",
  );
  assert.deepEqual(
    [after.of("slp-supervisor")?.runsOn, after.of("slp-lead")?.runsOn],
    ["slp-supervisor", "slp-peer"],
    "a name matched to a profile since removed runs on its own again; one matched to a profile Paseo has keeps it",
  );
  assert.deepEqual(
    oneOn(after.agents, "slp-watcher", "slp-peer"),
    { "slp-lead": "slp-peer", "slp-watcher": "slp-peer" },
    "and a name is still matched by itself after, the rest as they were",
  );

  const again = await plugin.createAgents("slp", "claude", null);
  assert.ok(again.ok, again.ok ? "" : again.says);
  assert.deepEqual([again.made, paseo.patches.length], [[], 1], "with nothing lacking, nothing is written");
});

test("where Paseo holds no agent profile, every name a template gives is made at once, and with no model where none was given", async () => {
  const { plugin, paseo } = await started([]);

  const made = await plugin.createAgents("slp", "claude", null);

  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(
    paseo.held,
    ["slp-lead", "slp-peer", "slp-peer-alt", "slp-reviewer", "slp-supervisor", "slp-watcher"].map((name) => ({
      id: name,
      name,
      provider: "claude",
    })),
  );
  assert.deepEqual(
    (await shown(plugin, "slp")).agents.filter((agent) => !agent.there),
    [],
  );
});

test("agent profiles are not made on a provider Paseo does not find here, nor for a template nobody installed: nothing is written", async () => {
  const { plugin, paseo } = await started([]);
  const refused = [
    ["slp", "not-installed", /not-installed/],
    ["slp", "nowhere", /nowhere/],
    ["../slp", "claude", /no profile named/],
  ] as const;
  for (const [profile, provider, says] of refused) {
    const made = await plugin.createAgents(profile, provider, null);
    assert.ok(!made.ok, `${profile} on ${provider}`);
    assert.match(made.says, says);
  }
  assert.deepEqual(paseo.patches, []);
});

test("a Paseo that cannot say which providers it finds: the page still reads what each name runs on, and offers none to make a profile on", async () => {
  const { plugin, paseo } = await started();
  paseo.gate.providersFail = true;

  const read = await shown(plugin, "slp");

  assert.deepEqual(read.providers, []);
  assert.deepEqual(read.of("slp-supervisor"), { name: "slp-supervisor", runsOn: "slp-supervisor", there: true });
});

test("a template installed again keeps the matching of its name", async () => {
  const { plugin } = await started();
  const path = join(mkdtempSync(join(tmpdir(), "sw-shared-")), "night-crew.template.json");
  const about = JSON.stringify({ name: "Night Crew", description: "A crew for the night shift." });
  writeFileSync(path, packed(new Map([...slpFiles(), ["template.json", about]])));
  const install = async () => {
    const read = await plugin.template({ path: path }, null);
    assert.ok(read.ok);
    assert.ok((await plugin.template({ path: path }, read.offer.hash)).ok);
  };

  await install();
  assert.ok((await plugin.agents({ profile: "night-crew", matching: { "slp-peer-alt": "slp-peer" } })).ok);
  await install();

  assert.equal((await shown(plugin, "night-crew")).of("slp-peer-alt")?.runsOn, "slp-peer");
});
