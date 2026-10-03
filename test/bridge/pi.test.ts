import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** The tools a Claude agent is denied, as the settings of its own home say. */
const deniedIn = (home: string): string[] =>
  (JSON.parse(readFileSync(join(home, "settings.json"), "utf8")) as { permissions: { deny: string[] } }).permissions
    .deny;

async function openedOn(provider: string) {
  const repo = mkdtempSync(join(tmpdir(), "sw-pi-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir, provider);
  plugin.saw(paseo.api);
  const ready = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  return { plugin, paseo, ready, root, repo };
}

test("a Pi agent gets the team's tools from Seatworks' extension, loaded from a home that keeps the Human's login", async () => {
  const human = mkdtempSync(join(tmpdir(), "sw-pi-human-"));
  writeFileSync(join(human, "auth.json"), '{"fake":"login"}\n');
  process.env.PI_CODING_AGENT_DIR = human;
  try {
    const { paseo } = await openedOn("pi");
    assert.deepEqual(paseo.created[0]!.servers, {}, "Paseo is handed no server for Pi, which it would refuse");
    assert.deepEqual(paseo.created[0]!.approved, [], "and no tool to approve ahead");
    const env = paseo.created[0]!.env;
    const home = env.PI_CODING_AGENT_DIR!;
    assert.notEqual(home, human);
    assert.equal(realpathSync(join(home, "auth.json")), realpathSync(join(human, "auth.json")));
    const settings = JSON.parse(readFileSync(join(home, "settings.json"), "utf8")) as { extensions: string[] };
    const extension = settings.extensions[0]!;
    assert.equal(extension, join(pluginDir, "harness/pi/extension.ts"));

    const tools = new Map<string, { execute(id: string, params: unknown): Promise<{ content: { text: string }[] }> }>();
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const load = (await import(extension)) as { default: (pi: unknown) => Promise<void> };
      await load.default({
        registerTool: (t: { name: string } & Parameters<typeof tools.set>[1]) => tools.set(t.name, t),
        on: () => undefined,
      });
    } finally {
      process.env = saved;
    }
    const status = await tools.get("status")!.execute("call-1", { scope: "root" });
    assert.match(status.content[0]!.text, /Scope root/);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
  }
});

test("a Codex agent asks nobody and starts no agent of its own, and only as a writer may it write the repository's git directory", async () => {
  const human = mkdtempSync(join(tmpdir(), "sw-codex-human-"));
  writeFileSync(join(human, "auth.json"), '{"fake":"login"}\n');
  writeFileSync(join(human, "config.toml"), 'model = "the-humans-own"\n');
  process.env.CODEX_HOME = human;
  try {
    const { plugin, paseo, ready, repo } = await openedOn("codex");
    const owner = paseo.created[0]!;
    assert.equal(owner.config.modeId, "auto");
    assert.deepEqual(
      owner.config.options,
      { approval_policy: "never", features: { multi_agent_v2: false } },
      "one that does not write is given no root to write beside its copy",
    );
    assert.ok(owner.servers.team && owner.approved.includes("team.status"), "Codex takes the team's server from Paseo");
    const home = owner.env.CODEX_HOME!;
    assert.notEqual(home, human);
    assert.equal(realpathSync(join(home, "auth.json")), realpathSync(join(human, "auth.json")));
    const config = readFileSync(join(home, "config.toml"), "utf8");
    assert.match(config, /^\[features\]\nmulti_agent = false\nmulti_agent_v2 = false\n/, "its own sub-agents are off");
    assert.ok(
      config.includes('\n[mcp_servers.paseo]\nurl = "http://not-for-a-teams-agent.invalid/"\nenabled = false\n'),
      "and so is the server Paseo may add for its tools, in a config of Seatworks' own",
    );
    assert.doesNotMatch(config, /the-humans-own/, "which holds nothing of the Human's config but their way to a model");
    assert.match(
      readFileSync(join(home, "rules", "seatworks.rules"), "utf8"),
      /prefix_rule\(\s*pattern = \["paseo"\],\s*decision = "forbidden"/,
      "and Paseo's command line is forbidden it by a rule in that home",
    );

    const tools = await agentTools(ready.socketPath, owner.env);
    const task = {
      parent: "root",
      role: "peer",
      paths: ["src/"],
      brief: { goal: { text: "T" }, kind: "verification" },
    };
    assert.ok((await tools.call("open_scope", task)).ok);
    await plugin.idle();
    tools.close();
    const writer = paseo.created[1]!;
    const roots = (writer.config.options?.sandbox_workspace_write as { writable_roots: string[] }).writable_roots;
    const own = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: writer.cwd, encoding: "utf8" }).trim();
    assert.notEqual(realpathSync(own), realpathSync(join(repo, ".git")), "it works in a worktree, which has its own");
    assert.deepEqual(
      roots.map((root) => realpathSync(root)),
      [realpathSync(join(repo, ".git")), realpathSync(own)],
      "a commit writes its objects and its branch in the repository's git directory, and its index in the worktree's",
    );
    assert.equal(writer.config.options?.approval_policy, "never");
  } finally {
    delete process.env.CODEX_HOME;
  }
});

