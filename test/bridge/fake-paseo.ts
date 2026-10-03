import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  /** The workspace Paseo made it in, and the root of the project that workspace is filed under. */
  workspace: string;
  project: string;
  tools: string[];
  /** The environment the team's tool server would be spawned with. */
  teamEnv: Record<string, string> | undefined;
  /** Every MCP server the agent was given, by name, and each tool approved ahead as `server.tool`. */
  servers: Record<string, Record<string, unknown>>;
  approved: string[];
  labels: Record<string, string>;
  /** The whole config the agent was made with: its mode, how hard it thinks, its feature values, its provider's options. */
  config: {
    modeId?: string;
    thinkingOptionId?: string;
    featureValues?: Record<string, unknown>;
    options?: Record<string, unknown>;
  };
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

/** An agent profile as Paseo keeps one: a model, a thinking option and a mode where the Human gave them. */
type Held = {
  id: string;
  name: string;
  provider: string;
  model?: string;
  thinkingOptionId?: string;
  modeId?: string;
  featureValues?: Record<string, unknown>;
};

type Model = {
  id: string;
  label: string;
  isDefault?: boolean;
  thinkingOptions?: { id: string; label: string }[];
  defaultThinkingOptionId?: string;
};

/** The models the stand-in's provider has, each with the thinking options Paseo lists for it. */
const MODELS: Model[] = [
  {
    id: "sonnet",
    label: "Sonnet",
    isDefault: true,
    thinkingOptions: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
    defaultThinkingOptionId: "low",
  },
  { id: "opus", label: "Opus", thinkingOptions: [{ id: "max", label: "Max" }] },
  { id: "haiku", label: "Haiku" },
];

