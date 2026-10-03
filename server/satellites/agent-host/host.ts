import type {
  PaseoAgentConfig,
  PaseoAgentListResult,
  PaseoApi,
  PaseoWorkspace,
  PaseoWorkspaceListResult,
} from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { PaseoLink } from "./paseo-link.ts";
import { TEAM_SERVER } from "../../../shared/contracts/ids.ts";
import type { Server } from "../../../shared/contracts/profile.ts";
import { withPlaces } from "../../core/home.ts";

/** What an agent is started with; the agent host's own words, naming nothing of SLP (PORTS.md, Agent host). */
export type AgentSpec = {
  /** Unique for the whole host: one agent is made for it, however often it is asked. */
  readonly key: string;
  /** The id the first prompt is sent under, which the host gives back on that message in the agent's history. */
  readonly promptId: string;
  readonly title: string;
  readonly profile: string;
  /** What this agent runs in place of what its profile runs; what is left out is the profile's. */
  readonly runs: Partial<Runs>;
  readonly cwd: string;
  /** The repository the agent works on: Paseo lists the agent under that repository's project, wherever its folder is. */
  readonly projectRoot: string;
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
  /** The repository's git directory, which a harness file names `{git}`: a writer's sandbox must let it be written. */
  readonly gitDir: string;
  /** MCP servers beside the team's own, each with the tools of it the agent may call without being asked. */
  readonly servers: readonly {
    readonly name: string;
    readonly tools: readonly string[];
    readonly server: Server;
  }[];
};

export type Harness = {
  always: Partial<PaseoAgentConfig>;
  writes: Partial<PaseoAgentConfig>;
  reads: Partial<PaseoAgentConfig>;
  /** What the agent's process is given beside the seat's own environment, such as the home Seatworks lays out for it. */
  env: Readonly<Record<string, string>>;
  /** Whether Paseo takes MCP servers and pre-approved tools for this provider; if not, its home gives it the team's. */
  servers: boolean;
};
export type Unavailable = { unavailable: true };
/** An agent profile the Human keeps in Paseo: what a role's model may call it by, and what it runs. */
export type Kept = {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly model: string | null;
  readonly effort: string | null;
};

/** A model a provider has: the efforts it may think at, and the one it starts on. */
export type Model = {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly efforts: readonly { readonly id: string; readonly label: string }[];
  readonly defaultEffort: string | null;
};

/** What an agent profile runs: a provider, a model of it, and an effort or the model's own. */
export type Runs = { readonly provider: string; readonly model: string; readonly effort: string | null };

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A path as it really is, so two spellings of one folder are told to be one. */
const real = (path: string): string => (existsSync(path) ? realpathSync(path) : resolve(path));

const UNAVAILABLE: Unavailable = { unavailable: true };

/** The agent host on Paseo: the one place, with the bridge, that imports `@getpaseo/*` (PASEO.md rule 1). */
export class PaseoHost {
  private readonly link: PaseoLink;
  private readonly harness: (provider: string) => Harness | null;

  constructor(link: PaseoLink, harness: (provider: string) => Harness | null) {
    this.link = link;
    this.harness = harness;
  }

