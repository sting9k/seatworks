// The team's tools for a Pi agent. Pi has no MCP of its own, so this extension, loaded from the agent directory Seatworks
// gives Pi agents (harness/pi.json), registers the tools the plugin lists for this agent and carries each call over
// the plugin's local socket, as bin/team.ts does for the other agents. Pi takes a plain JSON Schema for parameters.
import { Line } from "../../bin/team-line.ts";

type Result = { content: { type: "text"; text: string }[]; details: undefined };
type PiTool = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(toolCallId: string, params: unknown): Promise<Result>;
};
type Pi = { registerTool(tool: PiTool): void; on(event: "session_shutdown", handler: () => void): void };

export default async function seatworks(pi: Pi): Promise<void> {
  const socket = process.env.SEATWORKS_SOCKET;
  if (!socket) return;
  const line = new Line(socket);
  // Pi waits for an async factory, and the tools must be registered before the session starts.
  const tools = await line.open();
  for (const tool of tools)
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      async execute(_toolCallId, params) {
        const reply = await line.call(tool.name, params ?? {});
        // Pi marks a tool result failed only when execute throws.
        if (!reply.ok) throw new Error(reply.text);
        return { content: [{ type: "text", text: reply.text }], details: undefined };
      },
    });
  pi.on("session_shutdown", () => {
    line.close();
  });
}
