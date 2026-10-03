import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { ACTOR_LABEL, PROJECT_LABEL } from "../../shared/contracts/ids.ts";
import { RPC, type ViewOutput } from "../../shared/contracts/rpc.ts";
import { Mark } from "../kit/mark.tsx";
import { type Tone, pillOf, seatsOf, waitingOf } from "../state/team.ts";
import { popoverOf } from "./popover.tsx";

const EVERY_MS = 10_000;
const PANEL = "team";

type Says = Tone | "stuck";

/** One icon a tone, made once: Paseo draws whatever component a button names. */
const ICONS = Object.fromEntries(
  (["stuck", "you", "work", "wait", "done", "off"] as const).map((tone) => [
    tone,
    function PillMark({ theme }: PluginButtonIconProps) {
      return <Mark tone={tone} theme={theme} />;
    },
  ]),
) as Record<Says, ComponentType<PluginButtonIconProps>>;

type Chat = {
  readonly project: string;
  readonly workspaceId: string;
  readonly actor: string | null;
  readonly running: boolean;
  readonly pill: PluginButtonRegistration;
};

type Seen = {
  readonly id: string;
  readonly workspaceId?: string | null;
  readonly archivedAt?: string | null;
  readonly status: string;
  readonly labels: Readonly<Record<string, string>>;
};

/** On every chat of a team a pill that says where the team stands, and a Team button in its workspace's header. */
export function addTeamButtons(client: PluginClientContext): () => void {
  const chats = new Map<string, Chat>();
  const headers = new Map<string, { project: string; button: PluginButtonRegistration }>();
  const views = new Map<string, ViewOutput>();
  const popovers = new Map<string, ReturnType<typeof popoverOf>>();

  const saysOf = (project: string): { tone: Says; label: string; header: string } => {
    const view = views.get(project);
    if (!view?.human) return { tone: "work", label: "Team", header: "Team" };
    const running = new Set(
      [...chats.values()].flatMap((chat) =>
        chat.project === project && chat.running && chat.actor ? [chat.actor] : [],
      ),
    );
    const waiting = waitingOf(view.human);
    return {
      ...pillOf(view.human, view.stuck.length, seatsOf(view.human, running)),
      header: waiting > 0 ? `Team · ${waiting}` : "Team",
    };
  };
  const show = (project: string) => {
    const { tone, label, header } = saysOf(project);
    for (const chat of chats.values()) if (chat.project === project) chat.pill.update({ label, icon: ICONS[tone] });
    for (const at of headers.values())
      if (at.project === project) at.button.update({ label: header, icon: ICONS[tone] });
  };
  const read = (project: string, view: ViewOutput) => {
    views.set(project, view);
    show(project);
  };
  const gone = (agentId: string) => {
    const chat = chats.get(agentId);
    if (!chat) return;
    chat.pill.remove();
    chats.delete(agentId);
    if ([...chats.values()].some((other) => other.workspaceId === chat.workspaceId)) return;
    headers.get(chat.workspaceId)?.button.remove();
    headers.delete(chat.workspaceId);
  };
  const seat = (agent: Seen) => {
    const project = agent.labels[PROJECT_LABEL];
    const { workspaceId } = agent;
    if (!project || !workspaceId || agent.archivedAt) {
      gone(agent.id);
      return;
    }
    const running = agent.status === "running";
    const known = chats.get(agent.id);
    if (known?.project === project && known.workspaceId === workspaceId) {
      if (known.running === running) return;
      chats.set(agent.id, { ...known, running });
      show(project);
      return;
    }
    gone(agent.id);
    const content =
      popovers.get(project) ??
      popoverOf(client, project, (view) => {
        read(project, view);
      });
    popovers.set(project, content);
    const { tone, label, header } = saysOf(project);
    const pill = client.addComposerPill({
      id: PANEL,
      workspaceId,
      agentId: agent.id,
      button: { title: "The team", icon: ICONS[tone], label, behavior: { kind: "popover", Content: content } },
    });
    chats.set(agent.id, { project, workspaceId, actor: agent.labels[ACTOR_LABEL] ?? null, running, pill });
    if (headers.has(workspaceId)) return;
    const button = client.addHeaderButton({
      id: PANEL,
      workspaceId,
      button: {
        title: "Show the team",
        icon: ICONS[tone],
        label: header,
        behavior: {
          kind: "action",
          onPress: () => {
            client.openPanel(PANEL, { workspaceId, location: "explorer" });
          },
        },
      },
    });
    headers.set(workspaceId, { project, button });
  };
  const poll = () => {
    for (const project of new Set([...chats.values()].map((chat) => chat.project)))
      client
        .rpc(RPC.view, { project })
        .then((view) => {
          read(project, view);
        })
        // A missed read is only a stale label: the next poll reads again.
        .catch(() => undefined);
  };

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") gone(update.agentId);
    else seat(update.agent);
  });
  // Paseo sends agent updates only to a listing that subscribes; its snapshot comes again after each reconnect.
  let disposed = false;
  let release: (() => void) | null = null;
  client.paseo.agents
    .list({ filter: { includeArchived: false }, subscribe: {} })
    .then(({ subscription }) => {
      const stop = subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const { agent } of entries) seat(agent);
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
    for (const chat of chats.values()) chat.pill.remove();
    for (const at of headers.values()) at.button.remove();
    chats.clear();
    headers.clear();
  };
}
