// The team's tools for one agent: an MCP server on stdio that carries each call to the plugin over its local socket.
// It holds no rules: every command is checked by the plugin, and the caller is the agent this process's key names.
import { McpServer, fromJsonSchema, type jsonSchemaValidator } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Line } from "./team-line.ts";

// The plugin validates every argument against its own schema; the client side does not refuse first.
const unchecked = {
  getValidator: () => (input: unknown) => ({ valid: true, data: input, errorMessage: undefined }),
} as unknown as jsonSchemaValidator;

const line = new Line(process.argv[2] ?? "");

serveStdio(async () => {
  const tools = await line.open();
  const server = new McpServer({ name: "team", version: "1" }, { capabilities: { tools: {} } });
  for (const tool of tools)
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: fromJsonSchema(tool.inputSchema, unchecked) },
      async (args) => {
        const reply = await line.call(tool.name, args ?? {});
        return { content: [{ type: "text", text: reply.text }], isError: !reply.ok };
      },
    );
  return server;
});
