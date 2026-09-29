// The line from one agent's tools to the plugin's local socket: hello with the agent's key, then numbered calls. Both
// the MCP server (bin/team.ts) and Pi's extension (harness/pi/extension.ts) speak through it.
import { createConnection, type Socket } from "node:net";

export type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
type Said =
  | { type: "welcome"; tools: Tool[] }
  | { type: "refused"; why: string }
  | { type: "result"; id: number; ok: boolean; text: string };

const WELCOME_MS = 10_000;

export class Line {
  private readonly socketPath: string;
  private socket: Socket | null = null;
  private buffered = "";
  private next = 1;
  private readonly waiting = new Map<number, (said: Extract<Said, { type: "result" }>) => void>();
  private greeting: Promise<Tool[]> | null = null;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  /** Connects and says hello once; a dropped connection is opened again on the next call. */
  open(): Promise<Tool[]> {
    this.greeting ??= new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      // An open line never keeps the agent's process alive on its own.
      socket.unref();
      this.socket = socket;
      socket.setEncoding("utf8");
      const timer = setTimeout(() => {
        reject(new Error("the plugin did not answer: is Paseo running with the plugin loaded?"));
      }, WELCOME_MS);
      socket.on("connect", () => socket.write(`${JSON.stringify(helloFromEnv())}\n`));
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

  close(): void {
    this.socket?.destroy();
  }
}

/** Who calls: the agent the plugin gave this environment to, with the key only the plugin can make. */
function helloFromEnv() {
  return {
    type: "hello",
    project: process.env.SEATWORKS_PROJECT,
    actor: process.env.SEATWORKS_ACTOR,
    key: process.env.SEATWORKS_KEY,
  };
}
