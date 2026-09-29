import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { fakePaseo } from "./fake-paseo.ts";

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
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir, provider);
  plugin.saw(paseo.api);
  const ready = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  return { plugin, paseo, ready, root };
}

test("a Pi agent gets the team's tools from Seatworks' extension, loaded from a home that keeps the Human's login", async () => {
  const human = mkdtempSync(join(tmpdir(), "sw-pi-human-"));
  writeFileSync(join(human, "auth.json"), '{"fake":"login"}\n');
  process.env.PI_CODING_AGENT_DIR = human;
  try {
    const { paseo } = await openedOn("pi");
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
