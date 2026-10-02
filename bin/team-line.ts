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
/** How long a line waits before each further try for a plugin that is not listening: just started, or loaded again. */
const WAITS_MS = [100, 400, 1_500];
/** How many times a call is sent over a line that dropped before its answer came, with the same call id each time. */
const TRIES = 3;
const DROPPED = { ok: false, text: "The connection to the plugin dropped; call again." };
/** What a hello came to: the agent's tools, the plugin's refusal, or no plugin there to answer. */
type Greeted = { tools: Tool[] } | { refused: string } | { away: string };

export class Line {
  private readonly socketPath: string;
  private socket: Socket | null = null;
  private buffered = "";
  private next = 1;
  /** Calls sent and not yet answered; a drop answers each with null. */
  private readonly waiting = new Map<number, (said: Extract<Said, { type: "result" }> | null) => void>();
  private opening: Promise<Tool[]> | null = null;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  /** Connects and says hello once, waiting a little for a plugin not yet listening; a dropped line opens again. */
  open(): Promise<Tool[]> {
    this.opening ??= this.reach().catch((error: unknown) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }

  /** The agent's tools once the plugin answers; its refusal is an answer and ends the tries. */
  private async reach(): Promise<Tool[]> {
    let away = "";
    for (const wait of [0, ...WAITS_MS]) {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const greeted = await this.hello();
      if ("tools" in greeted) return greeted.tools;
      if ("refused" in greeted) throw new Error(greeted.refused);
      away = greeted.away;
    }
    throw new Error(`The plugin is not answering (${away}): is Paseo running with the plugin loaded?`);
  }

  private hello(): Promise<Greeted> {
    return new Promise((resolve) => {
      const socket = createConnection(this.socketPath);
      // An open line never keeps the agent's process alive on its own.
      socket.unref();
      this.socket = socket;
      this.buffered = "";
      socket.setEncoding("utf8");
      const timer = setTimeout(() => {
        resolve({ away: "it took the connection and said nothing" });
        socket.destroy();
      }, WELCOME_MS);
      socket.on("connect", () => socket.write(`${JSON.stringify(helloFromEnv())}\n`));
      socket.on("data", (chunk: string) => {
        this.buffered += chunk;
        for (let nl = this.buffered.indexOf("\n"); nl >= 0; nl = this.buffered.indexOf("\n")) {
          const said = JSON.parse(this.buffered.slice(0, nl)) as Said;
          this.buffered = this.buffered.slice(nl + 1);
          if (said.type === "welcome") {
            clearTimeout(timer);
            resolve({ tools: said.tools });
          } else if (said.type === "refused") {
            clearTimeout(timer);
            resolve({ refused: said.why });
            socket.destroy();
          } else {
            this.waiting.get(said.id)?.(said);
            this.waiting.delete(said.id);
          }
        }
      });
      socket.on("error", (error) => {
        resolve({ away: error.message });
      });
      socket.on("close", () => {
        clearTimeout(timer);
        resolve({ away: "it closed the connection" });
        if (this.socket !== socket) return;
        this.socket = null;
        this.opening = null;
        for (const answer of this.waiting.values()) answer(null);
        this.waiting.clear();
      });
    });
  }

  /** Sends a call and waits; a dropped line is opened again and the call resent under its id, so it is taken once. */
  async call(name: string, args: unknown): Promise<{ ok: boolean; text: string }> {
    const call = randomUUID();
    for (let tried = 0; tried < TRIES; tried++) {
      const unreached = await this.open().then(
        () => null,
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      // Before anything was sent the plugin's own words are the answer; after, the call may have been taken.
      if (unreached !== null) return tried === 0 ? { ok: false, text: `${unreached} Nothing was recorded.` } : DROPPED;
      const id = this.next++;
      const said = await new Promise<Extract<Said, { type: "result" }> | null>((resolve) => {
        // A line that dropped since it was opened has nobody to answer: the call goes on the next one.
        if (!this.socket) {
          resolve(null);
          return;
        }
        this.waiting.set(id, resolve);
        this.socket.write(`${JSON.stringify({ type: "call", id, call, name, args })}\n`);
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
