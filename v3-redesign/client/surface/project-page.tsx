import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { PermissionCard } from "../decide/permission-card.tsx";
import { QuestionCard } from "../decide/question-card.tsx";
import { useHumanCommand } from "../decide/send.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { DisclosureList } from "../kit/disclosure.tsx";
import { PageHeader } from "../kit/header.tsx";
import { Dot, type Tone, toneColor } from "../kit/mark.tsx";
import { type Tab, TabBar } from "../kit/tab-bar.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { useProjectView } from "../state/project-view.ts";
import { nameOf } from "./home.tsx";

type TabId = "needs" | "lanes" | "decided" | "activity";
type Lane = HumanView["lanes"][number];
type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

/** A lane's tone: held waits on its owner above, landed is done, dropped is out of the way. */
export function laneTone(lane: Lane): Tone {
  if (lane.status === "integrated") return "done";
  if (lane.status === "dropped") return "off";
  return lane.held ? "wait" : "work";
}

export const laneState = (lane: Lane) =>
  lane.status === "open" ? (lane.held ? "held" : "at work") : lane.status === "integrated" ? "landed" : "dropped";

/** How many things wait on the Human in a project: what the pill counts and the first tab shows. */
export const waitingOf = (human: HumanView | null) => (human ? human.questions.length + human.permissions.length : 0);

