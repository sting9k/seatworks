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
  assert.deepEqual(before.of("slp-peer-alt"), {
    name: "slp-peer-alt",
    roles: ["peer"],
    runsOn: "slp-peer-alt",
    there: false,
    provider: null,
    model: null,
    effort: null,
  });
  assert.deepEqual(
    before.of("slp-supervisor"),
    {
      name: "slp-supervisor",
      roles: ["supervisor"],
      runsOn: "slp-supervisor",
      there: true,
      provider: "claude",
      model: "slp-supervisor",
      effort: null,
    },
    "with what the profile it runs on is: its provider, its model, its effort",
  );
  assert.deepEqual(before.of("slp-peer")?.roles, ["peer", "reviewer"], "and every role that names it");
  assert.ok(before.available.includes("slp-lead"));

  const matching = { "slp-supervisor": "slp-lead", "slp-peer-alt": "slp-peer" };
  const matched = await plugin.agents({ profile: "slp", matching });
  assert.ok(matched.ok, matched.ok ? "" : matched.says);
  const opened = await plugin.openProject(repository(), "main");
  await plugin.idle();

  assert.equal(paseo.created[0]?.provider, "claude/slp-lead");
  assert.deepEqual((await plugin.view(opened.project))?.stuck, []);
  const after = await shown(plugin, "slp");
  assert.deepEqual(
    [after.of("slp-peer-alt")?.runsOn, after.of("slp-peer-alt")?.there, after.of("slp-peer-alt")?.model],
    ["slp-peer", true, "slp-peer"],
  );
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
    roles: ["supervisor"],
    runsOn: "long-gone",
    there: false,
    provider: null,
    model: null,
    effort: null,
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

  const made = await plugin.createAgents("slp", "claude", "sonnet", "high");
  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(made.made, ["slp-peer-alt"], "a name Paseo holds a profile of is not made again");
  assert.deepEqual(paseo.held.slice(0, mine.length), mine, "every profile Paseo held goes back as the Human shaped it");
  assert.deepEqual(paseo.held.slice(mine.length), [
    { id: "slp-peer-alt", name: "slp-peer-alt", provider: "claude", model: "sonnet", thinkingOptionId: "high" },
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

  const again = await plugin.createAgents("slp", "claude", "sonnet", null);
  assert.ok(again.ok, again.ok ? "" : again.says);
  assert.deepEqual([again.made, paseo.patches.length], [[], 1], "with nothing lacking, nothing is written");
});

test("where Paseo holds no agent profile, every name a template gives is made at once, each on the model named and with no effort where none was", async () => {
  const { plugin, paseo } = await started([]);

  const made = await plugin.createAgents("slp", "claude", "opus", null);

  assert.ok(made.ok, made.ok ? "" : made.says);
  assert.deepEqual(
    paseo.held,
    ["slp-lead", "slp-peer", "slp-peer-alt", "slp-reviewer", "slp-supervisor", "slp-watcher"].map((name) => ({
      id: name,
      name,
      provider: "claude",
      model: "opus",
    })),
  );
  assert.deepEqual(
    (await shown(plugin, "slp")).agents.filter((agent) => !agent.there),
    [],
  );
});

test("agent profiles are not made on a provider Paseo does not find here, on a model or an effort it does not have, nor for a template nobody installed: nothing is written", async () => {
  const { plugin, paseo } = await started([]);
  const refused = [
    ["slp", "not-installed", "sonnet", null, /not-installed/],
    ["slp", "nowhere", "sonnet", null, /nowhere/],
    ["slp", "claude", "gpt-9", null, /no model named gpt-9/],
    ["slp", "claude", "opus", "low", /opus has no effort named low/],
    ["../slp", "claude", "sonnet", null, /no profile named/],
  ] as const;
  for (const [profile, provider, model, effort, says] of refused) {
    const made = await plugin.createAgents(profile, provider, model, effort);
    assert.ok(!made.ok, `${profile} on ${provider}/${model}`);
    assert.match(made.says, says);
  }
  assert.deepEqual(paseo.patches, []);
});

