import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

/** An agent's tool server, as bin/team.ts speaks to the plugin: hello with its key, then calls. */
export async function agentTools(socket: string, env: Record<string, string>) {
  const conn = createConnection(socket);
  conn.setEncoding("utf8");
  let buffered = "";
  const waiting: ((said: { type: string; [k: string]: unknown }) => void)[] = [];
  conn.on("data", (chunk: string) => {
    buffered += chunk;
    for (let nl = buffered.indexOf("\n"); nl >= 0; nl = buffered.indexOf("\n")) {
      const said = JSON.parse(buffered.slice(0, nl)) as { type: string };
      buffered = buffered.slice(nl + 1);
      waiting.shift()?.(said);
    }
  });
  const next = () => new Promise<{ type: string; [k: string]: unknown }>((resolve) => waiting.push(resolve));
  conn.write(
    `${JSON.stringify({ type: "hello", project: env.SEATWORKS_PROJECT, actor: env.SEATWORKS_ACTOR, key: env.SEATWORKS_KEY })}\n`,
  );
  const welcome = await next();
  let id = 0;
  return {
    welcome,
    call: async (name: string, args: Record<string, unknown>) => {
      conn.write(`${JSON.stringify({ type: "call", id: ++id, call: randomUUID(), name, args })}\n`);
      const r = await next();
      return r as unknown as { ok: boolean; text: string };
    },
    close: () => conn.destroy(),
  };
}
