import type { PaseoApi } from "@getpaseo/client";

type Sent = { host: string; text: string; messageId: string };
type Created = {
  host: string;
  cwd: string;
  title: string;
  prompt: string;
  /** The id the first prompt was sent under, which Paseo gives back on that message in the agent's history. */
  promptId: string;
  env: Record<string, string>;
  systemPrompt: string;
  /** The provider and model of the agent profile it was made from. */
  provider: string;
  tools: string[];
  /** The environment the team's tool server would be spawned with. */
  teamEnv: Record<string, string> | undefined;
  /** Every MCP server the agent was given, by name, and each tool approved ahead as `server.tool`. */
  servers: Record<string, Record<string, unknown>>;
  approved: string[];
  labels: Record<string, string>;
  /** The whole config the agent was made with, for what a harness file adds: its mode and its provider's options. */
  config: { modeId?: string; options?: Record<string, unknown> };
};

/** The providers Paseo hands MCP servers and pre-approves exact tools for, as its registry has them at 0.10.3. */
const TAKES_SERVERS = new Set(["claude", "codex", "opencode"]);

/** The permissions Paseo's schema for OpenCode's options names at 0.10.3: it is strict, and has no tool by name. */
const OPENCODE_PERMISSIONS = new Set(
  "read edit glob grep list bash task external_directory todowrite question webfetch websearch codesearch repo_clone repo_overview lsp doom_loop skill".split(
    " ",
  ),
);

/** The first key of an OpenCode agent's options that Paseo's schema refuses, if one does. */
function refusedOption(options: Record<string, unknown>): string | undefined {
  const outside = Object.keys(options).find((key) => key !== "permission");
  if (outside !== undefined) return outside;
  const permission = options.permission;
  if (typeof permission !== "object" || permission === null) return undefined;
  return Object.keys(permission).find((key) => !OPENCODE_PERMISSIONS.has(key));
}