test("the models a provider has are read for the page, each with its efforts and which it starts on", async () => {
  const { plugin } = await started();
  const read = await plugin.models("claude");
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.deepEqual(read.models, [
    {
      id: "sonnet",
      label: "Sonnet",
      isDefault: true,
      efforts: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
      defaultEffort: "low",
    },
    { id: "opus", label: "Opus", isDefault: false, efforts: [{ id: "max", label: "Max" }], defaultEffort: null },
    { id: "haiku", label: "Haiku", isDefault: false, efforts: [], defaultEffort: null },
  ]);
  const none = await plugin.models("nowhere");
  assert.ok(!none.ok);
  assert.match(none.says, /nowhere/);
});

test("the model and the effort an agent profile runs are changed from the page: that profile alone changes in Paseo", async () => {
  const { plugin, paseo } = await started();
  const others = structuredClone(paseo.held.filter((profile) => profile.name !== "slp-lead"));

  const shaped = await plugin.shapeAgent("slp-lead", { provider: "claude", model: "opus", effort: "max" });
  assert.ok(shaped.ok, shaped.ok ? "" : shaped.says);
  assert.deepEqual(
    paseo.held.find((profile) => profile.name === "slp-lead"),
    { id: "slp-lead", name: "slp-lead", provider: "claude", model: "opus", thinkingOptionId: "max" },
  );
  assert.deepEqual(
    paseo.held.filter((profile) => profile.name !== "slp-lead"),
    others,
  );
  const plain = await plugin.shapeAgent("slp-lead", { provider: "claude", model: "haiku", effort: null });
  assert.ok(plain.ok, plain.ok ? "" : plain.says);
  assert.deepEqual(
    paseo.held.find((profile) => profile.name === "slp-lead"),
    { id: "slp-lead", name: "slp-lead", provider: "claude", model: "haiku" },
    "an effort taken away is no longer named",
  );

  for (const [agent, model, effort, says] of [
    ["nobody", "sonnet", null, /no agent profile named nobody/],
    ["slp-lead", "gpt-9", null, /no model named gpt-9/],
    ["slp-lead", "haiku", "max", /haiku has no effort named max/],
  ] as const) {
    const refused = await plugin.shapeAgent(agent, { provider: "claude", model, effort });
    assert.ok(!refused.ok);
    assert.match(refused.says, says);
  }
  assert.equal(paseo.patches.length, 2, "what is refused writes nothing");
});

test("the provider an agent profile runs on is changed from the page, to one Paseo finds here and a model of it; what was the old provider's own goes with it", async () => {
  const { plugin, paseo } = await started();
  paseo.providers.set("codex", [
    { id: "gpt", label: "GPT", isDefault: true, thinkingOptions: [{ id: "medium", label: "Medium" }] },
  ]);
  const lead = paseo.held.find((profile) => profile.name === "slp-lead")!;
  Object.assign(lead, { modeId: "plan", featureValues: { fast: true }, thinkingOptionId: "high" });

  const kept = await plugin.shapeAgent("slp-lead", { provider: "claude", model: "opus", effort: null });
  assert.ok(kept.ok, kept.ok ? "" : kept.says);
  assert.deepEqual(
    paseo.held.find((profile) => profile.name === "slp-lead"),
    {
      id: "slp-lead",
      name: "slp-lead",
      provider: "claude",
      model: "opus",
      modeId: "plan",
      featureValues: { fast: true },
    },
    "on the same provider its mode and its feature values stay",
  );

  const moved = await plugin.shapeAgent("slp-lead", { provider: "codex", model: "gpt", effort: "medium" });
  assert.ok(moved.ok, moved.ok ? "" : moved.says);
  assert.deepEqual(
    paseo.held.find((profile) => profile.name === "slp-lead"),
    { id: "slp-lead", name: "slp-lead", provider: "codex", model: "gpt", thinkingOptionId: "medium" },
  );
  assert.equal((await shown(plugin, "slp")).of("slp-lead")?.provider, "codex", "and the page reads it back");

  for (const [provider, model, says] of [
    ["not-installed", "sonnet", /finds no provider named not-installed/],
    ["nowhere", "sonnet", /finds no provider named nowhere/],
    ["codex", "sonnet", /codex has no model named sonnet/],
  ] as const) {
    const refused = await plugin.shapeAgent("slp-peer", { provider, model, effort: null });
    assert.ok(!refused.ok, `${provider}/${model}`);
    assert.match(refused.says, says);
  }
  assert.equal(paseo.patches.length, 2, "what is refused writes nothing");
});

