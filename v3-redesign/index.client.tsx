import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Surface } from "./client/surface.tsx";
import { RPC } from "./shared/contracts/rpc.ts";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSurface("main", Surface),
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
