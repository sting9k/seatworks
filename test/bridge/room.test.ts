import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parse } from "yaml";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const slp = join(pluginDir, "templates/slp");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** The variable each agent reads its home from. */
const HOME_OF = {
  claude: "CLAUDE_CONFIG_DIR",
  pi: "PI_CODING_AGENT_DIR",
  codex: "CODEX_HOME",
  opencode: "OPENCODE_CONFIG_DIR",
} as const;

function repository(): string {
  const repo = mkdtempSync(join(tmpdir(), "sw-room-"));
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

async function started(provider: string, root = stateRoot()) {
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir, provider);
  plugin.saw(paseo.api);
  const ready = await plugin.whenReady();
  return { plugin, paseo, ready, root };
}

async function openedOn(provider: string) {
  const all = await started(provider);
  await all.plugin.openProject(repository(), "main");
  await all.plugin.idle();
  return all;
}

/** The skills a template gives a role, as its own file says. */
const skillsOf = (template: string, role: string): string[] =>
  [
    ...((
      parse(readFileSync(join(template, "profile.yaml"), "utf8")) as { roles: Record<string, { skills?: string[] }> }
    ).roles[role]?.skills ?? []),
  ].sort();

/** The skill folders a room holds, leaving out what its agent keeps there itself. */
const held = (room: string): string[] =>
  readdirSync(join(room, "skills"))
    .filter((name) => !name.startsWith("."))
    .sort();

const text = (...path: string[]): string => readFileSync(join(...path), "utf8");

for (const [provider, variable] of Object.entries(HOME_OF))
  test(`an agent on ${provider} finds its role's skills in a room of its own, and no other role's`, async () => {
    const { plugin, paseo, ready } = await openedOn(provider);
    const chief = paseo.created[0]!;
    const room = chief.env[variable]!;
    assert.deepEqual(held(room), skillsOf(slp, "supervisor"));
    for (const skill of held(room))
      assert.equal(text(room, "skills", skill, "SKILL.md"), text(slp, "skills", skill, "SKILL.md"));

    const tools = await agentTools(ready.socketPath, chief.env);
    const task = {
      parent: "root",
      role: "peer",
      paths: ["src/"],
      brief: { goal: { text: "T" }, kind: "verification" },
    };
    assert.ok((await tools.call("open_scope", task)).ok);
    await plugin.idle();
    tools.close();
    const maker = paseo.created[1]!.env[variable]!;
    assert.notEqual(maker, room, "a room a role");
    assert.deepEqual(held(maker), skillsOf(slp, "peer"));
  });

