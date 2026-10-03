import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type ProjectAgent, RPC } from "../../shared/contracts/rpc.ts";
import { type OwnRuns, laidOver } from "../../shared/contracts/runs.ts";
import { Card } from "../kit/card.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useModelsOf } from "../state/provider-models.ts";
import { ownFor } from "../state/runs.ts";
import { AgentHead, AgentLine } from "./agent-line.tsx";
import { AgentPicks, type Columns } from "./agent-picks.tsx";

const COLUMNS: Columns = { provider: 100, model: 140, effort: 90 };
const NARROW: Columns = { provider: 76, model: 96, effort: 72 };
/** How wide the end of a line is: whether it is the project's own, and the way back. */
const STATE = 84;

type Read = { readonly agents: readonly ProjectAgent[]; readonly providers: readonly string[] };

type Props = {
  readonly project: string;
  /** Whether the page has little room across. */
  readonly compact: boolean;
  readonly theme: PluginTheme;
};

/** What each name of a project's template runs in it: the Human's profile as the default, the project's own picked in place. */
export function ProjectAgents({ project, compact, theme }: Props) {
  const ask = useRpc(RPC.projectAgents);
  const [read, setRead] = useState<Read | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Reads what the project runs; with `own`, one name's own is kept first. */
  const load = useCallback(
    async (own?: { agent: string; runs: OwnRuns | null }) => {
      setBusy(true);
      try {
        const answer = await ask({ project, ...(own ? { own } : {}) });
        setSaid(answer.text === "" ? null : answer.text);
        if (answer.ok) setRead({ agents: answer.agents, providers: answer.providers });
      } catch (failed) {
        setSaid(problemText(failed));
      } finally {
        setBusy(false);
      }
    },
    [ask, project],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const running = (read?.agents ?? []).flatMap((agent) => {
    const { provider } = laidOver(agent, agent.own);
    return provider === null ? [] : [provider];
  });
  const { models, problem, read: readModels } = useModelsOf(running);
  const { foregroundMuted, statusDanger } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  const columns = compact ? NARROW : COLUMNS;
  if (!read) return <Text style={[small, { paddingHorizontal: SPACE.xs }]}>{said ?? "Reading what it runs."}</Text>;
  return (
    <>
      {(said ?? problem) ? (
        <Text style={[small, { color: statusDanger, paddingHorizontal: SPACE.xs }]}>{said ?? problem}</Text>
      ) : null}
      <Card theme={theme}>
        <View>
          <AgentHead text="Agent profile" columns={columns} tail={STATE} first theme={theme} />
          {read.agents.map((agent) => {
            const runs = laidOver(agent, agent.own);
            return (
              <AgentLine
                key={agent.name}
                agent={agent}
                compact={compact}
                theme={theme}
                tail={
                  <View style={{ width: STATE, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {agent.own === null ? (
                      <Text style={small}>{agent.there ? "default" : ""}</Text>
                    ) : (
                      <>
                        <Tag label="custom" theme={theme} />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Run ${agent.name} as the default again`}
                          hitSlop={8}
                          disabled={busy}
                          onPress={() => {
                            void load({ agent: agent.name, runs: null });
                          }}
                        >
                          <Icon name="X" size={14} color={foregroundMuted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                }
              >
                {agent.there ? (
                  <AgentPicks
                    name={agent.name}
                    runs={runs}
                    own={{
                      provider: agent.own !== null && "provider" in agent.own,
                      model: agent.own !== null && "model" in agent.own,
                      effort: agent.own !== null,
                    }}
                    providers={read.providers}
                    models={runs.provider === null ? null : (models[runs.provider] ?? null)}
                    read={readModels}
                    columns={columns}
                    theme={theme}
                    busy={busy}
                    onWant={(wanted) => {
                      // Back on the provider of the Human's profile, the name runs that profile again.
                      const back = wanted.provider !== runs.provider && wanted.provider === agent.provider;
                      void load({ agent: agent.name, runs: back ? null : ownFor(agent, wanted) });
                    }}
                  />
                ) : (
                  <Tag label="not in Paseo" tone="warning" theme={theme} />
                )}
              </AgentLine>
            );
          })}
        </View>
      </Card>
      <Text style={[small, { paddingHorizontal: SPACE.xs }]}>
        Outlined is the template&apos;s default, set on the Templates tab. What is picked here is this project&apos;s
        alone, for agents seated from then on.
      </Text>
    </>
  );
}
