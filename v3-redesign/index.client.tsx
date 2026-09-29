import type { PluginClientContext } from "@getpaseo/plugin/client";
import { JevSettings } from "./client/jev-settings.tsx";
import { Surface } from "./client/surface.tsx";
import { RPC } from "./shared/contracts/rpc.ts";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSurface("main", Surface),
    client.addSettingsScreen({ id: "jev", title: "Jev", icon: "KeyRound", Component: JevSettings }),
    client.addSidebarItem({ id: "seatworks", title: "Seatworks", icon: "Users", surface: "main" }),
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
    for (const cleanup of cleanups) void cleanup();
  };
}
