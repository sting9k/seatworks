import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { Line } from "../../bin/team-line.ts";
import { Keys } from "../../server/core/keys.ts";
import { agentTools } from "./agent-tools.ts";
import { TeamSocket } from "../../server/bridge/team-socket.ts";
import type { Command } from "../../shared/contracts/commands.ts";
import { Project } from "../../server/bridge/project.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { parseBody } from "../../shared/contracts/commands.ts";
import { slpProfile, team } from "../kernel/ledger.ts";
import { mcpClient } from "./mcp-client.ts";

/** bin/team.ts as Paseo starts it for an agent. */
const mcp = (socket: string, env: Record<string, string>) =>
  mcpClient(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", join(import.meta.dirname, "../../bin/team.ts"), socket],
    { ...process.env, ...env },
  );

test("an agent's tool server lists its role's tools and carries a call to the kernel as that agent", async () => {
  const { ledger, peer } = team();
  const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
  const keys = new Keys(join(root, "secret"));
  const port = {
    get view() {
      return ledger.state;
    },
    submit: (command: Command) => {
      const { type, ...args } = command.body;
      return Promise.resolve(ledger.send(command.caller, type, args) as never);
    },
    report: ledger.profile.report,
    roleTools: (actor: string) => ledger.profile.roles.get(ledger.state.actors.get(actor)?.role ?? "")?.tools ?? null,
    roleGone: () => null,
    reached: () => undefined,
    read: () => Promise.resolve("status text"),
  };
  const socket = new TeamSocket(join(root, "team.sock"), keys, (id) => (id === "p" ? port : undefined));
  await socket.listen();
  const server = mcp(join(root, "team.sock"), {
    SEATWORKS_PROJECT: "p",
    SEATWORKS_ACTOR: peer,
    SEATWORKS_KEY: keys.keyOf("p", peer),
  });
  try {
    const init = await server.initialize();
    assert.ok(init.result, JSON.stringify(init.error));
    const listed = (await server.request("tools/list", {})).result as { tools: { name: string }[] };
    const names = listed.tools.map((t) => t.name).sort();
    assert.ok(names.includes("raise_finding") && names.includes("hand_back") && names.includes("status"));
    assert.ok(!names.includes("integrate"), "a Peer is not shown what its role is not given");

    const called = (
      await server.request("tools/call", {
        name: "raise_finding",
        arguments: { text: "int16 is too coarse", default: "keep it" },
      })
    ).result as {
      content: { text: string }[];
      isError?: boolean;
    };
    assert.equal(called.isError, false);
    assert.match(called.content[0]!.text, /finding raised/);
    assert.equal([...ledger.state.findings.values()][0]?.raisedBy, peer, "the caller is the agent the key names");
  } finally {
    server.stop();
    await socket.close();
  }
});

test(
  "a tool server with a key that is not its agent's is refused, and a call on its line is answered so",
  { timeout: 10_000 },
  async () => {
    const { ledger, peer, lead } = team();
    const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
    const keys = new Keys(join(root, "secret"));
    const port = {
      view: ledger.state,
      submit: () => Promise.reject(new Error("never")),
      report: ledger.profile.report,
      roleTools: () => new Set(["status"]),
      roleGone: () => null,
      reached: () => undefined,
      read: () => Promise.resolve(""),
    };
    const socket = new TeamSocket(join(root, "team.sock"), keys, () => port);
    await socket.listen();
    const server = mcp(join(root, "team.sock"), {
      SEATWORKS_PROJECT: "p",
      SEATWORKS_ACTOR: lead,
      SEATWORKS_KEY: keys.keyOf("p", peer),
    });
    try {
      const init = await server.initialize();
      assert.ok(init.error !== undefined || init.result === undefined, "no tools for a borrowed key");
      const line = await agentTools(join(root, "team.sock"), {
        SEATWORKS_PROJECT: "p",
        SEATWORKS_ACTOR: lead,
        SEATWORKS_KEY: keys.keyOf("p", peer),
      });
      assert.equal(line.welcome.type, "refused");
      assert.deepEqual(
        await line.call("status", {}),
        { type: "result", id: 1, ok: false, text: "This line has not said hello as a seated agent: nothing was done." },
        "a call on a line the plugin refused is answered in words, not left waiting",
      );
      line.close();
    } finally {
      server.stop();
      await socket.close();
    }
  },
);

