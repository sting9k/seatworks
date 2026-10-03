import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { oneOn, restOn } from "../../client/state/matching.ts";
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

async function started() {
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
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
  return { ...one, available: read.available, of: (name: string) => one.agents.find((agent) => agent.name === name) };
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

test("one of the Human's agent profiles picked for every name Paseo has none for: each runs on it, and a name matched to one Paseo has is kept", async () => {
  const { plugin, root } = await started();
  keptIn(root, "slp", JSON.stringify({ "slp-supervisor": "long-gone", "slp-lead": "slp-peer" }));
  const before = await shown(plugin, "slp");
  assert.deepEqual(
    before.agents.filter((agent) => !agent.there).map((agent) => agent.name),
    ["slp-peer-alt", "slp-supervisor"],
  );

  const picked = restOn(before.agents, "slp-reviewer");
  assert.deepEqual(picked, {
    "slp-lead": "slp-peer",
    "slp-peer-alt": "slp-reviewer",
    "slp-supervisor": "slp-reviewer",
  });
  const kept = await plugin.agents({ profile: "slp", matching: picked });
  assert.ok(kept.ok, kept.ok ? "" : kept.says);
  const after = await shown(plugin, "slp");
  assert.deepEqual(
    after.agents.filter((agent) => !agent.there),
    [],
    "nothing is left to match",
  );

  const back = oneOn(after.agents, "slp-lead", "slp-lead");
  assert.deepEqual(
    back,
    { "slp-peer-alt": "slp-reviewer", "slp-supervisor": "slp-reviewer" },
    "one name is then set by itself, back on the profile of its own name here, and the rest stay",
  );
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
