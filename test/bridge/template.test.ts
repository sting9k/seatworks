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

const TICKETS = `
servers:
  tickets:
    type: stdio
    command: npx
    args: [-y, some-ticket-server]
    env: { TOKEN: $SW_TEST_TICKETS_TOKEN, REGION: eu }
`;
/** The shipped profile with an outside server declared and given to the root, with two of its tools. */
const withTickets = (dir: string) => {
  rewrite(
    join(dir, "profile.yaml"),
    (text) =>
      text.replace("    humanDoor: true\n", "    humanDoor: true\n    servers: { tickets: [search, create_issue] }\n") +
      TICKETS,
  );
};

test("a role given an outside server is made with it beside the team's, its named tools approved ahead and its variable filled in; a role given none has only the team's", async () => {
  process.env.SW_TEST_TICKETS_TOKEN = "t0ken";
  const { plugin, paseo, socketPath } = await started(rootWith("desk", withTickets));
  await plugin.openProject(repository(), "main", "desk");
  await plugin.idle();

  const root = paseo.created[0]!;
  assert.deepEqual(Object.keys(root.servers).sort(), ["team", "tickets"]);
  assert.deepEqual(root.servers.tickets, {
    type: "stdio",
    command: "npx",
    args: ["-y", "some-ticket-server"],
    env: { TOKEN: "t0ken", REGION: "eu" },
  });
  assert.deepEqual(
    root.approved.filter((tool) => tool.startsWith("tickets.")),
    ["tickets.search", "tickets.create_issue"],
  );
  assert.equal(root.servers.team?.alwaysLoad, true);

  const supervisor = await agentTools(socketPath, root.env);
  const lane = await supervisor.call("open_scope", {
    parent: "root",
    role: "lead",
    paths: ["docs/"],
    brief: { goal: { text: "Tidy the docs" }, kind: "verification" },
  });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  supervisor.close();
  assert.deepEqual(Object.keys(paseo.created[1]!.servers), ["team"]);
  assert.ok(paseo.created[1]!.approved.every((tool) => tool.startsWith("team.")));
});

test("a role whose server reads a variable that is not set is not seated, and the reason names the server and the variable", async () => {
  delete process.env.SW_TEST_TICKETS_TOKEN;
  const { plugin, paseo } = await started(rootWith("desk", withTickets));
  const { project } = await plugin.openProject(repository(), "main", "desk");
  await plugin.idle();

  assert.deepEqual(paseo.created, []);
  const view = await plugin.view(project);
  assert.match(JSON.stringify(view), /the outside server tickets reads \$SW_TEST_TICKETS_TOKEN, which is not set/);
});

test("a role given an outside server is not seated on an agent that cannot take one, and the reason names the server", async () => {
  process.env.SW_TEST_TICKETS_TOKEN = "t0ken";
  const root = rootWith("desk", withTickets);
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir, "pi");
  plugin.saw(paseo.api);
  await plugin.whenReady();
  const { project } = await plugin.openProject(repository(), "main", "desk");
  await plugin.idle();

  assert.deepEqual(paseo.created, []);
  assert.match(JSON.stringify(await plugin.view(project)), /an agent of pi cannot be given the outside server tickets/);
});

test("a profile that gives a role a server it does not declare, or names one as the team's own, does not load", () => {
  const undeclared = profileCopy();
  rewrite(join(undeclared, "profile.yaml"), (text) =>
    text.replace("    humanDoor: true\n", "    humanDoor: true\n    servers: { tickets: [search] }\n"),
  );
  assert.throws(() => loadBundle(undeclared), /is given the server tickets, which the profile does not declare/);

  const asTheTeams = profileCopy();
  rewrite(join(asTheTeams, "profile.yaml"), (text) => `${text}\nservers:\n  team:\n    type: stdio\n    command: x\n`);
  assert.throws(() => loadBundle(asTheTeams), /no outside server may be named team/);
});

test("a profile that gives a role a tool the team does not have, such as one misspelt, does not load", () => {
  const misspelt = profileCopy();
  rewrite(join(misspelt, "profile.yaml"), (text) =>
    text.replace("hand_back, run_checks, send_message", "handback, run_checks, send_message"),
  );
  assert.throws(() => loadBundle(misspelt), /role peer is given the tool handback, which the team does not have/);

  const theHumans = profileCopy();
  rewrite(join(theHumans, "profile.yaml"), (text) =>
    text.replace("tools: [look, record, diff, attend, pass]", "tools: [look, record, answer_question]"),
  );
  assert.throws(() => loadBundle(theHumans), /role watcher is given the tool answer_question/);
});
