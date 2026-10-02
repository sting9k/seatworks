import { spawn } from "node:child_process";

/** A tool server as an agent's harness starts it, spoken to in MCP's JSON-RPC over stdio. */
export function mcpClient(command: string, args: readonly string[], env: Record<string, string | undefined>) {
  const child = spawn(command, [...args], { env, stdio: ["pipe", "pipe", "pipe"] });
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
  /** The handshake every MCP client opens with; its answer is the server's, or its error. */
  const initialize = async () => {
    const init = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    if (init.result !== undefined) notify("notifications/initialized");
    return init;
  };
  return { request, initialize, stop: () => child.kill() };
}
