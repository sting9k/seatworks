import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ClassifierSettings } from "./client/classifier-settings.tsx";
import { TeamPanel } from "./client/panel/team-panel.tsx";
import { addWaitingPills } from "./client/pill/waiting.tsx";
import { Surface } from "./client/surface/surface.tsx";
import { RPC } from "./shared/contracts/rpc.ts";

/** Seatworks plugs into Paseo's own places: its sidebar page, a tab beside Files and Changes, and pills in chats. */
export default function contribute(client: PluginClientContext) {
  const pills = addWaitingPills(client);
  const cleanups = [
    client.addSurface("main", Surface),
    client.addSidebarItem({ id: "seatworks", title: "Seatworks", icon: "Users", surface: "main" }),
    client.addWorkspacePanel({
      id: "team",
      title: "Team",
      icon: "Network",
      context: "workspace",
      locations: ["explorer"],
      Component: TeamPanel,
    }),
    client.addSettingsScreen({
      id: "classifier",
      title: "Classifier",
      icon: "KeyRound",
      Component: ClassifierSettings,
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
    pills();
    for (const cleanup of cleanups) void cleanup();
  };
}
