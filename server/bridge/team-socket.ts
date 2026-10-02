import { rmSync } from "node:fs";
import { type Server, type Socket, createServer } from "node:net";
import { type Command, parseBody } from "../../shared/contracts/commands.ts";
import { READS, type ReadName, type ToolSpec, toolsFor } from "../../shared/contracts/tools.ts";
import type { Keys } from "../core/keys.ts";
import { daemonLog } from "../core/logger.ts";
import type { Submitted } from "./project.ts";
import type { State } from "../../shared/kernel/state.ts";
import type { Refusal } from "../../shared/kernel/decide/context.ts";

/** What the socket needs of a project: its state, a way to submit, and the reads that go past the state. */
export type ProjectPort = {
  readonly view: State;
  submit(command: Command): Promise<Submitted>;
  /** The sections a report has in the project's profile, as an agent is shown them. */
  readonly report: ReadonlyMap<string, string>;
  /** The tools a seated actor's role names; none for a role the profile no longer has; null when it is not seated. */
  roleTools(actor: string): ReadonlySet<string> | null;
  /** A seated actor's role, when the project's profile no longer has it. */
  roleGone(actor: string): string | null;
  read(actor: string, name: ReadName, args: unknown): Promise<string>;
};

/** A line longer than this is a broken client, not a tool call: the connection is closed rather than buffered. */
const MAX_LINE = 1024 * 1024;

/** Where each agent's tool server reaches the bridge; the caller is the agent its key belongs to, never an argument. */
export class TeamSocket {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly path: string;
  private readonly keys: Keys;
  private readonly projects: (id: string) => ProjectPort | undefined;
  private readonly now: () => Date;

  constructor(
    path: string,
    keys: Keys,
    projects: (id: string) => ProjectPort | undefined,
    now: () => Date = () => new Date(),
  ) {
    this.path = path;
    this.keys = keys;
    this.projects = projects;
    this.now = now;
    this.server = createServer((socket) => {
      this.serve(socket);
    });
  }

  listen(): Promise<void> {
    if (process.platform !== "win32") rmSync(this.path, { force: true });
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.path, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    return new Promise((resolve) =>
      this.server.close(() => {
        resolve();
      }),
    );
  }

  private serve(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding("utf8");
    let buffered = "";
    let who: { project: ProjectPort; actor: string } | null = null;
    const write = (message: unknown) => socket.write(`${JSON.stringify(message)}\n`);
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      buffered += chunk;
      if (buffered.length > MAX_LINE) {
        socket.destroy();
        return;
      }
      for (let nl = buffered.indexOf("\n"); nl >= 0; nl = buffered.indexOf("\n")) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        let message: { type?: unknown; [k: string]: unknown };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          // A line that is not JSON is dropped: the client is not ours or is broken, and asked nothing we can answer.
          continue;
        }
        if (message.type === "hello") {
          const project = typeof message.project === "string" ? this.projects(message.project) : undefined;
          const actor = typeof message.actor === "string" ? message.actor : "";
          const key = typeof message.key === "string" ? message.key : "";
          const tools = project?.roleTools(actor);
          if (!project || !tools || !this.keys.holds(String(message.project), actor, key)) {
            write({ type: "refused", why: "this tool server's key does not belong to a seated agent" });
            continue;
          }
          who = { project, actor };
          const shown = toolsFor(new Set([...tools, ...Object.keys(READS)]), project.report);
          write({ type: "welcome", tools: shown satisfies ToolSpec[] });
        } else if (message.type === "call" && who) {
          const id = message.id;
          const call = typeof message.call === "string" && message.call.length <= 100 ? message.call : null;
          if (call === null) {
            write({
              type: "result",
              id,
              ok: false,
              text: "A call carries an id of its own, of at most 100 characters.",
            });
            continue;
          }
          void this.call(who, call, String(message.name), message.args).then(
            (reply) => write({ type: "result", id, ...reply }),
            (error: unknown) => {
              daemonLog.error(`tool ${String(message.name)} for ${who?.actor ?? "?"} failed`, error);
              write({
                type: "result",
                id,
                ok: false,
                text: "The call failed inside the plugin; it is in Paseo's daemon log.",
              });
            },
          );
        }
      }
    });
  }

  /** One tool call; its command id comes from the call's own id, so the same call sent again is one command. */
  private async call(
    who: { project: ProjectPort; actor: string },
    call: string,
    name: string,
    args: unknown,
  ): Promise<{ ok: boolean; text: string }> {
    if (Object.hasOwn(READS, name))
      return { ok: true, text: await who.project.read(who.actor, name as ReadName, args ?? {}) };
    const tools = who.project.roleTools(who.actor);
    const gone = who.project.roleGone(who.actor);
    if (gone !== null)
      return {
        ok: false,
        text: `Your role, ${gone}, is no longer in this project's profile, so none of its tools can be given to you. The Human sees this; go on with what needs no tool, or wait for them.`,
      };
    if (!tools?.has(name)) return { ok: false, text: `You are not given ${name}.` };
    const parsed = parseBody(name, args ?? {});
    if (!parsed.ok) return { ok: false, text: `The arguments do not fit ${name}: ${parsed.says}` };
    const outcome = await who.project.submit({
      id: `tool:${who.actor}:${call}`,
      at: this.now().toISOString(),
      caller: { kind: "agent", actor: who.actor },
      body: parsed.body,
    });
    return outcome.ok
      ? { ok: true, text: recorded(outcome.events) }
      : { ok: false, text: refusedText(outcome.refused, outcome.standing) };
  }
}

function recorded(events: readonly { type: string; [k: string]: unknown }[]): string {
  if (events.length === 0) return "Nothing changed.";
  return `Recorded: ${events.map((e) => e.type.replace(/_/g, " ")).join("; ")}.`;
}

function refusedText(r: Refusal, standing: readonly string[]): string {
  const which = r.invariant.startsWith("I") ? ` (${r.invariant})` : "";
  const shows = standing.length > 0 ? `\nWhat the record shows:\n${standing.map((l) => `- ${l}`).join("\n")}` : "";
  return `Refused${which}: ${r.says}${shows}`;
}
