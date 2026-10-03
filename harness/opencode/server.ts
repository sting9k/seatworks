// The door for mail into an OpenCode agent's turn. OpenCode 2 loads this folder as a plugin of the server it starts for
// one agent (harness/opencode.json). After a tool has run it asks the plugin, over the line the agent's tools use,
// whether mail may enter the turn, and adds what comes to what the tool returned: the model reads that next.
import { Line } from "../../bin/team-line.ts";

/** A tool's run as OpenCode hands it to a hook once it is over: what it returned is the hook's to change. */
type Ran = { status: string; result?: { content: unknown } };
type Hook = { dispose?(): Promise<void> } | undefined;
type Context = { tool: { hook(name: "execute.after", run: (ran: Ran) => Promise<void>): Promise<Hook> } };

export default {
  id: "seatworks",
  async setup(context: Context): Promise<() => Promise<void>> {
    const socket = process.env.SEATWORKS_SOCKET;
    // Only where the team's template lets mail into a turn, which the plugin says by naming the seat a file for it.
    if (!socket || process.env.SEATWORKS_MAIL === undefined) return () => Promise.resolve();
    const line = new Line(socket);
    // A plugin that is not answering yet is asked again at the first tool: OpenCode starts either way.
    await line.open().catch(() => undefined);
    const hook = await context.tool.hook("execute.after", async (ran) => {
      if (ran.status !== "completed" || ran.result === undefined) return;
      const text = await line.mail();
      if (text === "") return;
      const content = ran.result.content;
      ran.result.content = Array.isArray(content)
        ? [...(content as unknown[]), { type: "text", text }]
        : `${String(content)}\n\n${text}`;
    });
    return async () => {
      await hook?.dispose?.();
      line.close();
    };
  },
};
