import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { ROLE_TOOLS, toolsFor } from "../../shared/contracts/tools.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

// Each case is a row of spec/CONFORMANCE.md, Tools: a call as an agent's tool server sends it, the answer read back.

const pluginDir = join(import.meta.dirname, "../..");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("each read answers from the record, the repository or Paseo: an agent's own scope when it names none, another's by name, and no more turns than asked", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-reads-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const lane = { parent: "root", role: "lead", paths: ["src/"], brief: { goal: { text: "Lane" }, kind: "discovery" } };
  assert.ok((await supervisor.call("open_scope", lane)).ok);
  await plugin.idle();
  const lead = await agentTools(socketPath, paseo.created[1]!.env);
  const task = { parent: "1", role: "peer", paths: ["src/"], brief: { goal: { text: "Task" }, kind: "verification" } };
  assert.ok((await lead.call("open_scope", task)).ok);
  await plugin.idle();
  const peerAgent = paseo.created[2]!;
  mkdirSync(join(peerAgent.cwd, "src"));
  writeFileSync(join(peerAgent.cwd, "src/encode.txt"), "int16\n");
  git(peerAgent.cwd, "add", ".");
  git(peerAgent.cwd, "commit", "-q", "-m", "encoder");
  const peer = await agentTools(socketPath, peerAgent.env);

  const own = await peer.call("status", {});
  assert.ok(own.ok);
  assert.match(own.text, /^Scope 1\.1\b/, "its own scope when it names none");
  assert.match((await peer.call("status", { scope: "1" })).text, /^Scope 1\b(?!\.)/, "another's by name");

  assert.match((await peer.call("record", {})).text, / brief v1: Task$/m, "the record of its own scope");
  assert.match((await peer.call("record", { scope: "1" })).text, / brief v1: Lane$/m);

  const changed = await peer.call("diff", {});
  assert.ok(changed.ok);
  assert.match(
    changed.text,
    /src\/encode\.txt \| 1 \+\n[^]*\+int16/,
    "its own scope's change against its parent's branch",
  );
  assert.match((await lead.call("diff", { scope: "1.1" })).text, /\+int16/, "its owner reads the same by name");
  assert.equal((await lead.call("diff", { scope: "1.9" })).text, "No scope 1.9 is open.");

  paseo.timelines.set(peerAgent.host, [
    { type: "user_message", text: "Scope 1.1 is yours" },
    { type: "reasoning", text: "int16 fits" },
    { type: "assistant_message", text: "Encoded as int16" },
  ]);
  const peerId = peerAgent.labels["seatworks.actor"]!;
  assert.equal(
    (await lead.call("look", { actor: peerId })).text,
    "told: Scope 1.1 is yours\nthought: int16 fits\nsaid: Encoded as int16",
  );
  assert.equal(
    (await lead.call("look", { actor: peerId, last: 2 })).text,
    "thought: int16 fits\nsaid: Encoded as int16",
    "the newest turns, as many as asked for, newest last",
  );

  for (const [args, why] of [
    [{}, /^The arguments do not fit look: [^]*actor/],
    [{ actor: peerId, last: 100_000 }, /^The arguments do not fit look: [^]*last/],
    [{ actor: peerId, last: "all" }, /^The arguments do not fit look: [^]*last/],
  ] as const) {
    const refused = await lead.call("look", args);
    assert.equal(refused.ok, false, JSON.stringify(args));
    assert.match(refused.text, why);
  }
  const misnamed = await peer.call("status", { scope: 7 });
  assert.equal(misnamed.ok, false);
  assert.match(misnamed.text, /^The arguments do not fit status: [^]*scope/);
  for (const t of [supervisor, lead, peer]) t.close();
});

test("an agent that ends a turn with its tools never having reached the plugin is shown as stuck, until they do; and the record keeps that they did", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-unreached-"));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const root = stateRoot();
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const agent = paseo.created[0]!;
  const unreached =
    /^a1 is seated on scope root and has ended a turn, but its agent's tools have never reached the plugin/;
  const stuck = async (of: Plugin) => (await of.view(project))!.stuck.filter((line) => unreached.test(line));

  assert.deepEqual(await stuck(plugin), [], "an agent that has not ended a turn yet is not stuck");
  await plugin.turnEnded(agent.host, { kind: "completed" }, []);
  assert.equal((await stuck(plugin)).length, 1, "it ended a turn and its tool server never said hello");

  const tools = await agentTools(socketPath, agent.env);
  assert.equal(tools.welcome.type, "welcome");
  await plugin.idle();
  assert.deepEqual(await stuck(plugin), []);
  tools.close();

  await plugin.dispose();
  const again = new Plugin(root);
  plugins.push(again);
  again.saw(paseo.api);
  await again.whenReady();
  assert.deepEqual(await stuck(again), [], "the plugin started again knows they reached it, with no new hello");
});

test("every argument an agent is shown says what it is; a line and what it comes from are said once, by each tool that takes them", () => {
  const undescribed: string[] = [];
  type Node = { properties?: Record<string, { description?: string }>; items?: unknown; anyOf?: unknown[] };
  /** Notes each argument with no words of its own, and says whether a line was met on the way. */
  const takesLines = (at: string, schema: unknown): boolean => {
    if (schema === null || typeof schema !== "object") return false;
    const node = schema as Node;
    const names = Object.keys(node.properties ?? {}).join(",");
    // A line and a reference are the same wherever they stand: their own fields are said by the tool, not each time.
    if (names === "text,via" || names === "kind,id") return names === "text,via";
    const inside = Object.entries(node.properties ?? {}).map(([name, property]) => {
      if (!property.description) undescribed.push(`${at}.${name}`);
      return takesLines(`${at}.${name}`, property);
    });
    return [...inside, takesLines(at, node.items), ...(node.anyOf ?? []).map((one) => takesLines(at, one))].some(
      Boolean,
    );
  };
  const report = new Map([["decided", "Each decision a reader could question."]]);
  const silent = toolsFor(ROLE_TOOLS, report)
    .filter((tool) => takesLines(tool.name, tool.inputSchema) && !tool.description.includes("`via: { kind, id }`"))
    .map((tool) => tool.name);
  assert.deepEqual(undescribed, []);
  assert.deepEqual(silent, [], "each tool that takes lines says what a line is and what it may come from");
});
