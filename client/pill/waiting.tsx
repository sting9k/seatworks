import type { PluginButtonContentProps, PluginButtonIconProps, PluginClientContext } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { PROJECT_LABEL } from "../../shared/contracts/ids.ts";
import { RPC } from "../../shared/contracts/rpc.ts";
import { PermissionCard } from "../decide/permission-card.tsx";
import { QuestionCard } from "../decide/question-card.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { useProjectView } from "../state/project-view.ts";
import { waitingOf } from "../surface/project-page.tsx";

const EVERY_MS = 10_000;

function WaitingIcon({ theme, size }: PluginButtonIconProps) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.statusWarning }} />
    </View>
  );
}

/** The popover's body: what waits on the Human in this agent's project, answerable from whichever chat is open. */
function waitingContent(project: string) {
  return function WaitingContent({ theme }: PluginButtonContentProps) {
    const { view, reload } = useProjectView(project);
    const human = view?.human ?? null;
    const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
    if (!human) return <Text style={muted}>Reading what waits on you.</Text>;
    const refresh = () => void reload();
    return (
      <ScrollView contentContainerStyle={{ gap: SPACE.sm }}>
        {waitingOf(human) === 0 ? <Text style={muted}>Nothing waits on you.</Text> : null}
        {human.questions.map((q) => (
          <QuestionCard key={q.id} project={project} question={q} theme={theme} onAnswered={refresh} />
        ))}
        {human.permissions.map((p) => (
          <PermissionCard key={p.id} project={project} permission={p} theme={theme} onAnswered={refresh} />
        ))}
      </ScrollView>
    );
  };
}

type Pill = { project: string; update: (count: number) => void; remove: () => void };

/** A "needs you" pill on the chat of every agent the plugin started, counting what waits on the Human in its project. */
export function addWaitingPills(client: PluginClientContext): () => void {
  const pills = new Map<string, Pill>();
  const counts = new Map<string, number>();
  const contents = new Map<string, ReturnType<typeof waitingContent>>();
  const label = (count: number) => `${count} need${count === 1 ? "s" : ""} you`;

  const show = (project: string) => {
    const count = counts.get(project) ?? 0;
    for (const pill of pills.values()) if (pill.project === project) pill.update(count);
  };
  const seat = (agentId: string, workspaceId: string, project: string) => {
    if (pills.get(agentId)?.project === project) return;
    pills.get(agentId)?.remove();
    const content = contents.get(project) ?? waitingContent(project);
    contents.set(project, content);
    const count = counts.get(project) ?? 0;
    const registration = client.addComposerPill({
      id: "waiting",
      workspaceId,
      agentId,
      button: {
        title: "Waiting on you",
        icon: WaitingIcon,
        label: label(count),
        visible: count > 0,
        behavior: { kind: "popover", Content: content },
      },
    });
    pills.set(agentId, {
      project,
      update: (next) => {
        registration.update({ label: label(next), visible: next > 0 });
      },
      remove: () => {
        registration.remove();
      },
    });
  };
  const gone = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
  };
  const poll = () => {
    for (const project of new Set([...pills.values()].map((p) => p.project)))
      client
        .rpc(RPC.view, { project })
        .then((view) => {
          counts.set(project, waitingOf(view.human));
          show(project);
        })
        // A missed read is only a missed count: the next poll reads again.
        .catch(() => undefined);
  };

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") {
      gone(update.agentId);
      return;
    }
    const { id, workspaceId, labels, archivedAt } = update.agent;
    const project = labels[PROJECT_LABEL];
    if (!project || !workspaceId || archivedAt) gone(id);
    else seat(id, workspaceId, project);
  });
  // Paseo sends agent updates only to a listing that subscribes; its snapshot comes again after each reconnect.
  let disposed = false;
  let release: (() => void) | null = null;
  client.paseo.agents
    .list({ filter: { includeArchived: false }, subscribe: {} })
    .then(({ subscription }) => {
      const stop = subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const { agent } of entries) {
            const project = agent.labels[PROJECT_LABEL];
            if (project && agent.workspaceId && !agent.archivedAt) seat(agent.id, agent.workspaceId, project);
          }
          poll();
        },
        update: () => undefined,
      });
      release = () => {
        stop();
        // Released with the plugin: a daemon that is already gone holds nothing to let go of.
        subscription.release().catch(() => undefined);
      };
      if (disposed) release();
    })
    // Without the listing no pill shows; every chat still works.
    .catch(() => undefined);
  const timer = setInterval(poll, EVERY_MS);
  return () => {
    clearInterval(timer);
    disposed = true;
    release?.();
    unsubscribe();
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };
}