/** Seats the root of a project anew and gives back the agent Paseo made for it. */
async function reseated(plugin: Plugin, paseo: ReturnType<typeof fakePaseo>, project: string) {
  const again = await plugin.human(project, {
    type: "reseat",
    scope: "root",
    reason: "to run what is set",
    model: null,
  });
  assert.ok(again.ok, again.ok ? "" : again.refused.says);
  await plugin.idle();
  return paseo.created.at(-1)!;
}

/** What the page is shown of one name in a project. */
async function inProject(plugin: Plugin, project: string, name: string) {
  const read = await plugin.projectAgents(project, null);
  assert.ok(read.ok, read.ok ? "" : read.says);
  return read.agents.find((agent) => agent.name === name);
}

test("a project runs an agent profile's name at its own effort, or on its own provider and model: its agents are made so from then on, and no other project's are", async () => {
  const { plugin, paseo } = await started();
  paseo.providers.set("codex", [{ id: "gpt", label: "GPT", isDefault: true }]);
  Object.assign(
    paseo.held.find((profile) => profile.name === "slp-supervisor")!,
    {
      model: "sonnet",
      thinkingOptionId: "low",
      featureValues: { fast: true },
    },
  );
  const one = (await plugin.openProject(repository(), "main")).project;
  const other = (await plugin.openProject(repository(), "main")).project;
  await plugin.idle();
  assert.deepEqual(await inProject(plugin, one, "slp-supervisor"), {
    name: "slp-supervisor",
    roles: ["supervisor"],
    runsOn: "slp-supervisor",
    there: true,
    provider: "claude",
    model: "sonnet",
    effort: "low",
    own: null,
  });

  const effort = await plugin.projectAgents(one, { agent: "slp-supervisor", runs: { effort: "high" } });
  assert.ok(effort.ok, effort.ok ? "" : effort.says);
  assert.deepEqual((await inProject(plugin, one, "slp-supervisor"))?.own, { effort: "high" });
  const harder = await reseated(plugin, paseo, one);
  assert.deepEqual(
    [harder.provider, harder.config.thinkingOptionId, harder.config.featureValues],
    ["claude/sonnet", "high", { fast: true }],
    "the effort is the project's, and the rest of the Human's profile stays",
  );
  const theirs = await reseated(plugin, paseo, other);
  assert.deepEqual(
    [theirs.provider, theirs.config.thinkingOptionId, (await inProject(plugin, other, "slp-supervisor"))?.own],
    ["claude/sonnet", "low", null],
    "another project runs the Human's profile as it is",
  );
  assert.equal(
    paseo.held.find((profile) => profile.name === "slp-supervisor")?.thinkingOptionId,
    "low",
    "and nothing is written in Paseo",
  );

  const moved = await plugin.projectAgents(one, {
    agent: "slp-supervisor",
    runs: { provider: "codex", model: "gpt", effort: null },
  });
  assert.ok(moved.ok, moved.ok ? "" : moved.says);
  const elsewhere = await reseated(plugin, paseo, one);
  assert.deepEqual(
    [elsewhere.provider, elsewhere.config.thinkingOptionId, elsewhere.config.featureValues],
    ["codex/gpt", undefined, undefined],
    "on another provider the feature values of the Human's profile name nothing, and go",
  );

  const back = await plugin.projectAgents(one, { agent: "slp-supervisor", runs: null });
  assert.ok(back.ok, back.ok ? "" : back.says);
  assert.equal((await inProject(plugin, one, "slp-supervisor"))?.own, null);
  const again = await reseated(plugin, paseo, one);
  assert.deepEqual([again.provider, again.config.thinkingOptionId], ["claude/sonnet", "low"]);
});

