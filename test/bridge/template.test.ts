import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { PROJECT_LABEL } from "../../shared/contracts/ids.ts";
import { loadBundle } from "../../server/profile/bundle.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates.

const pluginDir = join(import.meta.dirname, "../..");
const shipped = join(pluginDir, "profile", "slp");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** A copy of the shipped profile to change, in a directory of its own. */
function profileCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "sw-profile-"));
  cpSync(shipped, dir, { recursive: true });
  return dir;
}

test("a profile's hash is of every file that makes its agents do what they do, and of none the plugin does not read", () => {
  const first = profileCopy();
  const sameButForTheGallery = profileCopy();
  writeFileSync(join(sameButForTheGallery, "template.json"), '{ "name": "Another", "description": "x" }\n');
  writeFileSync(join(sameButForTheGallery, "NOTICE.md"), "Drawn from elsewhere.\n");
  assert.equal(loadBundle(sameButForTheGallery).hash, loadBundle(first).hash);

  for (const changed of ["skills/spike/SKILL.md", "reflex.yaml", "watch.yaml", "roles/peer.md"]) {
    const other = profileCopy();
    appendFileSync(join(other, changed), "\n# one more line\n");
    assert.notEqual(loadBundle(other).hash, loadBundle(first).hash, changed);
  }

  const withFileBesideASkill = profileCopy();
  writeFileSync(join(withFileBesideASkill, "skills", "spike", "form.md"), "# The form\n");
  assert.notEqual(loadBundle(withFileBesideASkill).hash, loadBundle(first).hash);
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

/** A state root with one profile installed under `name`: the shipped one, changed. */
function rootWith(name: string, change: (dir: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  const dir = join(root, "profiles", name);
  cpSync(shipped, dir, { recursive: true });
  change(dir);
  return root;
}
const rewrite = (path: string, change: (text: string) => string) => {
  writeFileSync(path, change(readFileSync(path, "utf8")));
};

async function started(root: string) {
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  return { plugin, paseo, socketPath };
}

test("a profile with a flow and docs of its own: every agent reads the flow after its prompt, and is pointed at each doc", async () => {
  const root = rootWith("research", (dir) => {
    writeFileSync(join(dir, "flow.md"), "# The team's flow\n\n1. **Plan** (lead). Then: Work.\n");
    rewrite(
      join(dir, "profile.yaml"),
      (text) => `${text.replace("docs: [docs/adr]", "docs: [docs/adr, docs/research]")}\nflow: flow.md\n`,
    );
  });
  const { plugin, paseo } = await started(root);
  await plugin.openProject(repository(), "main", "research");
  await plugin.idle();

  const first = paseo.created[0]!;
  assert.match(
    first.systemPrompt,
    /# Supervisor[\s\S]*# The team's flow\n\n1\. \*\*Plan\*\* \(lead\)\. Then: Work\.\n\n## Skills/,
  );
  assert.match(
    first.prompt,
    /The project's docs in your copy: `GLOSSARY\.md`, `docs\/adr`, `docs\/research`, `docs\/seatworks\/MAP\.md`\./,
  );
});

test("two projects attached with different profiles each run their own, and the Human's rules are their profile's", async () => {
  const root = rootWith("crew", (dir) => {
    rewrite(join(dir, "roles", "supervisor.md"), (text) => text.replace("# Supervisor", "# Captain of the crew"));
    writeFileSync(join(dir, "template.json"), JSON.stringify({ name: "Crew", description: "A crew of three." }));
  });
  mkdirSync(join(root, "rules", "crew"), { recursive: true });
  writeFileSync(join(root, "rules", "crew", "all.md"), "Keep the deck clear.\n");
  const { plugin, paseo } = await started(root);

  assert.deepEqual(
    (await plugin.profiles()).map((profile) => `${profile.name}: ${profile.title}`),
    ["crew: Crew", "slp: SLP"],
  );
  const shippedOne = await plugin.openProject(repository(), "main");
  const crewOne = await plugin.openProject(repository(), "main", "crew");
  await plugin.idle();

  const promptOf = (project: string) => paseo.created.find((agent) => agent.labels[PROJECT_LABEL] === project)!;
  assert.match(promptOf(shippedOne.project).systemPrompt, /^# Supervisor/);
  assert.doesNotMatch(promptOf(shippedOne.project).systemPrompt, /Keep the deck clear/);
  assert.match(promptOf(crewOne.project).systemPrompt, /^# Captain of the crew[\s\S]*Keep the deck clear\./);

  await assert.rejects(plugin.openProject(repository(), "main", "no-such"), /no profile named no-such/);
});

test("a role taken out of a profile while an agent sits in it: the project runs on, the agent is told why its tools are refused, and the Human sees it", async () => {
  const root = rootWith("crew", () => undefined);
  const first = await started(root);
  const { project } = await first.plugin.openProject(repository(), "main", "crew");
  await first.plugin.idle();
  const supervisor = await agentTools(first.socketPath, first.paseo.created[0]!.env);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await first.plugin.idle();
  supervisor.close();
  const leadEnv = first.paseo.created[1]!.env;
  await first.plugin.dispose();

  rewrite(join(root, "profiles", "crew", "profile.yaml"), (text) =>
    text.replace("  lead:\n", "  mate:\n").replace("spawns: [lead, peer, watcher]", "spawns: [mate, peer, watcher]"),
  );
  const again = await started(root);

  const view = await again.plugin.view(project);
  assert.ok(view);
  assert.equal(view.stuck.filter((line) => line.includes("a role the project's profile no longer has")).length, 1);
  assert.match(view.stuck.join("\n"), /a2 is seated on scope 1 in a role the project's profile no longer has/);
  const lead = await agentTools(again.socketPath, leadEnv);
  const refused = await lead.call("report", { decided: ["Nothing yet"] });
  assert.equal(refused.ok, false);
  assert.match(refused.text, /Your role, lead, is no longer in this project's profile/);
  const read = await lead.call("status", {});
  assert.ok(read.ok, read.text);
  lead.close();
});
