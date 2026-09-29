// The team's tools for one agent: an MCP server on stdio that carries each call to the plugin over its local socket.
// It holds no rules: every command is checked by the plugin, and the caller is the agent this process's key names.
import { createConnection, type Socket } from "node:net";
import { McpServer, fromJsonSchema, type jsonSchemaValidator } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
type Said =
  | { type: "welcome"; tools: Tool[] }
  | { type: "refused"; why: string }
  | { type: "result"; id: number; ok: boolean; text: string };

const socketPath = process.argv[2] ?? "";
const hello = {
  type: "hello",
  project: process.env.SEATWORKS_PROJECT,
  actor: process.env.SEATWORKS_ACTOR,
  key: process.env.SEATWORKS_KEY,
};
const WELCOME_MS = 10_000;
// The plugin validates every argument against its own schema; the client side does not refuse first.
const unchecked = {
  getValidator: () => (input: unknown) => ({ valid: true, data: input, errorMessage: undefined }),
} as unknown as jsonSchemaValidator;

class Line {
  private socket: Socket | null = null;
  private buffered = "";
  private next = 1;
  private readonly waiting = new Map<number, (said: Extract<Said, { type: "result" }>) => void>();
  private greeting: Promise<Tool[]> | null = null;

  /** Connects and says hello once; a dropped connection is opened again on the next call. */
  open(): Promise<Tool[]> {
    this.greeting ??= new Promise((resolve, reject) => {
      const socket = createConnection(socketPath);
      this.socket = socket;
      socket.setEncoding("utf8");
      const timer = setTimeout(() => {
        reject(new Error("the plugin did not answer: is Paseo running with the plugin loaded?"));
      }, WELCOME_MS);
      socket.on("connect", () => socket.write(`${JSON.stringify(hello)}\n`));
      socket.on("data", (chunk: string) => {
        this.buffered += chunk;
        for (let nl = this.buffered.indexOf("\n"); nl >= 0; nl = this.buffered.indexOf("\n")) {
          const said = JSON.parse(this.buffered.slice(0, nl)) as Said;
          this.buffered = this.buffered.slice(nl + 1);
          if (said.type === "welcome") {
            clearTimeout(timer);
            resolve(said.tools);
          } else if (said.type === "refused") {
            clearTimeout(timer);
            reject(new Error(said.why));
          } else {
            this.waiting.get(said.id)?.(said);
            this.waiting.delete(said.id);
          }
        }
      });
      const drop = () => {
        clearTimeout(timer);
        this.socket = null;
        this.greeting = null;
        for (const answer of this.waiting.values())
          answer({ type: "result", id: 0, ok: false, text: "The connection to the plugin dropped; call again." });
        this.waiting.clear();
      };
      socket.on("close", drop);
      socket.on("error", (error) => {
        reject(error);
        drop();
      });
    });
    return this.greeting;
  }

  async call(name: string, args: unknown): Promise<{ ok: boolean; text: string }> {
    await this.open();
    const id = this.next++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.socket?.write(`${JSON.stringify({ type: "call", id, name, args })}\n`);
    });
  }
}

const line = new Line();

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