test("a project's own is refused for a name its template does not give, a profile Paseo lacks, a provider Paseo does not find, a model or an effort that is not the provider's: nothing is kept", async () => {
  const { plugin, root, paseo } = await started();
  Object.assign(
    paseo.held.find((profile) => profile.name === "slp-lead")!,
    { model: "sonnet" },
  );
  const { project } = await plugin.openProject(repository(), "main");
  await plugin.idle();

  for (const [agent, runs, says] of [
    ["night-owl", { effort: "high" }, /night-owl is not an agent profile this project's template names/],
    ["slp-peer-alt", { effort: "high" }, /Paseo has no agent profile named slp-peer-alt/],
    ["slp-lead", { provider: "not-installed", model: "sonnet", effort: null }, /finds no provider named not-installed/],
    ["slp-lead", { model: "gpt-9", effort: null }, /claude has no model named gpt-9/],
    ["slp-lead", { effort: "max" }, /sonnet has no effort named max/],
  ] as const) {
    const refused = await plugin.projectAgents(project, { agent, runs });
    assert.ok(!refused.ok, `${agent} ${JSON.stringify(runs)}`);
    assert.match(refused.says, says);
  }
  assert.equal(existsSync(join(root, "projects", project, "agents.json")), false);
  assert.equal((await plugin.projectAgents("nowhere", null)).ok, false, "nor is one read of a project not attached");
});

test("what a project keeps of its own that does not read seats no agent and says why, on the page and on the seat; picked again, the seat is taken", async () => {
  const { plugin, root, paseo } = await started();
  Object.assign(
    paseo.held.find((profile) => profile.name === "slp-supervisor")!,
    { model: "sonnet" },
  );
  const { project } = await plugin.openProject(repository(), "main");
  await plugin.idle();
  writeFileSync(join(root, "projects", project, "agents.json"), "{ not its own");

  const read = await plugin.projectAgents(project, null);
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.match(read.problem ?? "", /does not read: pick it again/);
  const made = paseo.created.length;
  const again = await plugin.human(project, { type: "reseat", scope: "root", reason: "anew", model: null });
  assert.ok(again.ok, again.ok ? "" : again.refused.says);
  await plugin.idle();
  assert.equal(paseo.created.length, made, "no agent is made from a file nobody can read");
  assert.match(JSON.stringify(await plugin.view(project)), /does not read: pick it again/);

  const picked = await plugin.projectAgents(project, { agent: "slp-supervisor", runs: { effort: "high" } });
  assert.ok(picked.ok, picked.ok ? "" : picked.says);
  assert.equal(picked.problem, null);
  assert.equal((await reseated(plugin, paseo, project)).config.thinkingOptionId, "high");
});

test("an agent profile that names no model seats no agent, and the seat says which profile needs one", async () => {
  const { plugin, paseo } = await started();
  paseo.held.splice(0, paseo.held.length, { id: "slp-supervisor", name: "slp-supervisor", provider: "claude" });

  const opened = await plugin.openProject(repository(), "main");
  await plugin.idle();

  assert.equal(paseo.created.length, 0);
  assert.match(
    JSON.stringify(await plugin.view(opened.project)),
    /the Paseo agent profile slp-supervisor names no model/,
  );
  assert.match(
    (await plugin.view(opened.project))!.stuck.join("\n"),
    /Scope root is open with nobody seated/,
    "which the page shows as stuck, in words",
  );

  const shaped = await plugin.shapeAgent("slp-supervisor", { provider: "claude", model: "sonnet", effort: null });
  assert.ok(shaped.ok, shaped.ok ? "" : shaped.says);
  const again = await plugin.human(opened.project, {
    type: "reseat",
    scope: "root",
    reason: "its profile has a model now",
    model: null,
  });
  assert.ok(again.ok, again.ok ? "" : again.refused.says);
  await plugin.idle();
  assert.equal(paseo.created[0]?.provider, "claude/sonnet", "seated again on the Human's word, it gets its agent");
  assert.deepEqual((await plugin.view(opened.project))!.stuck, []);
});

test("a Paseo that cannot say which providers it finds: the page still reads what each name runs on, and offers none to make a profile on", async () => {
  const { plugin, paseo } = await started();
  paseo.gate.providersFail = true;

  const read = await shown(plugin, "slp");

  assert.deepEqual(read.providers, []);
  assert.deepEqual([read.of("slp-supervisor")?.runsOn, read.of("slp-supervisor")?.there], ["slp-supervisor", true]);
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