/** The part of Paseo's API the plugin uses, recording what it was asked; `gate` makes creates and reads fail. */
export function fakePaseo(
  pluginDir: string,
  provider = "claude",
  profiles: readonly string[] = ["slp-supervisor", "slp-lead", "slp-peer", "slp-reviewer", "slp-watcher"],
) {
  const created: Created[] = [];
  const sent: Sent[] = [];
  const archived: string[] = [];
  const byKey = new Map<string, { host: string; request: string }>();
  const gate: {
    loseReplies: number;
    refuse: string | null;
    configFails: number;
    archiveFails: number;
    /** A create answers only once this settles, and says through `reached` that it is that far. */
    hold: Promise<void> | null;
    reached: () => void;
    /** With turns on, an agent made or sent words is inside a turn until the test ends it, as Paseo's are. */
    turns: boolean;
  } = {
    loseReplies: 0,
    refuse: null,
    configFails: 0,
    archiveFails: 0,
    hold: null,
    reached: () => undefined,
    turns: false,
  };
  const inTurn = new Set<string>();
  let down = false;
  /** Permissions each agent's own prompt still waits on, and those answered through the API. */
  const pending = new Map<string, Set<string>>();
  const responded: string[] = [];
  /** The project roots Paseo lists; a test adds the ones the Human opened in Paseo. */
  const projects: string[] = [];
  /** What each agent's timeline holds, oldest first; a test puts an agent's turns here. */
  const timelines = new Map<string, unknown[]>();
  const ref = (id: string) => ({
    id,
    refresh: () =>
      Promise.resolve({
        agent: {
          id,
          activeTurn: inTurn.has(id) ? { id: "turn" } : null,
          archivedAt: archived.includes(id) ? "now" : null,
          pendingPermissions: [...(pending.get(id) ?? [])].map((request) => ({ id: request })),
          lastUsage: { inputTokens: 100, outputTokens: 20, totalCostUsd: 0.01 },
        },
      }),
    send: (text: string, options: { messageId: string }) => {
      sent.push({ host: id, text, messageId: options.messageId });
      if (gate.turns) inTurn.add(id);
      return Promise.resolve();
    },
    archive: () => {
      if (gate.archiveFails-- > 0) return Promise.reject(new Error("socket reconnecting"));
      archived.push(id);
      return Promise.resolve({ archivedAt: "now" });
    },
    respondToPermission: (o: { requestId: string }) => {
      responded.push(o.requestId);
      pending.get(id)?.delete(o.requestId);
      return Promise.resolve();
    },
    // Which end Paseo gives when none is named is not ours to assume: here it is the oldest, unless the tail is asked.
    timeline: {
      refetch: (o: { limit?: number; direction?: string } = {}) => {
        const all = timelines.get(id) ?? [];
        const page = o.direction === "tail" ? all.slice(-(o.limit ?? all.length)) : all.slice(0, o.limit);
        return Promise.resolve({ entries: page.map((item) => ({ item })) });
      },
    },
  });
  const api = {
    projects: {
      list: () =>
        Promise.resolve({
          projects: projects.map((root) => ({
            projectId: root,
            projectDisplayName: root.split("/").pop(),
            projectRootPath: root,
            projectKind: "git",
          })),
        }),
    },
    config: {
      get: () =>
        gate.configFails-- > 0
          ? Promise.reject(new Error("socket reconnecting"))
          : Promise.resolve({
              config: {
                plugins: { seatworks: { source: "directory", path: pluginDir } },
                agentProfiles: profiles.map((name) => ({ id: name, name, provider, model: name })),
              },
            }),
    },
    agents: {
      list: (o: { filter: { labels: Record<string, string> } }) => {
        if (down) {
          down = false;
          return Promise.reject(new Error("connection lost"));
        }
        return Promise.resolve({
          entries: created
            .filter((c) => Object.entries(o.filter.labels).every(([k, v]) => c.labels[k] === v))
            .map((c) => ({
              agent: {
                id: c.host,
                title: c.title,
                labels: c.labels,
                archivedAt: archived.includes(c.host) ? "now" : null,
              },
            })),
          pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
        });
      },
      create: (o: {
        idempotencyKey: string;
        cwd: string;
        title: string;
        prompt: string;
        clientMessageId: string;
        env: Record<string, string>;
        labels: Record<string, string>;
        config: {
          provider: string;
          systemPrompt: string;
          modeId?: string;
          options?: Record<string, unknown>;
          toolPolicy?: { preapproved: { server: string; tool: string }[] };
          mcpServers?: Record<string, { env?: Record<string, string> } & Record<string, unknown>>;
        };
      }) => {
        if (gate.refuse !== null) return Promise.reject(new Error(gate.refuse));
        // Paseo refuses these for every other provider, and a create that sends them makes no agent.
        const kind = o.config.provider.split("/")[0]!;
        if (o.config.toolPolicy && !TAKES_SERVERS.has(kind))
          return Promise.reject(
            new Error(`Provider '${kind}' cannot preapprove exact MCP tools for unattended execution`),
          );
        if (Object.keys(o.config.mcpServers ?? {}).length > 0 && !TAKES_SERVERS.has(kind))
          return Promise.reject(new Error(`Provider '${kind}' does not support MCP servers`));
        const refused = kind === "opencode" ? refusedOption(o.config.options ?? {}) : undefined;
        if (refused !== undefined) return Promise.reject(new Error(`Unrecognized key: "${refused}"`));
        const request = JSON.stringify(o);
        const known = byKey.get(o.idempotencyKey);
        if (known)
          return known.request === request
            ? Promise.resolve(ref(known.host))
            : Promise.reject(new Error("agent_request_key_conflict"));
        const host = `host-${created.length + 1}`;
        if (gate.turns) inTurn.add(host);
        byKey.set(o.idempotencyKey, { host, request });
        created.push({
          host,
          cwd: o.cwd,
          title: o.title,
          prompt: o.prompt,
          promptId: o.clientMessageId,
          env: o.env,
          systemPrompt: o.config.systemPrompt,
          provider: o.config.provider,
          tools: (o.config.toolPolicy?.preapproved ?? []).filter((p) => p.server === "team").map((p) => p.tool),
          teamEnv: o.config.mcpServers?.team?.env,
          servers: o.config.mcpServers ?? {},
          approved: (o.config.toolPolicy?.preapproved ?? []).map((p) => `${p.server}.${p.tool}`),
          labels: o.labels,
          config: { modeId: o.config.modeId, options: o.config.options },
        });
        if (gate.loseReplies > 0) {
          gate.loseReplies--;
          down = true;
          return Promise.reject(new Error("connection lost"));
        }
        if (gate.hold === null) return Promise.resolve(ref(host));
        gate.reached();
        return gate.hold.then(() => ref(host));
      },
      ref,
    },
  };
  /** The agent's turn is over, as far as Paseo knows; the test tells the plugin with the hook Paseo would send. */
  const endTurn = (host: string) => inTurn.delete(host);
  return {
    api: api as unknown as PaseoApi,
    created,
    sent,
    archived,
    gate,
    projects,
    pending,
    responded,
    timelines,
    endTurn,
  };
}
