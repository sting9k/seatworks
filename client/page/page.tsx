import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { reflexSettings } from "../../shared/contracts/settings.ts";
import { Banner } from "../kit/banner.tsx";
import { type Tab, Tabs } from "../kit/tabs.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { type Step, setupOf } from "../state/setup.ts";
import { ClassifierTab } from "./classifier-tab.tsx";
import { CleanUpTab } from "./clean-up-tab.tsx";
import { type Listed, ProjectsTab } from "./projects-tab.tsx";
import { SetupStrip } from "./setup-strip.tsx";
import { type Matching, TemplatesTab } from "./templates-tab.tsx";
import { UpdatesTab } from "./updates-tab.tsx";

type TabId = "projects" | "templates" | "classifier" | "cleanup" | "updates";

/** The tab each step of setting up is done on. */
const TAB_OF: Readonly<Record<Step["id"], TabId>> = {
  template: "templates",
  agents: "templates",
  classifier: "classifier",
  project: "projects",
};

/** Seatworks' page in Paseo's sidebar: set-up and upkeep, a job a tab. A team is followed in its workspace. */
export function Page({ theme, layout, navigation }: PluginSurfaceProps) {
  const listProjects = useRpc(RPC.projects);
  const askAgents = useRpc(RPC.agents);
  const settings = useSettings(reflexSettings);
  const [picked, setPicked] = useState<TabId | null>(null);
  const [listed, setListed] = useState<Listed | null>(null);
  const [matching, setMatching] = useState<Matching | null>(null);
  const [leftBehind, setLeftBehind] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [projects, agents] = await Promise.all([listProjects({}), askAgents({})]);
      setListed(projects);
      setMatching({ profiles: agents.profiles, available: agents.available });
      setProblem(agents.ok ? null : agents.text);
    } catch (failed) {
      setProblem(problemText(failed));
    }
  }, [listProjects, askAgents]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const changed = () => void refresh();

  const steps =
    listed && matching && settings.status === "ready"
      ? setupOf({
          templates: listed.profiles.length,
          unmatched: matching.profiles.flatMap((profile) => profile.agents).filter((agent) => !agent.there).length,
          classifierSettled: !settings.values.on || settings.values.key !== "",
          projects: listed.projects.length,
        })
      : [];
  const todo = steps.find((step) => !step.done);
  const tab = picked ?? (todo ? TAB_OF[todo.id] : "projects");
  const tabs: Tab<TabId>[] = [
    { id: "projects", label: "Projects" },
    { id: "templates", label: "Templates" },
    { id: "classifier", label: "Classifier" },
    { id: "cleanup", label: leftBehind > 0 ? `Clean up · ${leftBehind}` : "Clean up" },
    { id: "updates", label: "Updates" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? SPACE.md : SPACE.xl, alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 720, gap: 20 }}>
        <View style={{ gap: SPACE.lg }}>
          <Text style={{ fontSize: FONT.title, fontWeight: "600", color: theme.colors.foreground }}>Seatworks</Text>
          {todo ? (
            <SetupStrip
              steps={steps}
              theme={theme}
              onPick={(step) => {
                setPicked(TAB_OF[step]);
              }}
            />
          ) : null}
          <Tabs tabs={tabs} active={tab} theme={theme} onPick={setPicked} />
        </View>
        {problem ? (
          <Banner tone="danger" text={`Seatworks did not answer: ${problem}`} theme={theme} onPress={changed} />
        ) : null}
        {tab === "projects" ? (
          <ProjectsTab
            listed={listed}
            theme={theme}
            navigation={navigation}
            onChanged={changed}
            onTemplates={() => {
              setPicked("templates");
            }}
          />
        ) : null}
        {tab === "templates" ? <TemplatesTab matching={matching} theme={theme} onChanged={changed} /> : null}
        {tab === "classifier" ? <ClassifierTab settings={settings} theme={theme} /> : null}
        {tab === "cleanup" && listed ? (
          <CleanUpTab projects={listed.projects} theme={theme} onCounted={setLeftBehind} onChanged={changed} />
        ) : null}
        {tab === "updates" ? <UpdatesTab theme={theme} /> : null}
      </View>
    </ScrollView>
  );
}
