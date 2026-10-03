import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ROOT } from "../../shared/contracts/ids.ts";
import type { Attached } from "../../shared/contracts/rpc.ts";
import { useHumanCommand } from "../decide/send.ts";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Tabs } from "../kit/tabs.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { useProjectView } from "../state/project-view.ts";
import { useRepoWorkspace } from "../state/repo-workspace.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { seatsOf } from "../state/team.ts";
import { nameOf, titled } from "../state/words.ts";
import { ProjectAgents } from "./project-agents.tsx";
import { ProjectOverview } from "./project-overview.tsx";
import { ProjectSettings } from "./project-settings.tsx";
import { StandingTag } from "./standing-tag.tsx";

type TabId = "overview" | "agents" | "settings";

type Props = {
  readonly project: Attached;
  /** The template it runs, by its title where it is still installed. */
  readonly template: string | null;
  /** Whether the page has little room across. */
  readonly compact: boolean;
  readonly theme: PluginSurfaceProps["theme"];
  readonly navigation: PluginSurfaceProps["navigation"];
  readonly onBack: () => void;
  /** Opens the Team tab of a workspace. */
  readonly onTeam: (workspaceId: string) => void;
  /** Leads to where what a team left behind is removed. */
  readonly onCleanUp: () => void;
  /** Hears that the project is gone. */
  readonly onRemoved: () => void;
};

/** One project's own page: where its team stands, what its agents run here, and what it is set up with. */
export function ProjectPage(props: Props) {
  const { project, template, compact, theme, navigation, onBack, onTeam, onCleanUp, onRemoved } = props;
  const { view, error, reload } = useProjectView(project.id);
  const agents = useSeatAgents(project.id);
  const workspace = useRepoWorkspace(project.repo);
  const { busy, said, send } = useHumanCommand(project.id);
  const [tab, setTab] = useState<TabId>("overview");
  const human = view?.human ?? null;
  const { foreground, foregroundMuted, statusWarning } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  const seats = human ? seatsOf(human, agents.running) : [];
  const root = human?.root ?? null;
  const chat = root?.owner ? agents.ids[root.owner] : undefined;
  const held = human?.scopes.some((scope) => scope.parent === null && scope.held) ?? false;
  const refresh = () => void reload();
  /** Sends one command of the Human's and reads the project again once the record took it. */
  const act = (type: string, args: Record<string, unknown>) => {
    void send(type, args).then((ok) => {
      if (ok) refresh();
    });
  };
  const lands = view?.base ? (human?.remote ? `${view.base} → ${human.remote}` : view.base) : null;

  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the projects"
          hitSlop={8}
          onPress={onBack}
          style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs, alignSelf: "flex-start" }}
        >
          <Icon name="ChevronLeft" size={14} color={foregroundMuted} />
          <Text style={small}>Projects</Text>
        </Pressable>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}>
          <Text style={{ fontSize: FONT.title, fontWeight: "600", color: foreground }} numberOfLines={1}>
            {nameOf(project.repo)}
          </Text>
          {template ? <Tag label={template} theme={theme} /> : null}
          {view && human ? <StandingTag view={view} human={human} seats={seats} theme={theme} /> : null}
          <View style={{ flex: 1 }} />
          {root && chat && navigation ? (
            <Button
              label={`${titled(root.role)}'s chat`}
              theme={theme}
              onPress={() => {
                navigation.openAgent({ agentId: chat });
              }}
            />
          ) : null}
          {workspace ? (
            <Button
              label="Show the team"
              theme={theme}
              onPress={() => {
                onTeam(workspace);
              }}
            />
          ) : null}
          {human ? (
            <Button
              label={held ? "Resume" : "Hold"}
              tone="quiet"
              theme={theme}
              disabled={busy}
              onPress={() => {
                act(held ? "resume_scope" : "hold_scope", {
                  scope: ROOT,
                  reason: `${held ? "resumed" : "held"} by the Human`,
                });
              }}
            />
          ) : null}
        </View>
        <Text style={small} numberOfLines={1}>
          {[project.repo, ...(lands ? [lands] : [])].join(" · ")}
        </Text>
        <Tabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "agents", label: "Agents" },
            { id: "settings", label: "Settings" },
          ]}
          active={tab}
          theme={theme}
          onPick={setTab}
        />
      </View>
      {error ? (
        <Banner tone="danger" text={`Seatworks did not answer: ${error}`} theme={theme} onPress={refresh} />
      ) : null}
      {view?.alarm ? <Banner tone="danger" text={view.alarm} theme={theme} /> : null}
      {root && root.owner === null ? (
        <Banner
          tone="danger"
          text={`Nobody is seated as ${titled(root.role)}${view?.rootGone ? `: ${view.rootGone}` : ""}`}
          theme={theme}
        >
          <Button
            label="Seat it again"
            tone="accent"
            theme={theme}
            disabled={busy}
            onPress={() => {
              act("reseat", { scope: ROOT, reason: "seated again by the Human" });
            }}
          />
        </Banner>
      ) : null}
      {said && !said.ok ? <Text style={[small, { color: statusWarning }]}>{said.text}</Text> : null}
      {tab === "agents" ? <ProjectAgents project={project.id} compact={compact} theme={theme} /> : null}
      {tab !== "agents" && (!view || !human) ? (
        <Text style={small}>{error ? "" : (view?.root ?? "Reading the project.")}</Text>
      ) : null}
      {tab === "overview" && view && human ? (
        <ProjectOverview
          project={project.id}
          view={view}
          human={human}
          seats={seats}
          compact={compact}
          theme={theme}
          onSeat={(seat) => {
            const agentId = seat.owner === null ? undefined : agents.ids[seat.owner];
            return agentId && navigation
              ? () => {
                  navigation.openAgent({ agentId });
                }
              : undefined;
          }}
          onAnswered={refresh}
        />
      ) : null}
      {tab === "settings" && view && human ? (
        <ProjectSettings
          project={project.id}
          view={view}
          human={human}
          template={template}
          theme={theme}
          onReload={refresh}
          onCleanUp={onCleanUp}
          onRemoved={onRemoved}
        />
      ) : null}
    </View>
  );
}
