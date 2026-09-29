// The line from one agent's tools to the plugin's local socket: hello with the agent's key, then numbered calls. Both
// the MCP server (bin/team.ts) and Pi's extension (harness/pi/extension.ts) speak through it.
import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";

export type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };
type Said =
  | { type: "welcome"; tools: Tool[] }
  | { type: "refused"; why: string }
  | { type: "result"; id: number; ok: boolean; text: string };

const WELCOME_MS = 10_000;
/** How many times a call is sent over a line that dropped before its answer came, with the same call id each time. */
const TRIES = 3;
const DROPPED = { ok: false, text: "The connection to the plugin dropped; call again." };
const yes = () => true;
const no = () => false;

export class Line {
  private readonly socketPath: string;
  private socket: Socket | null = null;
  private buffered = "";
  private next = 1;
  /** Calls sent and not yet answered; a drop answers each with null. */
  private readonly waiting = new Map<number, (said: Extract<Said, { type: "result" }> | null) => void>();
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
        for (const answer of this.waiting.values()) answer(null);
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

  /**
   * Sends a call and waits for its answer. A line that drops first is opened again and the call sent again with the
   * same call id, which the plugin records as one command, so a call it already took is answered, not taken twice.
   */
  async call(name: string, args: unknown): Promise<{ ok: boolean; text: string }> {
    const call = randomUUID();
    for (let tried = 0; tried < TRIES; tried++) {
      if (tried === 0) await this.open();
      else if (!(await this.open().then(yes, no))) return DROPPED;
      const id = this.next++;
      const said = await new Promise<Extract<Said, { type: "result" }> | null>((resolve) => {
        this.waiting.set(id, resolve);
        this.socket?.write(`${JSON.stringify({ type: "call", id, call, name, args })}\n`);
      });
      if (said) return { ok: said.ok, text: said.text };
    }
    return DROPPED;
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
