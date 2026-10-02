import type { PaseoApi } from "@getpaseo/client";

type Sent = { host: string; text: string; messageId: string };
type Created = {
  host: string;
  cwd: string;
  title: string;
  prompt: string;
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
};

/** The part of Paseo's API the plugin uses, recording what it was asked; `gate` makes creates and reads fail. */
export function fakePaseo(pluginDir: string, provider = "claude") {
  const created: Created[] = [];
  const sent: Sent[] = [];
  const archived: string[] = [];
  const byKey = new Map<string, { host: string; request: string }>();
  const gate: { loseReplies: number; refuse: string | null; configFails: number; archiveFails: number } = {
    loseReplies: 0,
    refuse: null,
    configFails: 0,
    archiveFails: 0,
  };
  let down = false;
  /** Permissions each agent's own prompt still waits on, and those answered through the API. */
  const pending = new Map<string, Set<string>>();
  const responded: string[] = [];
  /** The project roots Paseo lists; a test adds the ones the Human opened in Paseo. */
  const projects: string[] = [];
  const ref = (id: string) => ({
    id,
    refresh: () =>
      Promise.resolve({
        agent: {
          id,
          activeTurn: null,
          archivedAt: archived.includes(id) ? "now" : null,
          pendingPermissions: [...(pending.get(id) ?? [])].map((request) => ({ id: request })),
          lastUsage: { inputTokens: 100, outputTokens: 20, totalCostUsd: 0.01 },
        },
      }),
    send: (text: string, options: { messageId: string }) => {
      sent.push({ host: id, text, messageId: options.messageId });
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
    timeline: { refetch: () => Promise.resolve({ entries: [] }) },
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
                agentProfiles: ["slp-supervisor", "slp-lead", "slp-peer", "slp-reviewer", "slp-watcher"].map(
                  (name) => ({
                    id: name,
                    name,
                    provider,
                    model: name,
                  }),
                ),
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
        env: Record<string, string>;
        labels: Record<string, string>;
        config: {
          provider: string;
          systemPrompt: string;
          toolPolicy: { preapproved: { server: string; tool: string }[] };
          mcpServers?: Record<string, { env?: Record<string, string> } & Record<string, unknown>>;
        };
      }) => {
        if (gate.refuse !== null) return Promise.reject(new Error(gate.refuse));
        const request = JSON.stringify(o);
        const known = byKey.get(o.idempotencyKey);
        if (known)
          return known.request === request
            ? Promise.resolve(ref(known.host))
            : Promise.reject(new Error("agent_request_key_conflict"));
        const host = `host-${created.length + 1}`;
        byKey.set(o.idempotencyKey, { host, request });
        created.push({
          host,
          cwd: o.cwd,
          title: o.title,
          prompt: o.prompt,
          env: o.env,
          systemPrompt: o.config.systemPrompt,
          provider: o.config.provider,
          tools: o.config.toolPolicy.preapproved.filter((p) => p.server === "team").map((p) => p.tool),
          teamEnv: o.config.mcpServers?.team?.env,
          servers: o.config.mcpServers ?? {},
          approved: o.config.toolPolicy.preapproved.map((p) => `${p.server}.${p.tool}`),
          labels: o.labels,
        });
        if (gate.loseReplies > 0) {
          gate.loseReplies--;
          down = true;
          return Promise.reject(new Error("connection lost"));
        }
        return Promise.resolve(ref(host));
      },
      ref,
    },
  };
  return { api: api as unknown as PaseoApi, created, sent, archived, gate, projects, pending, responded };
}
