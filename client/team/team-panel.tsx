import type { PluginClientContext, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { Waiting } from "../decide/waiting.tsx";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Meter } from "../kit/meter.tsx";
import { Tabs } from "../kit/tabs.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { seatsOf, waitingOf } from "../state/team.ts";
import { Record } from "./record.tsx";
import { Tree } from "./tree.tsx";

type TabId = "team" | "needs" | "record";

/** Seatworks' tab beside Files and Changes, and a tab of the workspace: the whole team, what needs the Human, the record. */
export function teamPanel(client: Pick<PluginClientContext, "openSurface">) {
  return function TeamPanel({ workspaceId, theme, navigation }: PluginWorkspacePanelProps) {
    const root = useWorkspace(workspaceId, (w) => w.projectRootPath);
    const find = useRpc(RPC.projectAt);
    const [project, setProject] = useState<string | null | undefined>(undefined);
    const [problem, setProblem] = useState<string | null>(null);
    useEffect(() => {
      if (root)
        void find({ dir: root }).then(
          (found) => {
            setProject(found.project);
            setProblem(null);
          },
          (failed: unknown) => {
            setProblem(problemText(failed));
          },
        );
    }, [root, find]);
    const { view, error, reload } = useProjectView(project ?? null);
    const agents = useSeatAgents(project ?? null);
    const [picked, setPicked] = useState<TabId | null>(null);
    const [facts, setFacts] = useState(false);
    const human = view?.human ?? null;
    const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
    const page = () => {
      client.openSurface("main");
    };

    if (project === null)
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: SPACE.lg }}>
          <Icon name="Users" size={24} color={theme.colors.foregroundMuted} />
          <Text style={{ fontSize: FONT.base, fontWeight: "500", color: theme.colors.foreground }}>
            No team here yet
          </Text>
          <Button label="Open Seatworks" theme={theme} onPress={page} />
        </View>
      );
    if (!project || !view || !human)
      return (
        <View style={{ padding: SPACE.lg }}>
          <Text style={[muted, problem || error ? { color: theme.colors.statusWarning } : null]}>
            {problem || error
              ? `Seatworks did not answer: ${problem ?? error ?? ""}`
              : (view?.root ?? "Reading the team.")}
          </Text>
        </View>
      );

    const waiting = waitingOf(human);
    const tab = picked ?? (waiting > 0 ? "needs" : "team");
    const template = view.template;
    const drifted = template !== null && (template.state !== "current" || template.edited);
    const open = (owner: string) => {
      const agentId = agents.ids[owner];
      return agentId && navigation
        ? () => {
            navigation.openAgent({ agentId });
          }
        : undefined;
    };
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SPACE.md }}>
        <View style={{ flexGrow: 1, width: "100%", maxWidth: 720, alignSelf: "center", gap: SPACE.md }}>
          <Tabs
            tabs={[
              { id: "team", label: "Team" },
              { id: "needs", label: waiting > 0 ? `Needs you · ${waiting}` : "Needs you" },
              { id: "record", label: "Record" },
            ]}
            active={tab}
            theme={theme}
            onPick={setPicked}
          />
          {view.alarm ? <Banner tone="danger" text={view.alarm} theme={theme} /> : null}
          {view.stuck.length > 0 ? (
            <Banner
              tone="danger"
              text={`${view.stuck.length} stuck`}
              theme={theme}
              onPress={() => {
                setFacts(!facts);
              }}
            />
          ) : null}
          {facts
            ? view.stuck.map((fact) => (
                <Text key={fact} style={muted}>
                  {fact}
                </Text>
              ))
            : null}
          {drifted ? (
            <Banner
              tone="warning"
              text={
                template.state === "uninstalled"
                  ? `${template.name} is no longer installed`
                  : template.edited
                    ? `${template.name} was changed by hand in this project`
                    : `${template.name} changed since this project took it`
              }
              theme={theme}
              onPress={page}
            />
          ) : null}
          {tab === "team" ? <Tree seats={seatsOf(human, agents.running)} theme={theme} onOpen={open} /> : null}
          {tab === "needs" ? (
            waiting > 0 ? (
              <Waiting project={project} human={human} theme={theme} onAnswered={() => void reload()} />
            ) : (
              <Text style={[muted, { paddingHorizontal: SPACE.sm }]}>Nothing waits on you.</Text>
            )
          ) : null}
          {tab === "record" ? <Record view={view} theme={theme} /> : null}
          <View style={{ flexGrow: 1 }} />
          <View style={{ paddingHorizontal: SPACE.xs }}>
            <Meter usd={human.spent.usd} of={human.spent.appetiteUsd} theme={theme} />
          </View>
        </View>
      </ScrollView>
    );
  };
}
