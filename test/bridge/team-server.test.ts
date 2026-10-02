import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { Line } from "../../bin/team-line.ts";
import { Keys } from "../../server/core/keys.ts";
import { TeamSocket } from "../../server/bridge/team-socket.ts";
import type { Command } from "../../shared/contracts/commands.ts";
import { Project } from "../../server/bridge/project.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { parseBody } from "../../shared/contracts/commands.ts";
import { slpProfile, team } from "../kernel/ledger.ts";

/** bin/team.ts as Paseo starts it for an agent, spoken to in MCP's JSON-RPC over stdio. */
function mcp(socket: string, env: Record<string, string>) {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", join(import.meta.dirname, "../../bin/team.ts"), socket],
    {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let buffered = "";
  const answers = new Map<number, (r: { result?: unknown; error?: unknown }) => void>();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk;
    for (let nl = buffered.indexOf("\n"); nl >= 0; nl = buffered.indexOf("\n")) {
      const said = JSON.parse(buffered.slice(0, nl)) as { id?: number; result?: unknown; error?: unknown };
      buffered = buffered.slice(nl + 1);
      if (said.id !== undefined) answers.get(said.id)?.(said);
    }
  });
  let id = 0;
  const request = (method: string, params: unknown) =>
    new Promise<{ result?: unknown; error?: unknown }>((resolve) => {
      const n = ++id;
      answers.set(n, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
    });
  const notify = (method: string) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  return { request, notify, stop: () => child.kill() };
}

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
    const init = await server.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    assert.ok(init.result, JSON.stringify(init.error));
    server.notify("notifications/initialized");
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

test("a tool server with a key that is not its agent's is refused", async () => {
  const { ledger, peer, lead } = team();
  const root = mkdtempSync(join(tmpdir(), "sw-mcp-"));
  const keys = new Keys(join(root, "secret"));
  const port = {
    view: ledger.state,
    submit: () => Promise.reject(new Error("never")),
    report: ledger.profile.report,
    roleTools: () => new Set(["status"]),
    roleGone: () => null,
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
    const init = await server.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    assert.ok(init.error !== undefined || init.result === undefined, "no tools for a borrowed key");
  } finally {
    server.stop();
    await socket.close();
  }
});

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
