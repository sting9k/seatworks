import type { PaseoAgentConfig, PaseoAgentListResult } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { PaseoLink } from "./paseo-link.ts";

/** What an agent is started with; the agent host's own words, naming nothing of SLP (PORTS.md, Agent host). */
export type AgentSpec = {
  readonly key: string;
  readonly title: string;
  readonly profile: string;
  readonly cwd: string;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly env: Readonly<Record<string, string>>;
  readonly tools: {
    readonly command: string;
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
    readonly names: readonly string[];
  };
  readonly labels: Readonly<Record<string, string>>;
  readonly writes: boolean;
};

export type Harness = {
  always: Partial<PaseoAgentConfig>;
  writes: Partial<PaseoAgentConfig>;
  reads: Partial<PaseoAgentConfig>;
  /** What the agent's process is given beside the seat's own environment, such as the home Seatworks lays out for it. */
  env: Readonly<Record<string, string>>;
};
export type Unavailable = { unavailable: true };
const UNAVAILABLE: Unavailable = { unavailable: true };

/** The agent host on Paseo: the one place, with the bridge, that imports `@getpaseo/*` (PASEO.md rule 1). */
export class PaseoHost {
  private readonly link: PaseoLink;
  private readonly harness: (provider: string) => Harness | null;

  constructor(link: PaseoLink, harness: (provider: string) => Harness | null) {
    this.link = link;
    this.harness = harness;
  }

  /**
   * Starts an agent from one of the Human's Paseo agent profiles. Paseo keeps a keyed create's request and refuses the
   * same key with a different one, and the first prompt reads the record as it is now, so a retry first looks for the
   * agent its labels name.
   */
  async create(spec: AgentSpec): Promise<{ host: string } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const made = await api.agents.list({
      filter: { labels: { ...spec.labels }, includeArchived: true },
      page: { limit: 1 },
    });
    const known = made.entries[0]?.agent;
    if (known) return known.archivedAt ? { failed: "its agent was archived before it started" } : { host: known.id };
    const daemon = await api.config.get();
    const profile = (daemon.config.agentProfiles ?? []).find((p) => p.id === spec.profile || p.name === spec.profile);
    if (!profile) return { failed: `no Paseo agent profile named ${spec.profile}: add one in Paseo's settings` };
    const harness = this.harness(profile.provider);
    const base: Json = {
      provider: profile.model ? `${profile.provider}/${profile.model}` : profile.provider,
      ...(profile.modeId ? { modeId: profile.modeId } : {}),
      ...(profile.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}),
      ...(profile.featureValues ? { featureValues: profile.featureValues } : {}),
    };
    const shaped = mergeAll(base, harness?.always ?? {}, (spec.writes ? harness?.writes : harness?.reads) ?? {});
    const config = {
      ...shaped,
      systemPrompt: spec.systemPrompt,
      mcpServers: {
        team: { type: "stdio", command: spec.tools.command, args: [...spec.tools.args], env: { ...spec.tools.env } },
      },
      toolPolicy: { preapproved: spec.tools.names.map((tool) => ({ kind: "mcp", server: "team", tool })) },
    } as unknown as PaseoAgentConfig;
    const handle = await api.agents
      .create({
        idempotencyKey: spec.key,
        cwd: spec.cwd,
        title: spec.title,
        prompt: spec.prompt,
        clientMessageId: `${spec.key}:prompt`,
        env: { ...spec.env, ...harness?.env },
        labels: { ...spec.labels },
        config,
      })
      .catch((error: unknown) => {
        const says = error instanceof Error ? error.message : String(error);
        // Paseo holds this key for a create it cannot finish or cannot tell finished; a new seat gets a new key.
        if (/_request_(key_conflict|outcome_unknown)/.test(says))
          return { failed: `Paseo could not make the agent: ${says}` };
        throw error;
      });
    return "failed" in handle ? handle : { host: handle.id };
  }

  /** Sends words between turns only; a reader inside a turn is busy and the words wait for its end. */
  async send(host: string, text: string, messageId: string): Promise<"sent" | "busy" | "gone" | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const agent = api.agents.ref(host);
    const fetched = await agent.refresh();
    if (!fetched || fetched.agent.archivedAt) return "gone";
    if (fetched.agent.activeTurn) return "busy";
    await agent.send(text, { messageId });
    return "sent";
  }

  async answerPermission(
    host: string,
    requestId: string,
    allow: boolean,
    reason: string,
  ): Promise<"done" | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const agent = api.agents.ref(host);
    const fetched = await agent.refresh();
    // Answered already, in the agent's own prompt or by an earlier try: a second answer would find nothing to answer.
    if (!fetched?.agent.pendingPermissions.some((p) => p.id === requestId)) return "done";
    const response = allow ? { behavior: "allow" as const } : { behavior: "deny" as const, message: reason };
    await agent.respondToPermission({ requestId, response });
    return "done";
  }

  async archive(host: string): Promise<"done" | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    await api.agents.ref(host).archive();
    return "done";
  }

  /** Every agent not yet archived that carries all of `labels`, page by page. */
  async labelled(
    labels: Readonly<Record<string, string>>,
  ): Promise<{ host: string; title: string | null; labels: Readonly<Record<string, string>> }[] | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const found = [];
    let cursor: string | null = null;
    do {
      const page: PaseoAgentListResult = await api.agents.list({
        filter: { labels: { ...labels } },
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
      });
      for (const { agent } of page.entries)
        if (!agent.archivedAt) found.push({ host: agent.id, title: agent.title, labels: agent.labels });
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
    } while (cursor);
    return found;
  }

  /** An agent's recent turns as lines: what it was told, said, thought and ran, each clipped. */
  async look(host: string, last: number): Promise<string> {
    const api = this.link.current;
    if (!api) return "Paseo is not reachable yet.";
    const page = await api.agents.ref(host).timeline.refetch({ limit: last });
    const lines = page.entries.map((e) => lineOf(e.item)).filter((l): l is string => l !== null);
    return lines.length > 0 ? lines.join("\n") : "Nothing in its timeline yet.";
  }

  /** What an agent's session has spent so far: Paseo reports running totals, not a turn's share. */
  async usage(host: string): Promise<{ tokens: number; usd: number }> {
    const api = this.link.current;
    const usage = api ? (await api.agents.ref(host).refresh())?.agent.lastUsage : undefined;
    return { tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0), usd: usage?.totalCostUsd ?? 0 };
  }
}

type Json = Record<string, unknown>;

const CLIP = 1500;

function lineOf(item: AgentTimelineItem): string | null {
  const clip = (t: string) => (t.length > CLIP ? `${t.slice(0, CLIP)}…` : t);
  switch (item.type) {
    case "user_message":
      return `told: ${clip(item.text)}`;
    case "assistant_message":
      return `said: ${clip(item.text)}`;
    case "reasoning":
      return `thought: ${clip(item.text)}`;
    case "error":
      return `error: ${clip(item.message)}`;
    case "tool_call":
      return `ran: ${clip(JSON.stringify(item).slice(0, CLIP))}`;
    default:
      return null;
  }
}

/** Deep merge of plain objects, later winning; arrays and values replace. */
function mergeAll(...layers: Json[]): Json {
  const out: Json = {};
  for (const layer of layers)
    for (const [key, value] of Object.entries(layer)) {
      const prior = out[key];
      out[key] = isPlain(prior) && isPlain(value) ? mergeAll(prior, value) : value;
    }
  return out;
}

function isPlain(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
