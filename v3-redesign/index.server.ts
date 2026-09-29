import type { PluginServerContext } from "@getpaseo/plugin/server";
import { HUMAN_COMMANDS, type CommandType, parseBody } from "./shared/contracts/commands.ts";
import { RPC } from "./shared/contracts/rpc.ts";
import { Plugin } from "./server/bridge/plugin.ts";
import { daemonLog } from "./server/core/logger.ts";
import { stateRoot } from "./server/core/paths.ts";

/** Words a delivery or a first prompt carried: their client message ids are the plugin's effect keys. */
const OURS = /^\d+:/;

export default function contribute(server: PluginServerContext) {
  const plugin = new Plugin(stateRoot());
  const guard = (what: string, work: () => Promise<unknown>) => {
    void work().catch((error: unknown) => {
      daemonLog.error(`seatworks: ${what} failed`, error);
    });
  };

  server.on("agent.turn_ended", (event, { paseo }) => {
    plugin.saw(paseo);
    const typed = event.timeline.flatMap((item) =>
      item.type === "user_message" && item.clientMessageId !== undefined && !OURS.test(item.clientMessageId)
        ? [item.text]
        : [],
    );
    const outcome =
      event.outcome.kind === "failed" ? { kind: "failed", error: event.outcome.error } : { kind: event.outcome.kind };
    guard("a turn's end", () => plugin.turnEnded(event.agent.id, outcome, typed));
  });
  server.on("agent.permission_requested", (event, { paseo }) => {
    plugin.saw(paseo);
    const r = event.request;
    const text = [r.title ?? r.name, r.description, r.input ? JSON.stringify(r.input).slice(0, 2000) : undefined]
      .filter(Boolean)
      .join(" · ");
    guard("a permission", () => plugin.permissionAsked(event.agent.id, r.id, text));
  });
  server.on("agent.archived", (event, { paseo }) => {
    plugin.saw(paseo);
    guard("an archived agent", () => plugin.archived(event.agent.id));
  });
  server.on("agent.created", (_event, { paseo }) => {
    plugin.saw(paseo);
  });
  server.before("agent.session_open", ({ request }, { paseo }) => {
    plugin.saw(paseo);
    const env = plugin.envFor(request.agentId);
    return env ? { ...request, env: { ...request.env, ...env } } : undefined;
  });

  server.handle(RPC.openProject, async (input, { paseo }) => {
    plugin.saw(paseo);
    const { project, outcome } = await plugin.openProject(input.cwd, input.base);
    return { project, ok: outcome.ok, text: outcome.ok ? `Project ${project} is open.` : outcome.refused.says };
  });
  server.handle(RPC.human, async (input, { paseo }) => {
    plugin.saw(paseo);
    if (!HUMAN_COMMANDS.has(input.type as CommandType))
      return { ok: false, text: `The Human does not send ${input.type}.` };
    const parsed = parseBody(input.type, input.args);
    if (!parsed.ok) return { ok: false, text: parsed.says };
    const outcome = await plugin.human(input.project, parsed.body);
    return outcome.ok
      ? { ok: true, text: `Recorded ${outcome.events.length} events.` }
      : { ok: false, text: outcome.refused.says };
  });
  server.handle(RPC.projects, (_input, { paseo }) => {
    plugin.saw(paseo);
    return { projects: plugin.projects() };
  });
  server.handle(RPC.view, async (input, { paseo }) => {
    plugin.saw(paseo);
    const view = await plugin.view(input.project);
    return view ?? { human: null, activity: [], root: "No such project." };
  });
  server.handle(RPC.status, (input, { paseo }) => {
    plugin.saw(paseo);
    return { text: plugin.statusOf(input.project, input.scope) ?? "No such project or scope is open." };
  });

  return () => {
    guard("stopping", () => plugin.dispose());
  };
}
