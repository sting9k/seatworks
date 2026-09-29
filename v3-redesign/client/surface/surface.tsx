import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { SPACE } from "../kit/theme.ts";
import { type Attached, Home, type Offered } from "./home.tsx";
import { PluginPage } from "./plugin-page.tsx";
import { ProjectPage } from "./project-page.tsx";

type Page = { name: "home" } | { name: "project"; id: string } | { name: "plugin" };

/** Seatworks' page in Paseo's sidebar: its projects, each project's team, and the plugin on this machine. */
export function Surface({ theme, layout, navigation }: PluginSurfaceProps) {
  const listProjects = useRpc(RPC.projects);
  const attach = useRpc(RPC.openProject);
  const toast = useToast();
  const [page, setPage] = useState<Page>({ name: "home" });
  const [projects, setProjects] = useState<readonly Attached[]>([]);
  const [unattached, setUnattached] = useState<readonly Offered[]>([]);
  const [attaching, setAttaching] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const listed = await listProjects({});
    setProjects(listed.projects);
    setUnattached(listed.unattached);
  }, [listProjects]);
  useEffect(() => {
    void refresh();
  }, [refresh, page]);

  const frame = (children: ReactNode) => (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? SPACE.md : SPACE.xl, alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 720, gap: SPACE.lg }}>{children}</View>
    </ScrollView>
  );

  if (page.name === "plugin")
    return frame(
      <PluginPage
        theme={theme}
        onBack={() => {
          setPage({ name: "home" });
        }}
        onCleaned={() => void refresh()}
      />,
    );
  const here = page.name === "project" ? projects.find((p) => p.id === page.id) : undefined;
  if (here)
    return frame(
      <ProjectPage
        project={here.id}
        repo={here.repo}
        theme={theme}
        navigation={navigation}
        onBack={() => {
          setPage({ name: "home" });
        }}
      />,
    );
  return frame(
    <Home
      projects={projects}
      unattached={unattached}
      attaching={attaching}
      theme={theme}
      onProject={(id) => {
        setPage({ name: "project", id });
      }}
      onPlugin={() => {
        setPage({ name: "plugin" });
      }}
      onAttach={(root) => {
        setAttaching(root);
        void attach({ cwd: root })
          .then((r) => {
            toast.show(r.text, { variant: r.ok ? "success" : "warning" });
            if (r.ok) setPage({ name: "project", id: r.project });
          })
          .finally(() => {
            setAttaching(null);
            void refresh();
          });
      }}
    />,
  );
}