test("a call whose answer is lost with the connection is sent again and recorded once", async () => {
  const root = mkdtempSync(join(tmpdir(), "sw-line-"));
  const keys = new Keys(join(root, "secret"));
  const profile = slpProfile();
  const store = new ProjectStore(join(root, "ledger.db"));
  const project = Project.open("p", store, profile);
  const stamp = (type: string, args: Record<string, unknown>) => {
    const parsed = parseBody(type, args);
    if (!parsed.ok) throw new Error(parsed.says);
    return { id: type, at: "2026-09-30T00:00:00.000Z", caller: { kind: "human" as const }, body: parsed.body };
  };
  await project.submit(
    stamp("open_project", { base: "main", profile: "slp", profileHash: "h", model: "slp-supervisor" }),
  );
  const supervisor = "a1";
  const port = {
    get view() {
      return project.view;
    },
    submit: (command: Command) => project.submit(command),
    report: profile.report,
    roleTools: (actor: string) => profile.roles.get(project.view.actors.get(actor)?.role ?? "")?.tools ?? null,
    roleGone: () => null,
    reached: () => undefined,
    read: () => Promise.resolve(""),
  };
  const socket = new TeamSocket(join(root, "team.sock"), keys, (id) => (id === "p" ? port : undefined));
  await socket.listen();
  // Between the line and the plugin: the first answer to a call never arrives, and the connection drops with it.
  let dropped = false;
  const proxy = createServer((client) => {
    const upstream = createConnection(join(root, "team.sock"));
    client.pipe(upstream);
    upstream.on("data", (chunk: Buffer) => {
      if (!dropped && chunk.toString().includes('"type":"result"')) {
        dropped = true;
        client.destroy();
        upstream.destroy();
      } else client.write(chunk);
    });
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(join(root, "proxy.sock"), resolve));
  const saved = { ...process.env };
  Object.assign(process.env, {
    SEATWORKS_PROJECT: "p",
    SEATWORKS_ACTOR: supervisor,
    SEATWORKS_KEY: keys.keyOf("p", supervisor),
  });
  const line = new Line(join(root, "proxy.sock"));
  try {
    const said = await line.call("set_checks", { checks: [{ name: "unit", run: ["npm", "test"] }] });
    assert.equal(dropped, true, "the first answer was lost");
    assert.equal(said.ok, true, said.text);
    assert.equal(
      [...store.read(0)].filter((e) => e.type === "checks_set").length,
      1,
      "recorded once, though sent twice",
    );
  } finally {
    project.dispose();
    process.env = saved;
    line.close();
    await new Promise((resolve) => proxy.close(resolve));
    await socket.close();
  }
});

/** The environment an agent's tool server is started with, set for a line opened in this process. */
function asAgent(project: string, actor: string, key: string): () => void {
  const saved = { ...process.env };
  Object.assign(process.env, { SEATWORKS_PROJECT: project, SEATWORKS_ACTOR: actor, SEATWORKS_KEY: key });
  return () => {
    process.env = saved;
  };
}

test("a tool server whose project cannot be opened is refused, saying so, and the plugin goes on serving the others", async () => {
  const { ledger, peer } = team();
  const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
  const keys = new Keys(join(root, "secret"));
  const port = {
    view: ledger.state,
    submit: () => Promise.reject(new Error("never")),
    report: ledger.profile.report,
    roleTools: () => new Set(["status"]),
    roleGone: () => null,
    reached: () => undefined,
    read: () => Promise.resolve("status text"),
  };
  const socket = new TeamSocket(join(root, "team.sock"), keys, (id) => {
    if (id === "broken") throw new Error("its log does not fold");
    return port;
  });
  await socket.listen();
  const restore = asAgent("broken", peer, keys.keyOf("broken", peer));
  const broken = new Line(join(root, "team.sock"));
  try {
    await assert.rejects(broken.open(), /the plugin could not open this agent's project/);
    Object.assign(process.env, { SEATWORKS_PROJECT: "p", SEATWORKS_KEY: keys.keyOf("p", peer) });
    const working = new Line(join(root, "team.sock"));
    assert.deepEqual(await working.call("status", {}), { ok: true, text: "status text" });
    working.close();
  } finally {
    restore();
    broken.close();
    await socket.close();
  }
});

test("a tool server started before the plugin listens waits and connects once it does; one the plugin refuses is not tried again", async () => {
  const { ledger, peer } = team();
  const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
  const keys = new Keys(join(root, "secret"));
  const port = {
    view: ledger.state,
    submit: () => Promise.reject(new Error("never")),
    report: ledger.profile.report,
    roleTools: () => new Set(["status"]),
    roleGone: () => null,
    reached: () => undefined,
    read: () => Promise.resolve("status text"),
  };
  let hellos = 0;
  const socket = new TeamSocket(join(root, "team.sock"), keys, () => {
    hellos++;
    return port;
  });
  const restore = asAgent("p", peer, keys.keyOf("p", peer));
  const early = new Line(join(root, "team.sock"));
  const stranger = new Line(join(root, "team.sock"));
  try {
    const opening = early.open();
    await socket.listen();
    assert.deepEqual(
      (await opening).map((tool) => tool.name),
      ["status", "record", "diff", "look"],
      "it was started first, and has its tools all the same",
    );
    assert.deepEqual(await early.call("status", {}), { ok: true, text: "status text" });

    hellos = 0;
    process.env.SEATWORKS_KEY = "not-a-key";
    await assert.rejects(stranger.open(), /does not belong to a seated agent/);
    assert.equal(hellos, 1, "a refusal is the plugin's answer, not a plugin that is away");
  } finally {
    restore();
    early.close();
    stranger.close();
    await socket.close();
  }
});

test("a call made while the plugin is away says so in words, and one made once it is back is carried", async () => {
  const { ledger, peer } = team();
  const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
  const keys = new Keys(join(root, "secret"));
  const port = {
    view: ledger.state,
    submit: () => Promise.reject(new Error("never")),
    report: ledger.profile.report,
    roleTools: () => new Set(["status"]),
    roleGone: () => null,
    reached: () => undefined,
    read: () => Promise.resolve("status text"),
  };
  const restore = asAgent("p", peer, keys.keyOf("p", peer));
  const line = new Line(join(root, "team.sock"));
  const socket = new TeamSocket(join(root, "team.sock"), keys, () => port);
  try {
    const away = await line.call("status", {});
    assert.equal(away.ok, false);
    assert.match(away.text, /^The plugin is not answering/);
    await socket.listen();
    assert.deepEqual(await line.call("status", {}), { ok: true, text: "status text" });
  } finally {
    restore();
    line.close();
    await socket.close();
  }
});
