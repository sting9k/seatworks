import type { PluginClientContext } from "@getpaseo/plugin/client";
import { JevSettings } from "./client/jev-settings.tsx";
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
    client.addSettingsScreen({ id: "jev", title: "Jev", icon: "KeyRound", Component: JevSettings }),
    client.addCommandCenterItem({
      id: "open-team",
      title: "Open a Seatworks team here",
      icon: "Users",
      context: "workspace",
      onSelect(ctx) {
        void ctx.rpc(RPC.openProject, { cwd: ctx.workspace.projectRootPath }).then(() => {
          ctx.openSurface("main");
        });
      },
    }),
  ];
  return () => {
    pills();
    for (const cleanup of cleanups) void cleanup();
  };
}
