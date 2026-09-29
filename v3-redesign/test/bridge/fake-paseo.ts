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
};

/** The part of Paseo's API the plugin uses, recording what it was asked. Agents are always between turns. */
export function fakePaseo(pluginDir: string) {
  const created: Created[] = [];
  const sent: Sent[] = [];
  const archived: string[] = [];
  const byKey = new Map<string, string>();
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
              provider: "claude",
              model: "test",
            })),
          },
        }),
    },
    agents: {
      create: (o: {
        idempotencyKey: string;
        cwd: string;
        title: string;
        prompt: string;
        env: Record<string, string>;
        config: { systemPrompt: string; toolPolicy: { preapproved: { tool: string }[] } };
      }) => {
        const known = byKey.get(o.idempotencyKey);
        if (known) return Promise.resolve(ref(known));
        const host = `host-${created.length + 1}`;
        byKey.set(o.idempotencyKey, host);
        created.push({
          host,
          cwd: o.cwd,
          title: o.title,
          prompt: o.prompt,
          env: o.env,
          systemPrompt: o.config.systemPrompt,
          tools: o.config.toolPolicy.preapproved.map((p) => p.tool),
        });
        return Promise.resolve(ref(host));
      },
      ref,
    },
  };
  return { api: api as unknown as PaseoApi, created, sent, archived };
}