/** One attached project: what waits on the Human, its lanes, what agents decided, and what happened. */
export function ProjectPage({
  project,
  repo,
  theme,
  navigation,
  onBack,
}: {
  project: string;
  repo: string;
  theme: Theme;
  navigation: Navigation;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TabId>("needs");
  const [open, setOpen] = useState<string | null>(null);
  const { view, error, reload } = useProjectView(project);
  const human = view?.human ?? null;
  const agents = view?.agents ?? {};
  const openAgent = (actor: string | null) => {
    const agentId = actor ? agents[actor] : undefined;
    return agentId && navigation
      ? () => {
          navigation.openAgent({ agentId });
        }
      : undefined;
  };
  const toSupervisor = openAgent(human?.supervisor ?? null);
  const waiting = waitingOf(human);
  const tabs: Tab<TabId>[] = [
    { id: "needs", label: waiting > 0 ? `Needs you · ${waiting}` : "Needs you" },
    { id: "lanes", label: human ? `Lanes · ${human.lanes.length}` : "Lanes" },
    { id: "decided", label: "Decided" },
    { id: "activity", label: "Activity" },
  ];
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
  const refresh = () => void reload();

  return (
    <>
      <PageHeader
        title={nameOf(repo)}
        subtitle={repo}
        theme={theme}
        onBack={onBack}
        action={
          toSupervisor ? (
            <Button label="Supervisor's chat" icon="MessageSquare" theme={theme} onPress={toSupervisor} />
          ) : undefined
        }
      />
      <TabBar tabs={tabs} active={tab} theme={theme} onPick={setTab} />
      {error || view?.alarm ? (
        <SettingsCard>
          {error ? <SettingsRow label="Seatworks did not answer" error={error} /> : null}
          {view?.alarm ? <SettingsRow label="Needs your attention" error={view.alarm} /> : null}
        </SettingsCard>
      ) : null}
      {!human ? <Text style={muted}>{view ? view.root : "Reading the project."}</Text> : null}
      {human && tab === "needs" ? (
        <>
          {waiting === 0 ? <Text style={muted}>Nothing waits on you.</Text> : null}
          {human.questions.map((q) => (
            <QuestionCard key={q.id} project={project} question={q} theme={theme} onAnswered={refresh} />
          ))}
          {human.permissions.map((p) => (
            <PermissionCard key={p.id} project={project} permission={p} theme={theme} onAnswered={refresh} />
          ))}
          {human.directions.length > 0 ? (
            <SettingsSection title="Your words not yet carried in">
              <SettingsCard>
                {human.directions.map((d) => (
                  <SettingsRow key={d.message} label={`To ${d.to}`} hint={`${d.message} · owed by ${d.owedBy}`} />
                ))}
              </SettingsCard>
            </SettingsSection>
          ) : null}
          {human.supervisor ? (
            <MessageBox project={project} to={human.supervisor} theme={theme} onSent={refresh} />
          ) : null}
        </>
      ) : null}
      {human && tab === "lanes" ? (
        human.lanes.length > 0 ? (
          <DisclosureList
            theme={theme}
            open={open}
            onOpen={setOpen}
            items={human.lanes.map((lane) => {
              const tone = laneTone(lane);
              const toOwner = openAgent(lane.owner);
              return {
                id: lane.scope,
                title: `${lane.scope} ${lane.goal ?? ""}`.trim(),
                dimmed: tone === "off",
                leading: <Dot tone={tone} theme={theme} />,
                trailing: (
                  <Text style={{ fontSize: FONT.small, color: toneColor(theme, tone) }}>{laneState(lane)}</Text>
                ),
                body: (
                  <View style={{ gap: SPACE.sm }}>
                    <Text style={muted}>
                      {lane.role} · {lane.owner ?? "nobody seated"}
                    </Text>
                    {toOwner ? (
                      <Button label="Open its chat" icon="MessageSquare" theme={theme} onPress={toOwner} />
                    ) : null}
                  </View>
                ),
              };
            })}
          />
        ) : (
          <Text style={muted}>No lane is open.</Text>
        )
      ) : null}
      {human && tab === "decided" ? (
        <>
          <SettingsSection title="Decided by agents, not by you">
            {human.decisions.length > 0 ? (
              <SettingsCard>
                {human.decisions.map((d) => (
                  <SettingsRow key={d.line} label={d.text} hint={`scope ${d.scope} · ${d.by}`} />
                ))}
              </SettingsCard>
            ) : (
              <Text style={muted}>Nothing yet.</Text>
            )}
          </SettingsSection>
          <SettingsSection title="Disagreements still open">
            {human.disagreements.length > 0 ? (
              <SettingsCard>
                {human.disagreements.map((d) => (
                  <SettingsRow
                    key={d.id}
                    label={d.text}
                    hint={[`scope ${d.scope}`, d.raisedBy, d.status, d.reason].filter(Boolean).join(" · ")}
                  />
                ))}
              </SettingsCard>
            ) : (
              <Text style={muted}>None.</Text>
            )}
          </SettingsSection>
        </>
      ) : null}
      {human && tab === "activity" ? (
        <>
          <Spend human={human} theme={theme} />
          <Card theme={theme}>
            <View style={{ padding: SPACE.md, gap: 4 }}>
              {(view?.activity ?? []).length > 0 ? (
                [...(view?.activity ?? [])].reverse().map((line, i) => (
                  <Text key={`${i}-${line}`} style={muted}>
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={muted}>Nothing yet.</Text>
              )}
            </View>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Spend({ human, theme }: { human: HumanView; theme: Theme }) {
  const { usd, tokens, appetiteUsd } = human.spent;
  const over = appetiteUsd !== null && usd > appetiteUsd;
  return (
    <Text style={{ fontSize: FONT.small, color: over ? theme.colors.statusDanger : theme.colors.foregroundMuted }}>
      Spent ${usd.toFixed(2)}
      {appetiteUsd !== null ? ` of an appetite of $${appetiteUsd}` : ""} · {tokens.toLocaleString()} tokens
    </Text>
  );
}

/** Words to the Supervisor, recorded as the Human's message whether typed here or in its chat. */
function MessageBox({ project, to, theme, onSent }: { project: string; to: string; theme: Theme; onSent: () => void }) {
  const [text, setText] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  return (
    <SettingsSection title="To the Supervisor">
      <Card theme={theme}>
        <View style={{ padding: SPACE.md, gap: SPACE.sm }}>
          <TextInput
            style={{
              minHeight: 64,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: RADIUS.control,
              padding: SPACE.sm,
              color: theme.colors.foreground,
              fontSize: FONT.base,
            }}
            value={text}
            onChangeText={setText}
            editable={!busy}
            placeholder="What you want, or a question"
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
            <Text style={{ flex: 1, fontSize: FONT.small, color: theme.colors.foregroundMuted }}>
              {said ? said.text : "It reaches the Supervisor when its turn ends."}
            </Text>
            <Button
              label="Send"
              icon="Send"
              tone="accent"
              theme={theme}
              disabled={busy || text.trim() === ""}
              onPress={() => {
                void send("send_message", { to, text, asks: true }).then((ok) => {
                  if (ok) {
                    setText("");
                    onSent();
                  }
                });
              }}
            />
          </View>
        </View>
      </Card>
    </SettingsSection>
  );
}