test("two projects on one template and one on another: each agent's room is its own project's, with its own template's skills", async () => {
  const root = stateRoot();
  const other = join(root, "profiles", "dcm");
  cpSync(slp, other, { recursive: true });
  writeFileSync(
    join(other, "profile.yaml"),
    text(other, "profile.yaml").replace(/^( {4}skills: )\[grilling, [^\]]*\]$/m, "$1[grilling]"),
  );
  writeFileSync(
    join(other, "skills", "grilling", "SKILL.md"),
    `${text(other, "skills", "grilling", "SKILL.md")}\nDCM's.\n`,
  );
  const { plugin, paseo } = await started("claude", root);
  await plugin.openProject(repository(), "main", "slp");
  await plugin.openProject(repository(), "main", "slp");
  await plugin.openProject(repository(), "main", "dcm");
  await plugin.idle();

  const [first, second, third] = paseo.created.map((made) => made.env.CLAUDE_CONFIG_DIR!);
  assert.equal(new Set([first, second, third]).size, 3, "a room a project, for the same role");
  assert.deepEqual([held(first!), held(second!)], [skillsOf(slp, "supervisor"), skillsOf(slp, "supervisor")]);
  assert.deepEqual(held(third!), ["grilling"]);
  assert.match(text(third!, "skills", "grilling", "SKILL.md"), /\nDCM's\.\n$/);
  assert.doesNotMatch(text(first!, "skills", "grilling", "SKILL.md"), /DCM's/);
});

test("a room is put right each time its agent's session opens: its skills as the project's copy has them, what its agent keeps there left alone", async () => {
  const { plugin, paseo } = await openedOn("claude");
  const made = paseo.created[0]!;
  const room = made.env.CLAUDE_CONFIG_DIR!;
  const [kept, changed] = held(room);
  writeFileSync(join(room, "skills", kept!, "note.md"), "written by a lost agent\n");
  writeFileSync(join(room, "skills", changed!, "SKILL.md"), "not what the template says\n");
  mkdirSync(join(room, "skills", "not-this-roles"));
  writeFileSync(join(room, "skills", "not-this-roles", "SKILL.md"), "---\nname: not-this-roles\n---\n");
  mkdirSync(join(room, "skills", ".system", "its-own"), { recursive: true });
  mkdirSync(join(room, "projects"));
  writeFileSync(join(room, ".claude.json"), "{}\n");
  writeFileSync(join(room, "settings.json"), "{}\n");

  assert.equal((await plugin.envFor(made.host, "claude"))?.CLAUDE_CONFIG_DIR, room);
  assert.deepEqual(held(room), skillsOf(slp, "supervisor"));
  assert.deepEqual(readdirSync(join(room, "skills", kept!)), ["SKILL.md"]);
  assert.equal(text(room, "skills", changed!, "SKILL.md"), text(slp, "skills", changed!, "SKILL.md"));
  assert.notEqual(text(room, "settings.json"), "{}\n", "its settings are Seatworks' again");
  assert.ok(existsSync(join(room, "skills", ".system", "its-own")), "a folder its agent keeps among its skills");
  assert.ok(existsSync(join(room, "projects")) && existsSync(join(room, ".claude.json")), "and its own state");
});

test("a Claude Code agent's room switches off the skills Claude Code brings and denies its own team, schedule, worktree, plan and publishing tools, and it keeps the Human's login", async () => {
  const { plugin, paseo, ready } = await openedOn("claude");
  const made = paseo.created[0]!;
  const settings = JSON.parse(text(made.env.CLAUDE_CONFIG_DIR!, "settings.json")) as {
    disableBundledSkills: boolean;
    syncClaudeAiSkills: boolean;
    syncClaudeAiPlugins: boolean;
    disableClaudeAiConnectors: boolean;
    permissions: { deny: string[] };
  };
  assert.equal(settings.disableBundledSkills, true);
  assert.deepEqual(
    [settings.syncClaudeAiSkills, settings.syncClaudeAiPlugins, settings.disableClaudeAiConnectors],
    [false, false, true],
    "and what the Human's account would bring into its room: its skills, its plugins, its connectors",
  );
  const denied = settings.permissions.deny;
  for (const tool of [
    ...["Agent", "SendMessage"],
    ...["ScheduleWakeup", "CronCreate"],
    ...["EnterWorktree", "EnterPlanMode"],
    ...["Artifact", "PushNotification"],
  ])
    assert.ok(denied.includes(tool), `${tool} is not among ${denied.join(", ")}`);
  assert.ok(!denied.includes("Skill"), "its skill tool is how it loads its room's skills");
  assert.equal(made.env.DISABLE_DOCTOR_COMMAND, "1", "the one skill that setting leaves is hidden by a variable");
  assert.equal(made.env.CLAUDE_SECURESTORAGE_CONFIG_DIR, "", "its login is kept where the Human's own is");
  assert.equal(made.config.options, undefined, "and Paseo is handed no setting or argument for any of it");

  const tools = await agentTools(ready.socketPath, made.env);
  const task = { parent: "root", role: "peer", paths: ["src/"], brief: { goal: { text: "T" }, kind: "verification" } };
  assert.ok((await tools.call("open_scope", task)).ok);
  await plugin.idle();
  tools.close();
  assert.deepEqual(
    paseo.created[1]!.config.options,
    { sandbox: { enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false } },
    "a writer's sandbox is the one thing Paseo carries",
  );
});

test("a Pi agent's room leaves out the skills the Human keeps for every agent, by the folder's full path", async () => {
  const { paseo } = await openedOn("pi");
  const settings = JSON.parse(text(paseo.created[0]!.env.PI_CODING_AGENT_DIR!, "settings.json")) as {
    skills: string[];
  };
  assert.deepEqual(settings.skills, [`!${homedir()}/.agents/skills/**`]);
});

test("a Codex agent's room keeps the Human's own way to its model and nothing else of their config, switches off what Codex brings beside its hands, and writes off each skill the Human keeps for every agent", async () => {
  const theirs = join(homedir(), ".agents", "skills", "the-humans-own");
  mkdirSync(theirs, { recursive: true });
  writeFileSync(join(theirs, "SKILL.md"), "---\nname: the-humans-own\ndescription: Theirs.\n---\n");
  const human = mkdtempSync(join(tmpdir(), "sw-codex-human-"));
  const provider = [
    "[model_providers.theirs]",
    'name = "Theirs"',
    'base_url = "https://models.example/v1"',
    'experimental_bearer_token = "a-fake-token-of-this-test"',
  ].join("\n");
  writeFileSync(
    join(human, "config.toml"),
    [
      'model_provider = "theirs"',
      'model = "their-own-pick"',
      'model_catalog_json = "/their/catalog.json"',
      "",
      "[mcp_servers.their-server]",
      'url = "http://127.0.0.1:1/mcp"',
      "",
      provider,
      "",
      "[features]",
      "apps = true",
      "",
    ].join("\n"),
  );
  process.env.CODEX_HOME = human;
  try {
    const { paseo } = await openedOn("codex");
    const room = paseo.created[0]!.env.CODEX_HOME!;
    const config = text(room, "config.toml");
    assert.ok(config.startsWith('model_provider = "theirs"\nmodel_catalog_json = "/their/catalog.json"\n'), config);
    assert.ok(config.includes(`\n${provider}\n`), "the provider they reach their model through, its key with it");
    assert.doesNotMatch(config, /their-own-pick|their-server|apps = true/, "and nothing else of their config");
    assert.equal(
      statSync(join(room, "config.toml")).mode & 0o777,
      0o600,
      "a file that may hold their key is theirs to read alone",
    );
    for (const off of [
      ...["multi_agent", "multi_agent_v2"],
      ...["apps", "plugins", "tool_suggest"],
      ...["sleep_tool", "goals"],
      ...["browser_use", "computer_use", "image_generation"],
    ])
      assert.match(config, new RegExp(`^${off} = false$`, "m"));
    assert.match(
      config,
      /^\[skills\.bundled\]\nenabled = false$/m,
      "the skills Codex brings are never put in its room",
    );
    const written = `\n[[skills.config]]\npath = ${JSON.stringify(realpathSync(join(theirs, "SKILL.md")))}\nenabled = false\n`;
    assert.ok(config.includes(written), config);
    assert.equal(config.split("[[skills.config]]").length - 1, 1, "and none of its room's own");
  } finally {
    delete process.env.CODEX_HOME;
  }
});

test("an OpenCode agent is denied every skill but those of its room, each allowed by name", async () => {
  const { paseo } = await openedOn("opencode");
  const options = paseo.created[0]!.config.options as { permission: { skill: Record<string, string> } };
  const [all, ...named] = Object.entries(options.permission.skill);
  assert.deepEqual(all, ["*", "deny"], "the rule for every skill comes first: the last that matches decides");
  assert.deepEqual(
    named.sort(),
    skillsOf(slp, "supervisor").map((skill) => [skill, "allow"]),
  );
});
