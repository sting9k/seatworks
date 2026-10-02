import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { DisclosureList } from "../kit/disclosure.tsx";
import { Dot, toneColor } from "../kit/mark.tsx";
import { FONT, SPACE, pressState } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { scopeState, scopeTone, waitingOf } from "../surface/project-page.tsx";

/** Seatworks' tab beside Files and Changes: the team at a glance, a line a scope under the root, each opening to its seat's chat. */
export function TeamPanel({ workspaceId, theme, layout, navigation }: PluginWorkspacePanelProps) {
  const root = useWorkspace(workspaceId, (w) => w.projectRootPath);
  const find = useRpc(RPC.projectAt);
  const [project, setProject] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (root)
      void find({ dir: root }).then(
        (r) => {
          setProject(r.project);
          setProblem(null);
        },
        (failed: unknown) => {
          setProblem(problemText(failed));
        },
      );
  }, [root, find]);
  const { view, error } = useProjectView(project ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: SPACE.xs };
  const human = view?.human ?? null;
  const agents = useSeatAgents(project ?? null);
  const openAgent = (actor: string | null) => {
    const agentId = actor ? agents[actor] : undefined;
    return agentId && navigation
      ? () => {
          navigation.openAgent({ agentId });
        }
      : undefined;
  };
  const waiting = waitingOf(human);
  const toRoot = openAgent(human?.root?.owner ?? null);

  return (
    <ScrollView contentContainerStyle={{ padding: layout.compact ? SPACE.lg : SPACE.md, gap: SPACE.md }}>
      {problem || (error && !view) ? (
        <Text style={[muted, { color: theme.colors.statusWarning }]}>Seatworks did not answer: {problem ?? error}</Text>
      ) : null}
      {project === undefined && !problem ? <Text style={muted}>Reading the team.</Text> : null}
      {project === null ? (
        <Text style={muted}>This project has no Seatworks team. Attach it from the Seatworks page.</Text>
      ) : null}
      {project && !human ? <Text style={muted}>{view?.root ?? "Reading the team."}</Text> : null}
      {human ? (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={!toRoot}
            onPress={toRoot}
            style={({ pressed }) => [
              { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.xs },
              pressState(false, pressed && Boolean(toRoot)),
            ]}
          >
            <Dot tone={waiting > 0 ? "you" : "work"} theme={theme} />
            <Text style={{ flex: 1, fontSize: FONT.small, color: theme.colors.foreground }}>
              {waiting > 0 ? `${waiting} need${waiting === 1 ? "s" : ""} you` : "Nothing waits on you"}
            </Text>
            <Text style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted }}>
              ${human.spent.usd.toFixed(2)}
            </Text>
          </Pressable>
          {human.scopes.length > 0 ? (
            <DisclosureList
              theme={theme}
              compact
              open={open}
              onOpen={setOpen}
              items={human.scopes.map((scope) => {
                const tone = scopeTone(scope);
                const toOwner = openAgent(scope.owner);
                return {
                  id: scope.scope,
                  title: `${scope.scope} ${scope.goal ?? ""}`.trim(),
                  dimmed: tone === "off",
                  leading: <Dot tone={tone} theme={theme} />,
                  trailing: (
                    <Text style={{ fontSize: FONT.small, color: toneColor(theme, tone) }}>{scopeState(scope)}</Text>
                  ),
                  body: (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!toOwner}
                      onPress={toOwner}
                      style={({ pressed }) => pressState(false, pressed && Boolean(toOwner))}
                    >
                      <Text style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted }}>
                        {scope.role} · {scope.owner ?? "nobody seated"}
                        {toOwner ? " · open its chat" : ""}
                      </Text>
                    </Pressable>
                  ),
                };
              })}
            />
          ) : (
            <View style={{ paddingHorizontal: SPACE.xs }}>
              <Text style={muted}>No scope is open under the root.</Text>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}