test("an OpenCode agent asks nobody, starts no agent of its own and is shown none of Paseo's tools, when made and when reopened", async () => {
  const { plugin, paseo, root } = await openedOn("opencode");
  const made = paseo.created[0]!;
  assert.ok(made.servers.team && made.approved.includes("team.status"), "OpenCode takes the team's server from Paseo");
  assert.equal(made.config.modeId, "build", "the agent OpenCode ships for building, whatever the profile names");
  const { skill: _skills, ...permission } = (made.config.options as { permission: Record<string, unknown> }).permission;
  assert.deepEqual(
    permission,
    { read: "allow", external_directory: "allow", bash: { "paseo *": "deny" }, task: "deny", question: "deny" },
    "nothing asks, and no subagent, question to the Human or Paseo's command line is left it",
  );
  // Paseo's schema for OpenCode's options has no place for a tool by name: the rule is in the config its server reads.
  const off = { action: "paseo_*", resource: "*", effect: "deny" };
  // A snapshot OpenCode takes of its own is a git run with a git directory elsewhere, which the guard on its PATH refuses.
  const inline = { permissions: [off], agents: { build: { permissions: [off] } }, snapshot: false };
  assert.deepEqual(JSON.parse(made.env.OPENCODE_CONFIG_CONTENT!), inline);

  await plugin.dispose();
  const restarted = new Plugin(root);
  plugins.push(restarted);
  restarted.saw(paseo.api);
  const env = await restarted.envFor(made.host, "opencode");
  assert.deepEqual(JSON.parse(env!.OPENCODE_CONFIG_CONTENT!), inline, "OpenCode's server is started again from it");
});

test("an agent reopened after a daemon restart gets its whole seat back: the git shim first on its PATH", async () => {
  const { plugin, paseo, ready, root } = await openedOn("claude");
  await plugin.dispose();
  const restarted = new Plugin(root);
  plugins.push(restarted);
  restarted.saw(paseo.api);
  // The session's hook arrives first, before anything has opened the project that knows the agent.
  const env = await restarted.envFor(paseo.created[0]!.host, "claude");
  assert.ok(env);
  assert.ok(env.PATH?.startsWith(ready.shimDir), env.PATH);
  assert.equal(env.SEATWORKS_KEY, paseo.created[0]!.env.SEATWORKS_KEY);
  assert.equal(env.SEATWORKS_WRITES, paseo.created[0]!.env.SEATWORKS_WRITES);
});

test("no agent is left Paseo's own tools or its command line: its process is pointed at no daemon, when made and when reopened, and a Claude agent is denied both by name", async () => {
  const { plugin, paseo, root } = await openedOn("claude");
  const made = paseo.created[0]!;
  const nowhere = { PASEO_HOST: "not-for-a-teams-agent.invalid:1", PASEO_HOME: "" };
  assert.deepEqual({ PASEO_HOST: made.env.PASEO_HOST, PASEO_HOME: made.env.PASEO_HOME }, nowhere);
  const denied = deniedIn(made.env.CLAUDE_CONFIG_DIR!);
  assert.ok(denied.includes("mcp__paseo"), "every tool of the server Paseo adds for its own tools");
  assert.ok(denied.includes("Bash(paseo *)"), "and its command line, as Claude usually writes it");

  await plugin.dispose();
  const restarted = new Plugin(root);
  plugins.push(restarted);
  restarted.saw(paseo.api);
  const env = await restarted.envFor(made.host, "claude");
  assert.deepEqual({ PASEO_HOST: env?.PASEO_HOST, PASEO_HOME: env?.PASEO_HOME }, nowhere);
});

test("a Claude agent is made without the tool that parks a turn until a time it names: mail waits for a turn's end", async () => {
  const { paseo } = await openedOn("claude");
  const denied = deniedIn(paseo.created[0]!.env.CLAUDE_CONFIG_DIR!);
  assert.ok(denied.includes("ScheduleWakeup"), denied.join(", "));
});

test("a permission asked while the plugin was down is on the record once it starts, and once only", async () => {
  const { plugin, paseo, root } = await openedOn("claude");
  const project = plugin.projects()[0]!.id;
  await plugin.dispose();
  const host = paseo.created[0]!.host;
  paseo.pending.set(host, new Set(["r1"]));
  const restarted = new Plugin(root);
  plugins.push(restarted);
  restarted.saw(paseo.api);
  await restarted.whenReady();
  await restarted.idle();
  assert.equal((await restarted.view(project))?.human.permissions.length, 1);
  await restarted.permissionAsked(host, "r1", "the same request, by its hook");
  assert.equal((await restarted.view(project))?.human.permissions.length, 1);
});
