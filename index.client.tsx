import type { PluginAgentCommandContext, PluginClientContext } from "@getpaseo/plugin/client";
import { pageOf } from "./client/page/page.tsx";
import { addTeamButtons } from "./client/pill/buttons.tsx";
import { teamPanel } from "./client/team/team-panel.tsx";
import { PROJECT_LABEL, ROOT } from "./shared/contracts/ids.ts";
import { RPC } from "./shared/contracts/rpc.ts";

/** The project a chat's agent belongs to; a chat of no team says so, which Paseo shows. */
function teamOf(ctx: PluginAgentCommandContext): string {
  const project = ctx.agent.labels[PROJECT_LABEL];
  if (!project) throw new Error("This chat is not one of a Seatworks team.");
  return project;
}

/** Holds or resumes the whole team from a chat's command line, as the pill's quick action does. */
const holding = (type: "hold_scope" | "resume_scope") => async (ctx: PluginAgentCommandContext) => {
  const reason = `${type === "hold_scope" ? "held" : "resumed"} by the Human`;
  const reply = await ctx.rpc(RPC.human, { project: teamOf(ctx), type, args: { scope: ROOT, reason } });
  if (!reply.ok) throw new Error(reply.text);
};

/** Seatworks plugs into Paseo's own places: a page in the sidebar, a Team tab, a pill and a button on a team's chats. */
export default function contribute(client: PluginClientContext) {
  const buttons = addTeamButtons(client);
  const cleanups = [
    client.addSurface("main", pageOf(client)),
    client.addSidebarItem({ id: "seatworks", title: "Seatworks", icon: "Users", surface: "main" }),
    client.addWorkspacePanel({
      id: "team",
      title: "Team",
      icon: "Network",
      context: "workspace",
      locations: ["explorer", "workspace"],
      Component: teamPanel(client),
    }),
    client.addSlashCommand({
      name: "team",
      description: "Show the team",
      argumentHint: "",
      context: "agent",
      onSubmit(ctx) {
        teamOf(ctx);
        ctx.openPanel("team", { location: "explorer" });
      },
    }),
    client.addSlashCommand({
      name: "team-hold",
      description: "Hold the team: no new seats, nothing lands",
      argumentHint: "",
      context: "agent",
      onSubmit: holding("hold_scope"),
    }),
    client.addSlashCommand({
      name: "team-resume",
      description: "Resume a held team",
      argumentHint: "",
      context: "agent",
      onSubmit: holding("resume_scope"),
    }),
    client.addCommandCenterItem({
      id: "open-team",
      title: "Open a Seatworks team here",
      icon: "Users",
      context: "workspace",
      async onSelect(ctx) {
        const opened = await ctx.rpc(RPC.openProject, { cwd: ctx.workspace.projectRootPath });
        if (opened.project) ctx.openSurface("main");
        // Paseo shows what a command center item throws, and gives it no other way to speak.
        if (!opened.ok) throw new Error(opened.text);
      },
    }),
  ];
  return () => {
    buttons();
    for (const cleanup of cleanups) void cleanup();
  };
}