/** The part of Paseo's API the plugin uses, recording what it was asked; `gate` makes creates and reads fail. */
export function fakePaseo(
  pluginDir: string,
  provider = "claude",
  profiles: readonly string[] = ["slp-supervisor", "slp-lead", "slp-peer", "slp-reviewer", "slp-watcher"],
) {
  /** The agent profiles Paseo holds, as the Human shaped them; a patch takes the list whole, as Paseo's own store does. */
  const held: Held[] = profiles.map((name) => ({ id: name, name, provider, model: name }));
  /** The providers Paseo finds here, each with its models; a test adds another the Human has installed. */
  const providers = new Map<string, Model[]>([[provider, MODELS]]);
  const patches: unknown[] = [];
  const created: Created[] = [];
  const sent: Sent[] = [];
  const archived: string[] = [];
  const byKey = new Map<string, { host: string; request: string }>();
  const gate: {
    loseReplies: number;
    refuse: string | null;
    configFails: number;
    /** Whether Paseo fails to say which providers it finds. */
    providersFail: boolean;
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
    providersFail: false,
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
  /** The workspaces Paseo keeps: each a folder, filed under the project of one root; a worktree is one Paseo made. */
  const workspaces: {
    id: string;
    project: string;
    directory: string;
    title: string | null;
    worktree: boolean;
    archived: boolean;
  }[] = [];
  /** A folder given with no project is filed under a project of that very folder, made where Paseo has none (0.10.3). */
  const workspaceAt = (directory: string, title: string | null, project?: string, worktree = false) => {
    if (project === undefined && !projects.includes(directory)) projects.push(directory);
    const made = {
      id: `workspace-${workspaces.length + 1}`,
      project: project ?? directory,
      directory,
      title,
      worktree,
      archived: false,
    };
    workspaces.push(made);
    return made;
  };
  /** Where Paseo keeps the worktrees it makes: a folder of its own, a worktree a slug (0.10.3, `utils/worktree.js`). */
  const worktreesRoot = realpathSync(mkdtempSync(join(tmpdir(), "sw-paseo-worktrees-")));
  const gitIn = (repo: string, ...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const has = (repo: string, ref: string) => {
    try {
      gitIn(repo, "rev-parse", "--verify", "-q", ref);
      return true;
    } catch {
      return false;
    }
  };
  /** A name no branch has yet, as Paseo finds one: the name itself, else with a number after it. */
  const unused = (repo: string, name: string) => {
    let free = name;
    for (let n = 1; has(repo, `refs/heads/${free}`); n++) free = `${name}-${n}`;
    return free;
  };
  type Worktree = {
    kind: "worktree";
    projectId?: string;
    action?: "branch-off" | "checkout";
    refName?: string;
    branchName?: string;
    worktreeSlug?: string;
  };
  /** A worktree as Paseo makes one: always on a branch, a new one off a base or an existing one checked out. */
  const worktreeAt = (source: Worktree, title: string | null) => {
    const repo = source.projectId;
    if (repo === undefined || !projects.includes(repo)) throw new Error(`Unknown project: ${repo ?? "none"}`);
    const slug = source.worktreeSlug ?? source.branchName ?? "worktree";
    let path = join(worktreesRoot, slug);
    for (let n = 1; existsSync(path); n++) path = join(worktreesRoot, `${slug}-${n}`);
    const ref = source.refName ?? "main";
    if (source.action === "checkout") {
      const taken = gitIn(repo, "worktree", "list", "--porcelain").includes(`branch refs/heads/${ref}\n`);
      if (taken) gitIn(repo, "worktree", "add", path, "-b", unused(repo, ref), "--no-track", ref);
      else gitIn(repo, "worktree", "add", path, ref);
    } else {
      const named = source.branchName ?? slug;
      // A name a branch already has is not taken again: the new branch is named for the slug, off that branch.
      if (has(repo, `refs/heads/${named}`))
        gitIn(repo, "worktree", "add", path, "-b", unused(repo, slug), "--no-track", named);
      else gitIn(repo, "worktree", "add", path, "-b", named, "--no-track", ref);
    }
    return workspaceAt(realpathSync(path), title, repo, true);
  };
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
  type Asked = {
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
      thinkingOptionId?: string;
      featureValues?: Record<string, unknown>;
      options?: Record<string, unknown>;
      toolPolicy?: { preapproved: { server: string; tool: string }[] };
      mcpServers?: Record<string, { env?: Record<string, string> } & Record<string, unknown>>;
    };
  };
  const makeAgent = (o: Asked, at: (typeof workspaces)[number]) => {
    if (gate.refuse !== null) return Promise.reject(new Error(gate.refuse));
    // Paseo makes no agent of a provider alone: seen on a live 0.10.3, for a profile that named no model.
    if (!o.config.provider.includes("/"))
      return Promise.reject(new Error('Expected config.provider in "provider/model" format'));
    // Paseo refuses these for every other provider, and a create that sends them makes no agent.
    const kind = o.config.provider.split("/")[0]!;
    if (o.config.toolPolicy && !TAKES_SERVERS.has(kind))
      return Promise.reject(new Error(`Provider '${kind}' cannot preapprove exact MCP tools for unattended execution`));
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
      workspace: at.id,
      project: at.project,
      config: {
        modeId: o.config.modeId,
        thinkingOptionId: o.config.thinkingOptionId,
        featureValues: o.config.featureValues,
        options: o.config.options,
      },
    });
    if (gate.loseReplies > 0) {
      gate.loseReplies--;
      down = true;
      return Promise.reject(new Error("connection lost"));
    }
    if (gate.hold === null) return Promise.resolve(ref(host));
    gate.reached();
    return gate.hold.then(() => ref(host));
  };
  const api = {
    projects: {
      list: () =>
        Promise.resolve({
          projects: projects.map((root) => ({
            projectId: root,
            projectDisplayName: root.split("/").pop(),
            projectRootPath: root,
            projectKind: existsSync(join(root, ".git")) ? "git" : "non_git",
          })),
        }),
    },
    workspaces: {
      list: (o: { filter?: { projectId?: string } } = {}) =>
        Promise.resolve({
          entries: workspaces
            .filter((kept) => !kept.archived)
            .filter((kept) => o.filter?.projectId === undefined || kept.project === o.filter.projectId)
            .map((kept) => ({ id: kept.id, projectId: kept.project, workspaceDirectory: kept.directory })),
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      // Opening a folder finds the workspace Paseo keeps for it, or makes one, with a project of the folder.
      open: (cwd: string) => {
        const kept = workspaces.find((one) => !one.archived && one.directory === cwd) ?? workspaceAt(cwd, null);
        return Promise.resolve({ id: kept.id, projectId: kept.project, directory: kept.directory });
      },
      create: (o: { title?: string; source: { kind: "directory"; path: string; projectId?: string } | Worktree }) => {
        if (o.source.kind === "worktree") {
          try {
            const made = worktreeAt(o.source, o.title ?? null);
            return Promise.resolve({ id: made.id, projectId: made.project, directory: made.directory });
          } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
        const { path, projectId } = o.source;
        if (projectId !== undefined && !projects.includes(projectId))
          return Promise.reject(new Error(`Unknown project: ${projectId}`));
        const made = workspaceAt(path, o.title ?? null, projectId);
        return Promise.resolve({ id: made.id, projectId: made.project, directory: made.directory });
      },
      // Archiving ends the workspace's agents and removes a worktree Paseo made, whatever it holds uncommitted.
      archive: (id: string) => {
        const kept = workspaces.find((one) => one.id === id);
        if (!kept) return Promise.resolve({ workspaceId: id, archivedAt: null, error: `Workspace not found: ${id}` });
        kept.archived = true;
        for (const agent of created)
          if (agent.workspace === id && !archived.includes(agent.host)) archived.push(agent.host);
        if (kept.worktree && existsSync(kept.directory))
          gitIn(kept.project, "worktree", "remove", "--force", kept.directory);
        return Promise.resolve({ workspaceId: id, archivedAt: "now", error: null });
      },
      ref: (id: string) => ({
        id,
        agents: {
          create: (o: Omit<Asked, "cwd">) => {
            const at = workspaces.find((one) => one.id === id && !one.archived);
            return at
              ? makeAgent({ ...o, cwd: at.directory }, at)
              : Promise.reject(new Error(`Unknown workspace: ${id}`));
          },
        },
      }),
    },
    config: {
      get: () =>
        gate.configFails-- > 0
          ? Promise.reject(new Error("socket reconnecting"))
          : Promise.resolve({
              config: {
                plugins: { seatworks: { source: "directory", path: pluginDir } },
                agentProfiles: held,
              },
            }),
      patch: (change: { agentProfiles?: Held[] }) => {
        patches.push(change);
        if (change.agentProfiles) held.splice(0, held.length, ...change.agentProfiles);
        return Promise.resolve({ config: { agentProfiles: held } });
      },
    },
    providers: {
      listModels: (asked: string) => {
        const models = providers.get(asked);
        return models
          ? Promise.resolve({ provider: asked, models: models.map((model) => ({ provider: asked, ...model })) })
          : Promise.resolve({ provider: asked, error: `no provider named ${asked}` });
      },
      listAvailable: () =>
        gate.providersFail
          ? Promise.reject(new Error("provider discovery timed out"))
          : Promise.resolve({
              providers: [
                ...[...providers.keys()].map((found) => ({ provider: found, available: true })),
                { provider: "not-installed", available: false, error: "its command is not on PATH" },
              ],
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
      // An agent made with a folder alone gets a workspace of that folder, under a project of that very folder.
      create: (o: Asked) => makeAgent(o, workspaceAt(o.cwd, null)),
      ref,
    },
  };
  /** The agent's turn is over, as far as Paseo knows; the test tells the plugin with the hook Paseo would send. */
  const endTurn = (host: string) => inTurn.delete(host);
  return {
    api: api as unknown as PaseoApi,
    held,
    providers,
    patches,
    created,
    sent,
    archived,
    gate,
    projects,
    workspaces,
    pending,
    responded,
    timelines,
    endTurn,
  };
}
