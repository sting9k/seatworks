import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Keys } from "../../server/core/keys.ts";
import { TeamSocket } from "../../server/bridge/team-socket.ts";
import type { Command } from "../../shared/contracts/commands.ts";
import { team } from "../kernel/ledger.ts";

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
    roleTools: (actor: string) => ledger.profile.roles.get(ledger.state.actors.get(actor)?.role ?? "")?.tools ?? null,
    read: () => Promise.resolve("status text"),
  };
  const socket = new TeamSocket(join(root, "team.sock"), keys, (id) => (id === "p" ? (port) : undefined));
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
    roleTools: () => new Set(["status"]),
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