  /** Starts an agent from a Paseo agent profile; a retry or a throw first looks for the agent its labels name. */
  async create(spec: AgentSpec): Promise<{ host: string } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const made = await this.made(api, spec.labels);
    if (made) return made;
    const daemon = await api.config.get();
    const profile = (daemon.config.agentProfiles ?? []).find((p) => p.id === spec.profile || p.name === spec.profile);
    if (!profile) return { failed: `no Paseo agent profile named ${spec.profile}: add one in Paseo's settings` };
    const provider = spec.runs.provider ?? profile.provider;
    const model = spec.runs.model ?? profile.model;
    // Paseo makes no agent of a provider alone, and says so in words no Human can act on.
    if (!model)
      return { failed: `the Paseo agent profile ${profile.name} names no model: give it one on Seatworks' page` };
    const effort = spec.runs.effort === undefined ? profile.thinkingOptionId : spec.runs.effort;
    const harness = this.harness(provider);
    const outside = spec.servers.map((given) => given.name);
    if (outside.length > 0 && harness?.servers === false)
      return { failed: `an agent of ${provider} cannot be given the outside server ${outside.join(", ")}` };
    // A mode and feature values are one provider's own: on another they name nothing.
    const kept = provider === profile.provider ? profile : null;
    const base: Json = {
      provider: `${provider}/${model}`,
      ...(kept?.modeId ? { modeId: kept.modeId } : {}),
      ...(effort ? { thinkingOptionId: effort } : {}),
      ...(kept?.featureValues ? { featureValues: kept.featureValues } : {}),
    };
    const added = mergeAll(harness?.always ?? {}, (spec.writes ? harness?.writes : harness?.reads) ?? {});
    const shaped = mergeAll(base, withPlaces(added, { git: spec.gitDir }) as Json);
    // What a harness file adds is read as it is written; everything Seatworks sets itself is held to Paseo's types.
    const own = { ...(shaped as Pick<PaseoAgentConfig, "provider">), systemPrompt: spec.systemPrompt };
    // Paseo refuses a create that hands either to a provider it cannot hand them to: its home has the team's tools.
    const config: PaseoAgentConfig =
      harness?.servers === false
        ? own
        : {
            ...own,
            mcpServers: {
              ...Object.fromEntries(spec.servers.map((given) => [given.name, given.server])),
              // The team's tools are how the record is reached: never behind a tool search, however many a role is given.
              [TEAM_SERVER]: {
                type: "stdio",
                command: spec.tools.command,
                args: [...spec.tools.args],
                env: { ...spec.tools.env },
                alwaysLoad: true,
              },
            },
            toolPolicy: {
              preapproved: [
                ...spec.tools.names.map((tool) => ({ kind: "mcp" as const, server: TEAM_SERVER, tool })),
                ...spec.servers.flatMap((given) =>
                  given.tools.map((tool) => ({ kind: "mcp" as const, server: given.name, tool })),
                ),
              ],
            },
          };
    const workspace = await this.workspaceFor(api, spec);
    try {
      const handle = await api.workspaces.ref(workspace).agents.create({
        idempotencyKey: spec.key,
        title: spec.title,
        prompt: spec.prompt,
        clientMessageId: spec.promptId,
        env: { ...spec.env, ...harness?.env },
        labels: { ...spec.labels },
        config,
      });
      return { host: handle.id };
    } catch (error) {
      const says = error instanceof Error ? error.message : String(error);
      return (await this.made(api, spec.labels)) ?? { failed: `Paseo could not make the agent: ${says}` };
    }
  }

  /** The workspace Paseo keeps for an agent's folder under its repository's project: the one there, else one made there. */
  private async workspaceFor(api: PaseoApi, spec: Pick<AgentSpec, "projectRoot" | "cwd" | "title" | "key">) {
    // Told a folder alone, Paseo makes a project of that very folder: it would stand beside its own repository.
    const projectId = await this.projectOf(api, spec.projectRoot);
    const cwd = real(spec.cwd);
    const kept = (await this.workspacesAt(api, cwd, projectId))[0];
    if (kept) return kept.id;
    const made = await api.workspaces.create({
      idempotencyKey: `${spec.key}:workspace`,
      title: spec.title,
      source: { kind: "directory", path: spec.cwd, projectId },
    });
    return made.id;
  }

  /** The workspaces Paseo keeps for a folder and is not archiving, read page by page: it hands out 200 at most. */
  private async workspacesAt(api: PaseoApi, at: string, projectId?: string): Promise<PaseoWorkspace[]> {
    const found = [];
    let cursor: string | null = null;
    do {
      const page: PaseoWorkspaceListResult = await api.workspaces.list({
        ...(projectId === undefined ? {} : { filter: { projectId } }),
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
      });
      for (const one of page.entries) if (!one.archivingAt && real(one.workspaceDirectory) === at) found.push(one);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
    } while (cursor);
    return found;
  }

  /** The project Paseo keeps for a repository, by its id; one it keeps none for is opened there, as the Human adding it. */
  private async projectOf(api: PaseoApi, root: string): Promise<string> {
    const listed = (await api.projects.list()).projects.find((project) => real(project.projectRootPath) === real(root));
    const projectId = listed?.projectId ?? (await api.workspaces.open(root)).projectId;
    if (!projectId) throw new Error(`Paseo keeps no project for ${root}`);
    return projectId;
  }

  /** Has Paseo make a worktree of a repository for work handed out: a new branch off a base, or a branch there already. */
  async openWorktree(asked: {
    readonly key: string;
    readonly projectRoot: string;
    readonly title: string;
    readonly slug: string;
    readonly branch: string;
    /** What the new branch starts from; none where the branch is there already and is only checked out. */
    readonly base: string | null;
  }): Promise<{ path: string } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const projectId = await this.projectOf(api, asked.projectRoot);
    try {
      const made = await api.workspaces.create({
        idempotencyKey: asked.key,
        title: asked.title,
        source: {
          kind: "worktree",
          projectId,
          worktreeSlug: asked.slug,
          ...(asked.base === null
            ? { action: "checkout", refName: asked.branch }
            : { action: "branch-off", refName: asked.base, branchName: asked.branch }),
        },
      });
      return made.directory ? { path: made.directory } : { failed: "Paseo made a workspace with no folder" };
    } catch (error) {
      return { failed: `Paseo could not make the worktree: ${said(error)}` };
    }
  }

  /** Has Paseo archive the workspaces it keeps for a folder: their agents end, and a worktree it made is removed. */
  async closeWorktree(path: string): Promise<"done" | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const kept = await this.workspacesAt(api, real(path));
    if (kept.length === 0) return { failed: `Paseo keeps no workspace for ${path}` };
    for (const one of kept) {
      const archived = await api.workspaces.archive(one.id);
      if (archived.error !== null)
        return { failed: `Paseo did not archive the workspace of ${path}: ${archived.error}` };
    }
    return "done";
  }

  /** The agent profiles the Human keeps in Paseo: the id and name a role's model may call each by, and what it runs. */
  async agentProfiles(): Promise<readonly Kept[] | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    return ((await api.config.get()).config.agentProfiles ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      model: profile.model ?? null,
      effort: profile.thinkingOptionId ?? null,
    }));
  }

  /** The models a provider has, each with the efforts Paseo lists for it and the one it starts on. */
  async models(provider: string): Promise<{ models: readonly Model[] } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    try {
      const listed = await api.providers.listModels(provider);
      if (!listed.models)
        return { failed: `Paseo lists no model for ${provider}: ${listed.error ?? "it gave no reason"}` };
      return {
        models: listed.models.map((model) => ({
          id: model.id,
          label: model.label,
          isDefault: model.isDefault === true,
          efforts: (model.thinkingOptions ?? []).map(({ id, label }) => ({ id, label })),
          defaultEffort: model.defaultThinkingOptionId ?? null,
        })),
      };
    } catch (error) {
      return { failed: `Paseo did not list the models of ${provider}: ${said(error)}` };
    }
  }

  /** The providers Paseo finds on this machine, each one an agent can be started on; none where it cannot say. */
  async providers(): Promise<readonly string[] | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    try {
      const found = await api.providers.listAvailable();
      return found.providers.filter((one) => one.available).map((one) => one.provider);
    } catch {
      // Paseo finds its providers lazily and may fail to: what reads beside them, such as a matching, still reads.
      return [];
    }
  }

  /** Adds agent profiles of these names to Paseo, each running one model; a name it holds is left as the Human shaped it. */
  async addProfiles(
    names: readonly string[],
    runs: Runs,
  ): Promise<{ added: readonly string[] } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const held = (await api.config.get()).config.agentProfiles ?? [];
    const known = new Set(held.flatMap((profile) => [profile.id, profile.name]));
    const added = names.filter((name) => !known.has(name));
    if (added.length === 0) return { added };
    const made = added.map((name) => ({
      id: name,
      name,
      provider: runs.provider,
      model: runs.model,
      ...(runs.effort === null ? {} : { thinkingOptionId: runs.effort }),
    }));
    try {
      // Paseo takes the list whole and not as a merge, so what it holds goes back with what is added.
      await api.config.patch({ agentProfiles: [...held, ...made] });
    } catch (error) {
      return { failed: `Paseo did not take the agent profiles: ${said(error)}` };
    }
    return { added };
  }

  /** Gives one agent profile the Human keeps another provider, model and effort; every other profile stays as it is. */
  async shapeProfile(named: string, runs: Runs): Promise<{ shaped: true } | { failed: string } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const held = (await api.config.get()).config.agentProfiles ?? [];
    if (!held.some((profile) => profile.id === named || profile.name === named))
      return { failed: `Paseo has no agent profile named ${named}` };
    const shaped = held.map((profile) => {
      if (profile.id !== named && profile.name !== named) return profile;
      const { thinkingOptionId: _effort, modeId, featureValues, ...rest } = profile;
      return {
        ...rest,
        // A mode and feature values are one provider's own: they go when the provider does.
        ...(runs.provider === profile.provider && modeId !== undefined ? { modeId } : {}),
        ...(runs.provider === profile.provider && featureValues !== undefined ? { featureValues } : {}),
        provider: runs.provider,
        model: runs.model,
        ...(runs.effort === null ? {} : { thinkingOptionId: runs.effort }),
      };
    });
    try {
      await api.config.patch({ agentProfiles: shaped });
    } catch (error) {
      return { failed: `Paseo did not take the change to ${named}: ${said(error)}` };
    }
    return { shaped: true };
  }

  /** The agent a create with these labels made, if one did. */
  private async made(
    api: PaseoApi,
    labels: Readonly<Record<string, string>>,
  ): Promise<{ host: string } | { failed: string } | null> {
    const found = await api.agents.list({
      filter: { labels: { ...labels }, includeArchived: true },
      page: { limit: 1 },
    });
    const known = found.entries[0]?.agent;
    if (!known) return null;
    return known.archivedAt ? { failed: "its agent was archived before it started" } : { host: known.id };
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

  /** What an agent is doing now, for catching up on what its hooks said while the plugin was not there to hear. */
  async now(host: string): Promise<{ gone: boolean; permissions: { id: string; text: string }[] } | Unavailable> {
    const api = this.link.current;
    if (!api) return UNAVAILABLE;
    const fetched = await api.agents.ref(host).refresh();
    if (!fetched || fetched.agent.archivedAt) return { gone: true, permissions: [] };
    return {
      gone: false,
      permissions: fetched.agent.pendingPermissions.map((p) => ({ id: p.id, text: permissionText(p) })),
    };
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
    // The end Paseo gives when none is named is its own to change: the newest turns are asked for by name.
    const page = await api.agents.ref(host).timeline.refetch({ limit: last, direction: "tail" });
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

/** A permission request as its answerer reads it: what it is, what it says, and the call it would allow. */
export function permissionText(r: {
  readonly name: string;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly input?: unknown;
}): string {
  return [r.title ?? r.name, r.description, r.input ? JSON.stringify(r.input).slice(0, 2000) : undefined]
    .filter(Boolean)
    .join(" · ");
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
