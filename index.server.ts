import type { PluginServerContext } from "@getpaseo/plugin/server";
import { HUMAN_COMMANDS, type CommandType, parseBody } from "./shared/contracts/commands.ts";
import { RPC } from "./shared/contracts/rpc.ts";
import { reflexSettings } from "./shared/contracts/settings.ts";
import { PLUGIN_ID, Plugin } from "./server/bridge/plugin.ts";
import { checkUpdate } from "./server/bridge/update-check.ts";
import { daemonLog } from "./server/core/logger.ts";
import { stateRoot } from "./server/core/paths.ts";
import { permissionText } from "./server/satellites/agent-host/host.ts";
import { git } from "./server/satellites/workspace/git.ts";

export default function contribute(server: PluginServerContext) {
  const plugin = new Plugin(stateRoot());
  const settings = server.registerSettings(reflexSettings);
  const useSettings = (state: Awaited<ReturnType<typeof settings.read>>) => {
    if (state.status === "ready") plugin.setReflex(state.values.route, state.values.key);
  };
  void settings.read().then(useSettings);
  const stopSettings = settings.subscribe(useSettings);
  const guard = (what: string, work: () => Promise<unknown>) => {
    void work().catch((error: unknown) => {
      daemonLog.error(`seatworks: ${what} failed`, error);
    });
  };

  server.on("agent.turn_ended", (event, { paseo }) => {
    plugin.saw(paseo);
    const outcome =
      event.outcome.kind === "failed" ? { kind: "failed", error: event.outcome.error } : { kind: event.outcome.kind };
    guard("a turn's end", () => plugin.turnEnded(event.agent.id, outcome, event.timeline));
  });
  server.on("agent.permission_requested", (event, { paseo }) => {
    plugin.saw(paseo);
    const r = event.request;
    guard("a permission", () => plugin.permissionAsked(event.agent.id, r.id, permissionText(r)));
  });
  server.on("agent.permission_resolved", (event, { paseo }) => {
    plugin.saw(paseo);
    const allow = event.resolution.behavior === "allow";
    guard("a resolved permission", () => plugin.permissionResolved(event.agent.id, event.requestId, allow));
  });
  server.on("agent.archived", (event, { paseo }) => {
    plugin.saw(paseo);
    guard("an archived agent", () => plugin.archived(event.agent.id));
  });
  server.on("agent.created", (_event, { paseo }) => {
    plugin.saw(paseo);
  });
  server.before("agent.session_open", async ({ request }, { paseo }) => {
    plugin.saw(paseo);
    const env = await plugin.envFor(request.agentId, request.provider);
    return env ? { ...request, env: { ...request.env, ...env } } : undefined;
  });

  server.handle(RPC.openProject, async (input, { paseo }) => {
    plugin.saw(paseo);
    const inside = await git(input.cwd, ["rev-parse", "--is-inside-work-tree"]);
    if (inside.stdout.trim() !== "true")
      return { project: "", ok: false, text: `${input.cwd} is not a git repository, and a team works on one.` };
    const named = input.profile;
    if (named !== undefined && !(await plugin.profiles()).some((profile) => profile.name === named))
      return { project: "", ok: false, text: `No profile named ${named} is installed.` };
    const { project, outcome, note } = await plugin.openProject(input.cwd, input.base, input.profile);
    const said = [outcome.ok ? `Project ${project} is open.` : outcome.refused.says, note].filter(Boolean).join(" ");
    return { project, ok: outcome.ok, text: said };
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
  server.handle(RPC.projects, async (_input, { paseo }) => {
    plugin.saw(paseo);
    return { projects: plugin.projects(), unattached: await plugin.unattached(), profiles: await plugin.profiles() };
  });
  server.handle(RPC.leftovers, async (_input, { paseo }) => {
    plugin.saw(paseo);
    return { leftovers: await plugin.leftovers() };
  });
  server.handle(RPC.clean, async (input, { paseo }) => {
    plugin.saw(paseo);
    return { results: await plugin.clean(input.ids) };
  });
  server.handle(RPC.templateOffer, async (input, { paseo }) => {
    plugin.saw(paseo);
    const read = await plugin.template(input.path, null);
    return read.ok
      ? { ok: true, text: "", offer: read.offer }
      : { ok: false, text: `Not a template to install: ${read.says}.`, offer: null };
  });
  server.handle(RPC.installTemplate, async (input, { paseo }) => {
    plugin.saw(paseo);
    const made = await plugin.template(input.path, { hash: input.hash, agents: input.agents });
    return made.ok
      ? { ok: true, text: `${made.offer.title} is installed as ${made.offer.name}. Attach a project to run it.` }
      : { ok: false, text: `Not installed: ${made.says}.` };
  });
  server.handle(RPC.checkUpdate, () => checkUpdate(PLUGIN_ID));
  server.handle(RPC.view, async (input, { paseo }) => {
    plugin.saw(paseo);
    const view = await plugin.view(input.project);
    return { ...(view ?? { human: null, activity: [], stuck: [], root: "No such project." }), alarm: plugin.alarm };
  });
  server.handle(RPC.projectAt, (input) => ({ project: plugin.projectAt(input.dir) }));
  server.handle(RPC.record, async (input, { paseo }) => {
    plugin.saw(paseo);
    const record = await plugin.record(input.project, input.finding);
    return { text: record ? JSON.stringify(record, null, 2) : "No such project." };
  });
  server.handle(RPC.status, (input, { paseo }) => {
    plugin.saw(paseo);
    return { text: plugin.statusOf(input.project, input.scope) ?? "No such project or scope is open." };
  });

  return () => {
    void stopSettings();
    guard("stopping", () => plugin.dispose());
  };
}
