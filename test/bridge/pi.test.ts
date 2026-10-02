import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { mcpClient } from "./mcp-client.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

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
    assert.equal(
      readFileSync(join(home, "config.toml"), "utf8"),
      "[features]\nmulti_agent = false\nmulti_agent_v2 = false\n",
      "its own sub-agents are off in a config of Seatworks' own, not the Human's",
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
    assert.deepEqual(
      roots.map((root) => realpathSync(root)),
      [realpathSync(join(repo, ".git"))],
    );
    assert.equal(writer.config.options?.approval_policy, "never");
  } finally {
    delete process.env.CODEX_HOME;
  }
});

test("an Oh My Pi agent is handed no server by Paseo: its home holds the team's server, which started as that file says lists the agent's tools", async () => {
  const human = mkdtempSync(join(tmpdir(), "sw-omp-human-"));
  writeFileSync(join(human, "agent.db"), "the Human's logins");
  process.env.PI_CODING_AGENT_DIR = human;
  try {
    const { paseo } = await openedOn("omp");
    const made = paseo.created[0]!;
    assert.deepEqual(made.servers, {}, "Paseo refuses an MCP server for Oh My Pi");
    assert.deepEqual(made.approved, []);
    assert.deepEqual(made.config, { modeId: "full", options: undefined }, "Paseo takes no options for it either");
    const home = made.env.PI_CODING_AGENT_DIR!;
    assert.notEqual(home, human);
    assert.equal(realpathSync(join(home, "agent.db")), realpathSync(join(human, "agent.db")));
    const config = JSON.parse(readFileSync(join(home, "config.yml"), "utf8")) as {
      tools: { approval: Record<string, string> };
      mcp: { startupTimeoutMs: number };
    };
    assert.deepEqual(config.tools.approval, { task: "deny", eval: "deny" }, "the tools that start agents are denied");
    assert.equal(config.mcp.startupTimeoutMs, 0, "its first turn waits for the team's tools");

    const { team } = (
      JSON.parse(readFileSync(join(home, "mcp.json"), "utf8")) as {
        mcpServers: { team: { command: string; args: string[]; env: Record<string, string> } };
      }
    ).mcpServers;
    // Oh My Pi fills a value that names a variable of its own environment with that variable's value.
    const filled = Object.fromEntries(
      Object.entries(team.env).map(([name, value]) => [name, made.env[value] ?? value]),
    );
    const server = mcpClient(team.command, team.args, { PATH: process.env.PATH, ...filled });
    try {
      const init = await server.initialize();
      assert.ok(init.result, JSON.stringify(init.error));
      const listed = (await server.request("tools/list", {})).result as { tools: { name: string }[] };
      const names = listed.tools.map((tool) => tool.name);
      assert.ok(names.includes("status") && names.includes("open_scope"), names.join(", "));
    } finally {
      server.stop();
    }
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
  }
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
