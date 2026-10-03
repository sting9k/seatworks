import { TextInput } from "@getpaseo/plugin/client/react-native";
import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { ROOT } from "../../shared/contracts/ids.ts";
import { type HumanView, type ProjectTemplate, RPC } from "../../shared/contracts/rpc.ts";
import { AttentionCard } from "../decide/attention-card.tsx";
import { ClaimCard } from "../decide/claim-card.tsx";
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
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { nameOf } from "./home.tsx";

type TabId = "needs" | "scopes" | "decided" | "activity";
type Under = HumanView["scopes"][number];
type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

/** A scope's tone: held or handed back waits on its owner above, landed is done, dropped is out of the way. */
export function scopeTone(scope: Under): Tone {
  if (scope.status === "integrated") return "done";
  if (scope.status === "dropped") return "off";
  return scope.held || scope.status === "handed back" ? "wait" : "work";
}

/** A scope's state, and how much its owner owes when anything is, so an owner that holds up its scope shows early. */
export function scopeState(scope: Under): string {
  const state =
    scope.status === "open"
      ? scope.held
        ? "held"
        : "at work"
      : scope.status === "integrated"
        ? "landed"
        : scope.status;
  return scope.owes > 0 && scope.status !== "dropped" ? `${state} · owes ${scope.owes}` : state;
}

/** The scopes right under the root, which this page lists. */
export const underRoot = (human: HumanView) => human.scopes.filter((scope) => scope.parent === ROOT);

/** How many things wait on the Human in a project: what the pill counts and the first tab shows. */
export const waitingOf = (human: HumanView | null) =>
  human ? human.questions.length + human.permissions.length + human.attentions.length + human.claims.length : 0;

/** One attached project: what waits on the Human, the scopes under its root, what agents decided, and what happened. */
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
  const agents = useSeatAgents(project);
  const openAgent = (actor: string | null) => {
    const agentId = actor ? agents[actor] : undefined;
    return agentId && navigation
      ? () => {
          navigation.openAgent({ agentId });
        }
      : undefined;
  };
  const toRoot = openAgent(human?.root?.owner ?? null);
  const waiting = waitingOf(human);
  const tabs: Tab<TabId>[] = [
    { id: "needs", label: waiting > 0 ? `Needs you · ${waiting}` : "Needs you" },
    { id: "scopes", label: human ? `Scopes · ${underRoot(human).length}` : "Scopes" },
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
          human?.root && toRoot ? (
            <Button label={`${titled(human.root.role)}'s chat`} icon="MessageSquare" theme={theme} onPress={toRoot} />
          ) : undefined
        }
      />
      <TabBar tabs={tabs} active={tab} theme={theme} onPick={setTab} />
      {view?.template ? <TemplateRow project={project} template={view.template} onSynced={refresh} /> : null}
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
          {human.attentions.map((t) => (
            <AttentionCard key={t.id} project={project} attention={t} theme={theme} onAnswered={refresh} />
          ))}
          {human.claims.map((c) => (
            <ClaimCard
              key={`${c.scope}:${c.commit}`}
              project={project}
              claim={c}
              remote={human.remote}
              theme={theme}
              onAnswered={refresh}
            />
          ))}
          {human.directions.length > 0 ? (
            <SettingsSection title="Your words not yet carried in">
              <SettingsCard>
                {human.directions.map((d) => (
                  <SettingsRow key={d.message} label={d.text} hint={`To ${d.to} · owed by ${d.owedBy}`} />
                ))}
              </SettingsCard>
            </SettingsSection>
          ) : null}
          {human.root?.owner ? (
            <MessageBox
              project={project}
              to={human.root.owner}
              role={titled(human.root.role)}
              theme={theme}
              onSent={refresh}
            />
          ) : null}
        </>
      ) : null}
      {human && tab === "scopes" ? (
        underRoot(human).length > 0 ? (
          <DisclosureList
            theme={theme}
            open={open}
            onOpen={setOpen}
            items={underRoot(human).map((scope) => {
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
                  <View style={{ gap: SPACE.sm }}>
                    <Text style={muted}>
                      {scope.role} · {scope.owner ?? "nobody seated"}
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
          <Text style={muted}>No scope is open under the root.</Text>
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
          {(view?.stuck ?? []).length > 0 ? (
            <SettingsSection title="Stuck">
              <SettingsCard>
                {(view?.stuck ?? []).map((line) => (
                  <SettingsRow key={line} label={line} />
                ))}
              </SettingsCard>
            </SettingsSection>
          ) : null}
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

/** Says when the project's own copy of its template is not the one installed, and takes the installed one on a press. */
function TemplateRow(props: { project: string; template: ProjectTemplate; onSynced: () => void }) {
  const { project, template, onSynced } = props;
  const sync = useRpc(RPC.syncTemplate);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (template.state === "current" && !template.edited) return null;
  if (template.state === "uninstalled")
    return (
      <SettingsCard>
        <SettingsRow
          label={`${template.name} is no longer installed on this machine`}
          hint="The project goes on with the copy it took. Install the template again to sync with it."
        />
      </SettingsCard>
    );
  const press = () => {
    setBusy(true);
    void sync({ project })
      .then((answer) => {
        setSaid(answer.ok ? null : answer.text);
        onSynced();
      })
      .catch((failed: unknown) => {
        setSaid(problemText(failed));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <SettingsCard>
      <SettingsAction
        label={
          template.edited
            ? `This project's copy of ${template.name} was changed by hand`
            : `${template.name} was changed since this project took it`
        }
        hint="Sync takes the installed files for agents seated from now on. An agent already seated keeps what it was made with until it is reseated."
        error={said}
        actionLabel={busy ? "Syncing" : "Sync"}
        disabled={busy}
        onPress={press}
      />
    </SettingsCard>
  );
}

/** A role as a person reads it: the profile's own name for it, which the surface never writes for itself. */
const titled = (role: string) => role.charAt(0).toUpperCase() + role.slice(1).replaceAll("-", " ");

/** Words to the root's agent, recorded as the Human's message whether typed here or in its chat. */
function MessageBox({
  project,
  to,
  role,
  theme,
  onSent,
}: {
  project: string;
  to: string;
  role: string;
  theme: Theme;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  return (
    <SettingsSection title={`To the ${role}`}>
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
              {said ? said.text : `It reaches the ${role} when its turn ends.`}
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
