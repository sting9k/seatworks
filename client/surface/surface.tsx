import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { Home, type Listed } from "./home.tsx";
import { PluginPage } from "./plugin-page.tsx";
import { ProjectPage } from "./project-page.tsx";

type Page = { name: "home" } | { name: "project"; id: string } | { name: "plugin" };

/** Seatworks' page in Paseo's sidebar: its projects, each project's team, and the plugin on this machine. */
export function Surface({ theme, layout, navigation }: PluginSurfaceProps) {
  const listProjects = useRpc(RPC.projects);
  const attach = useRpc(RPC.openProject);
  const toast = useToast();
  const [page, setPage] = useState<Page>({ name: "home" });
  const [listed, setListed] = useState<Listed | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setListed(await listProjects({}));
      setProblem(null);
    } catch (failed) {
      setProblem(problemText(failed));
    }
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
  const here = page.name === "project" ? listed?.projects.find((p) => p.id === page.id) : undefined;
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
      listed={listed}
      problem={problem}
      attaching={attaching}
      theme={theme}
      onProject={(id) => {
        setPage({ name: "project", id });
      }}
      onPlugin={() => {
        setPage({ name: "plugin" });
      }}
      onRetry={() => void refresh()}
      onAttach={(root) => {
        setAttaching(root);
        void attach({ cwd: root })
          .then((r) => {
            toast.show(r.text, { variant: r.ok ? "success" : "warning" });
            if (r.ok) setPage({ name: "project", id: r.project });
          })
          .catch((failed: unknown) => {
            toast.show(problemText(failed), { variant: "error" });
          })
          .finally(() => {
            setAttaching(null);
            void refresh();
          });
      }}
    />,
  );
}
