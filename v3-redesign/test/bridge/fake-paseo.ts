import type { PaseoApi } from "@getpaseo/client";

type Sent = { host: string; text: string; messageId: string };
type Created = {
  host: string;
  cwd: string;
  title: string;
  prompt: string;
  env: Record<string, string>;
  systemPrompt: string;
  tools: string[];
  labels: Record<string, string>;
};

/**
 * The part of Paseo's API the plugin uses, recording what it was asked. Agents are always between turns. As Paseo does,
 * a keyed create keeps its request and refuses the key with a different one; `loseReplies` drops that many create
 * replies after the agent is made, as a dropped connection would.
 */
export function fakePaseo(pluginDir: string, provider = "claude") {
  const created: Created[] = [];
  const sent: Sent[] = [];
  const archived: string[] = [];
  const byKey = new Map<string, { host: string; request: string }>();
  const gate = { loseReplies: 0 };
  const ref = (id: string) => ({
    id,
    refresh: () =>
      Promise.resolve({
        agent: {
          id,
          activeTurn: null,
          archivedAt: archived.includes(id) ? "now" : null,
          lastUsage: { inputTokens: 100, outputTokens: 20, totalCostUsd: 0.01 },
        },
      }),
    send: (text: string, options: { messageId: string }) => {
      sent.push({ host: id, text, messageId: options.messageId });
      return Promise.resolve();
    },
    archive: () => {
      archived.push(id);
      return Promise.resolve({ archivedAt: "now" });
    },
    respondToPermission: () => Promise.resolve(),
    timeline: { refetch: () => Promise.resolve({ entries: [] }) },
  });
  const api = {
    config: {
      get: () =>
        Promise.resolve({
          config: {
            plugins: { seatworks: { source: "directory", path: pluginDir } },
            agentProfiles: ["slp-supervisor", "slp-lead", "slp-peer", "slp-reviewer", "slp-watcher"].map((name) => ({
              id: name,
              name,
              provider,
              model: "test",
            })),
          },
        }),
    },
    agents: {
      list: (o: { filter: { labels: Record<string, string> } }) =>
        Promise.resolve({
          entries: created
            .filter((c) => Object.entries(o.filter.labels).every(([k, v]) => c.labels[k] === v))
            .map((c) => ({ agent: { id: c.host, archivedAt: archived.includes(c.host) ? "now" : null } })),
        }),
      create: (o: {
        idempotencyKey: string;
        cwd: string;
        title: string;
        prompt: string;
        env: Record<string, string>;
        labels: Record<string, string>;
        config: { systemPrompt: string; toolPolicy: { preapproved: { tool: string }[] } };
      }) => {
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
          tools: o.config.toolPolicy.preapproved.map((p) => p.tool),
          labels: o.labels,
        });
        if (gate.loseReplies > 0) {
          gate.loseReplies--;
          return Promise.reject(new Error("connection lost"));
        }
        return Promise.resolve(ref(host));
      },
      ref,
    },
  };
  return { api: api as unknown as PaseoApi, created, sent, archived, gate };
}
