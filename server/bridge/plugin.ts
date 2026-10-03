import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { Caller, CommandBody } from "../../shared/contracts/commands.ts";
import { PROJECT_LABEL, ROOT } from "../../shared/contracts/ids.ts";
import { isUnseen, mayLook, standsAbove } from "../../shared/kernel/authority.ts";
import type { ReadArgs, ReadName } from "../../shared/contracts/tools.ts";
import { activityLine } from "../../shared/views/activity.ts";
import { mapText } from "../../shared/views/docs.ts";
import {
  type Chain,
  type Signals,
  chainOf,
  lookBackText,
  noRecord,
  scopeRecordText,
  signalsOf,
} from "../../shared/views/record.ts";
import type { Scope } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";
import type {
  Folder,
  HumanView,
  Leftover,
  Preset,
  ProfileAgents,
  ProjectAgent,
  ProjectTemplate,
  TemplateOffer,
  TemplateSource,
} from "../../shared/contracts/rpc.ts";
import { hostOf } from "../../shared/contracts/profile.ts";
import type { ReflexSettings } from "../../shared/contracts/settings.ts";
import { humanView } from "../../shared/views/human.ts";
import { statusText } from "../../shared/views/status.ts";
import { stuckOf } from "../../shared/views/stuck.ts";
import { type Home, type Places, layHome, withPlaces, withSkills } from "../core/home.ts";
import { KeyedQueue } from "../core/keyed-queue.ts";
import { Keys } from "../core/keys.ts";
import { daemonLog } from "../core/logger.ts";
import { sizeOf } from "../core/disk.ts";
import { archiveDir, projectDir } from "../core/paths.ts";
import { rulesDir } from "../core/rules.ts";
import { installMail, installShim } from "../core/shim.ts";
import { type Harness, type Model, PaseoHost, type Room, type Runs } from "../satellites/agent-host/host.ts";
import { PaseoLink } from "../satellites/agent-host/paseo-link.ts";
import { EvidenceRunner } from "../satellites/evidence/runner.ts";
import { MachineHolds } from "../satellites/machine/holds.ts";
import { ProjectStore } from "../satellites/store/project-store.ts";
import { turnOf } from "../satellites/agent-host/items.ts";
import { type Asker, Classifier } from "../satellites/reflex/classifier.ts";
import { loadReflex } from "../satellites/reflex/config.ts";
import { git } from "../satellites/workspace/git.ts";
import { createOnGitHub, githubLogin, publishedAt, remotesOf } from "../satellites/workspace/forge.ts";
import { commitAll, firstCommitOf, gitStateOf } from "../satellites/workspace/setup.ts";
import { Workspace } from "../satellites/workspace/workspace.ts";
import {
  agentsByProfile,
  agentsOf,
  lacking,
  match,
  type Matching,
  matchingFile,
  matchingOf,
} from "../profile/agents.ts";
import { keepOwn, ownFile, ownOf } from "../profile/own-runs.ts";
import { laidOver, type OwnRuns } from "../../shared/contracts/runs.ts";
import { type Bundle, loadBundle } from "../profile/bundle.ts";
import { install, offerOf } from "../profile/install.ts";
import { pin, pinnedDir, templateOf } from "../profile/pinned.ts";
import { listPresets } from "../profile/presets.ts";
import { listProfiles, type Listed as ListedProfile, removeProfile } from "../profile/profiles.ts";
import { Dispatcher } from "./dispatcher.ts";
import {
  type Wiring,
  handlersFor,
  intoTurn,
  keepMail,
  roomOf,
  scratchFor,
  seatDir,
  seatEnv,
  agentEnv,
} from "./effects.ts";
import { branchesOf, keepHeld } from "./lane.ts";
import { type Kept, leftoverId, leftoversOf, projectLeftover, refOf } from "./leftovers.ts";
import { Project, type Submitted } from "./project.ts";
import { Reflex, WORKS_ON } from "./reflex.ts";
import { type ProjectPort, TeamSocket } from "./team-socket.ts";

export const PLUGIN_ID = "seatworks";

/** A folder a team may be attached to: one of Paseo's projects or one given by its path, and how it stands with git. */
/** How long a check may run before it is killed with what it started. */
const CHECK_TIMEOUT_MS = 30 * 60 * 1000;
/** How often the plugin lets go of what long use leaves behind: idle projects in memory, settled outbox rows. */
const UPKEEP_MS = 60 * 60 * 1000;
/** A project with no agent seated and nothing pending for this long leaves memory; its next command folds it back. */
const IDLE_MS = 24 * 60 * 60 * 1000;
/** How long a hook Paseo waits on gives the plugin to start: under its 30 s hook timeout, so the action still goes on. */
const READY_WAIT_MS = 20_000;

type Runtime = {
  project: Project;
  store: ProjectStore;
  dispatcher: Dispatcher;
  workspace: Workspace;
  evidence: EvidenceRunner;
  wiring: Wiring;
  /** What the project runs of its profile, replaced whole when it takes the files anew. */
  loaded: Loaded;
  stops: (() => void)[];
  lastActive: number;
};
/** A profile's files as a project runs them: the bundle and its reflex. */
type Loaded = { bundle: Bundle; reflex: Reflex | null };
/** A project's own file: its repository, its profile's name, and the hash of the copy of it the project runs. */
type ProjectFile = { readonly repo: string; readonly profile: string; readonly hash: string };
type Ready = {
  dir: string;
  host: PaseoHost;
  shimDir: string;
  socket: TeamSocket;
  socketPath: string;
};

/** A project's own file; one attached before a project kept its own copy of its template is attached again. */
function keptIn(dir: string, id: string): ProjectFile {
  const kept = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")) as Partial<ProjectFile>;
  if (kept.repo === undefined || kept.profile === undefined || kept.hash === undefined)
    throw new Error(
      `project ${id} was attached before a project kept its own copy of its template: remove it and attach it again`,
    );
  return { repo: kept.repo, profile: kept.profile, hash: kept.hash };
}

function keep(dir: string, kept: ProjectFile): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify(kept));
}

/** A project's id: made from where its repository really is, so one repository is one project. */
const projectIdOf = (real: string) => createHash("sha256").update(real).digest("hex").slice(0, 12);

/** What the surface is told when it asks of Paseo's agent profiles before Paseo's API is in hand. */
const UNREACHED = "Paseo's API has not arrived; try again in a moment";

/** Words a delivery or a first prompt carried: their client message ids are the plugin's effect keys. */
const OURS = /^\d+:/;

/** The bridge, the only place that builds the whole: Paseo's hooks in as facts, effects out to their satellites. */
export class Plugin {
  readonly link = new PaseoLink();
  private readonly root: string;
  private readonly keys: Keys;
  private readonly harnesses = new Map<string, HarnessFile | null>();
  private readonly holds: MachineHolds;
  private readonly runtimes = new Map<string, Runtime>();
  private readonly byHost = new Map<string, { project: string; actor: string }>();
  private readonly turns = new KeyedQueue<string>();
  private ready: Promise<Ready> | null = null;
  /** Nothing is asked until the Human's settings are read. */
  private asks: ReflexSettings = { on: false, host: "", key: "" };
  /** Per project, what its reflex cannot ask by and the Human did not choose so. */
  private readonly alarms = new Map<string, string>();
  private readyNow: Ready | null = null;
  private disposed = false;
  private readonly upkeep: NodeJS.Timeout;

  constructor(stateRoot: string) {
    this.root = stateRoot;
    mkdirSync(stateRoot, { recursive: true });
    this.keys = new Keys(join(stateRoot, "secret"));
    this.holds = new MachineHolds(join(stateRoot, "machine.db"));
    this.upkeep = setInterval(() => {
      this.tidy(Date.now()).catch((error: unknown) => {
        daemonLog.error("seatworks could not tidy up", error);
      });
    }, UPKEEP_MS);
    this.upkeep.unref();
    this.link.onReady(() => {
      void this.whenReady()
        .then((ready) => this.reconcile(ready))
        .catch((error: unknown) => {
          daemonLog.error("seatworks could not start", error);
        });
    });
  }

  /** Names already settled for an agent: in its brief, its parent's plan, or code of the base or its own that is no test. */
  private async settledNames(
    project: string,
    actorId: string,
    names: readonly string[],
    tests: RegExp,
  ): Promise<ReadonlySet<string>> {
    const runtime = this.runtimes.get(project);
    const view = runtime?.project.view;
    const actor = view?.actors.get(actorId);
    const scope = actor ? view?.scopes.get(actor.scope) : undefined;
    if (!runtime || !view || !scope) return new Set(names);
    const parent = scope.parent ? view.scopes.get(scope.parent) : undefined;
    const lines = [
      ...(scope.brief
        ? [scope.brief.goal, ...scope.brief.constraints, ...scope.brief.choices, ...scope.brief.context]
        : []),
      ...(parent?.plan ? [parent.plan.goal, ...parent.plan.limits, ...parent.plan.unknowns.map((u) => u.line)] : []),
    ].map((l) => l.text);
    const words = new Set(lines.join(" ").split(/[^A-Za-z0-9_]+/));
    const settled = new Set(names.filter((n) => words.has(n)));
    const rest = names.filter((n) => !settled.has(n));
    for (const n of await runtime.workspace.namesIn(runtime.workspace.repo, parent?.branch ?? "HEAD", rest, tests))
      settled.add(n);
    // The root writes nothing of its own; every other scope's code is in the worktree it works in.
    const own = scope.id === ROOT ? null : await seatDir(runtime.wiring, view, scope);
    if (own !== null && existsSync(own))
      for (const n of await runtime.workspace.namesIn(own, null, rest, tests)) settled.add(n);
    return settled;
  }

  /** Whether a classifier is asked on this machine and the host its key is for; the key is kept here only, never logged. */
  setReflex(asks: ReflexSettings): void {
    this.asks = asks;
    this.alarms.clear();
  }

  /** A standing alarm for the Human on one project, such as its classifier having no key; null when all is well. */
  alarmOf(project: string): string | null {
    return this.alarms.get(project) ?? null;
  }

  /** Paseo's API from a hook or a panel call; the first one starts everything that needs the plugin's own files. */
  saw(api: PaseoApi): void {
    this.link.set(api);
  }

  /** The plugin started; a start that failed is forgotten, so the next hook or call tries again. */
  whenReady(): Promise<Ready> {
    this.ready ??= this.start().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async start(): Promise<Ready> {
    const api = this.link.current;
    if (!api) throw new Error("Paseo's API has not arrived");
    const plugins = (await api.config.get()).config.plugins ?? {};
    const dir = plugins[PLUGIN_ID]?.path;
    if (!dir) throw new Error(`Paseo's config has no plugins.${PLUGIN_ID} with a path`);
    const host = new PaseoHost(this.link, (provider, room) => this.harness(provider, room));
    const shimDir = installShim(this.root, join(dir, "bin", "git-shim.ts"));
    installMail(shimDir, join(dir, "bin", "mail.ts"));
    const socketPath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\seatworks-${createHash("sha256").update(this.root).digest("hex").slice(0, 16)}`
        : join(this.root, "team.sock");
    const socket = new TeamSocket(socketPath, this.keys, (id) => this.port(id));
    await socket.listen();
    const ready: Ready = { dir, host, shimDir, socket, socketPath };
    this.readyNow = ready;
    const projects = join(this.root, "projects");
    for (const id of existsSync(projects) ? readdirSync(projects) : [])
      if (existsSync(join(projects, id, "project.json")))
        try {
          this.open(id, ready);
        } catch (error) {
          // One project that cannot open, such as a log this code no longer folds, leaves the others working.
          daemonLog.error(`seatworks could not open project ${id}`, error);
        }
    return ready;
  }

  /** Takes the installed template's files for a project anew; agents seated from then on are made from them. */
  async syncTemplate(project: string): Promise<{ ok: true; says: string } | { ok: false; says: string }> {
    await this.whenReady();
    const dir = projectDir(this.root, project);
    if (!existsSync(join(dir, "project.json"))) return { ok: false, says: `no project ${project} is attached` };
    const kept = keptIn(dir, project);
    const pinned = pin(this.root, dir, kept.profile);
    if (!pinned.ok) return pinned;
    keep(dir, { ...kept, hash: pinned.hash });
    const runtime = this.runtimes.get(project);
    if (runtime) {
      runtime.loaded = this.load(project, pinnedDir(dir, pinned.hash));
      runtime.project.use(runtime.loaded.bundle.profile);
      await this.recordProfile(runtime);
    }
    return { ok: true, says: `runs ${kept.profile} as it is installed now (${pinned.hash})` };
  }

  /** Removes an installed template from this machine; projects run their own copies of it and go on. */
  removeTemplate(name: string): { ok: true } | { ok: false; says: string } {
    return removeProfile(this.root, name)
      ? { ok: true }
      : { ok: false, says: `no template named ${name} is installed` };
  }

  /** The profiles a project may be attached with: each the Human installed. */
  profiles(): ListedProfile[] {
    return listProfiles(this.root);
  }

  /** The templates that come with the plugin, each with whether it is installed as it comes. */
  async presets(): Promise<Preset[]> {
    return listPresets((await this.whenReady()).dir, this.root);
  }

  /** What installing a template would bring; with `agreed`, the hash of that offer, it is installed. */
  async template(
    from: TemplateSource,
    agreed: string | null,
  ): Promise<{ ok: true; offer: TemplateOffer } | { ok: false; says: string }> {
    const ready = await this.whenReady();
    const has = await ready.host.agentProfiles();
    if ("unavailable" in has) return { ok: false, says: UNREACHED };
    const where = { pluginDir: ready.dir, stateRoot: this.root, env: process.env };
    return agreed === null ? offerOf(where, from, has) : install(where, from, agreed, has);
  }

  /** What each profile's agent profiles run on here; with `matched`, that profile's matching is kept first. */
  async agents(
    matched: { readonly profile: string; readonly matching: Matching } | null,
  ): Promise<
    { ok: true; profiles: ProfileAgents[]; available: string[]; providers: string[] } | { ok: false; says: string }
  > {
    const { host } = await this.whenReady();
    const [has, providers] = await Promise.all([host.agentProfiles(), host.providers()]);
    if ("unavailable" in has || "unavailable" in providers) return { ok: false, says: UNREACHED };
    if (matched !== null) {
      const kept = match(this.root, matched.profile, matched.matching, has);
      if (!kept.ok) return kept;
    }
    return {
      ok: true,
      profiles: agentsByProfile(this.root, has),
      available: has.map((p) => p.name),
      providers: [...providers],
    };
  }

  /** The models a provider has, as Paseo lists them. */
  async models(provider: string): Promise<{ ok: true; models: readonly Model[] } | { ok: false; says: string }> {
    const read = await (await this.whenReady()).host.models(provider);
    if ("unavailable" in read) return { ok: false, says: UNREACHED };
    return "failed" in read ? { ok: false, says: read.failed } : { ok: true, models: read.models };
  }

  /** Why a provider cannot run this model at this effort, or null when it can. */
  private async unfit(runs: Runs): Promise<string | null> {
    const read = await this.models(runs.provider);
    if (!read.ok) return read.says;
    const model = read.models.find((one) => one.id === runs.model);
    if (!model) return `${runs.provider} has no model named ${runs.model}`;
    return runs.effort === null || model.efforts.some((one) => one.id === runs.effort)
      ? null
      : `${runs.model} has no effort named ${runs.effort}`;
  }

  /** Makes in Paseo, on the Human's word, an agent profile for each name a profile gives that Paseo has none for. */
  async createAgents(
    profile: string,
    provider: string,
    model: string,
    effort: string | null,
  ): Promise<{ ok: true; made: readonly string[] } | { ok: false; says: string }> {
    const { host } = await this.whenReady();
    const [has, providers] = await Promise.all([host.agentProfiles(), host.providers()]);
    if ("unavailable" in has || "unavailable" in providers) return { ok: false, says: UNREACHED };
    const lacks = lacking(this.root, profile, has);
    if (!lacks.ok) return lacks;
    if (!providers.includes(provider))
      return { ok: false, says: `Paseo finds no provider named ${provider} on this machine` };
    const runs = { provider, model, effort };
    const unfit = await this.unfit(runs);
    if (unfit !== null) return { ok: false, says: unfit };
    if (lacks.names.length === 0) return { ok: true, made: [] };
    const added = await host.addProfiles(lacks.names, runs);
    if ("unavailable" in added) return { ok: false, says: UNREACHED };
    if ("failed" in added) return { ok: false, says: added.failed };
    // A name that stood for a profile since removed now stands for the one of its own name, which Paseo holds.
    const named = lacks.names.map((name) => ({ id: name, name }));
    const kept = match(this.root, profile, lacks.matching, [...has, ...named]);
    return kept.ok ? { ok: true, made: added.added } : kept;
  }

  /** Gives one of the Human's agent profiles another provider, model and effort: ones Paseo finds here and lists. */
  async shapeAgent(agent: string, runs: Runs): Promise<{ ok: true } | { ok: false; says: string }> {
    const { host } = await this.whenReady();
    const [has, providers] = await Promise.all([host.agentProfiles(), host.providers()]);
    if ("unavailable" in has || "unavailable" in providers) return { ok: false, says: UNREACHED };
    const held = has.find((profile) => profile.id === agent || profile.name === agent);
    if (!held) return { ok: false, says: `Paseo has no agent profile named ${agent}` };
    // The provider a profile already runs on is kept even where Paseo cannot say which it finds.
    if (runs.provider !== held.provider && !providers.includes(runs.provider))
      return { ok: false, says: `Paseo finds no provider named ${runs.provider} on this machine` };
    const unfit = await this.unfit(runs);
    if (unfit !== null) return { ok: false, says: unfit };
    const shaped = await host.shapeProfile(agent, runs);
    if ("unavailable" in shaped) return { ok: false, says: UNREACHED };
    return "failed" in shaped ? { ok: false, says: shaped.failed } : { ok: true };
  }

  /** What each name of a project's template runs in it: the Human's profile, and the project's own, kept first when given. */
  async projectAgents(
    project: string,
    own: { readonly agent: string; readonly runs: OwnRuns | null } | null,
  ): Promise<
    { ok: true; agents: ProjectAgent[]; providers: string[]; problem: string | null } | { ok: false; says: string }
  > {
    const ready = await this.whenReady();
    const dir = projectDir(this.root, project);
    if (!existsSync(join(dir, "project.json"))) return { ok: false, says: `no project ${project} is attached` };
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    const [has, providers] = await Promise.all([ready.host.agentProfiles(), ready.host.providers()]);
    if ("unavailable" in has || "unavailable" in providers) return { ok: false, says: UNREACHED };
    const matched = matchingOf(runtime.wiring.agents);
    const agents = agentsOf(runtime.loaded.bundle, matched.ok ? matched.matching : {}, has);
    if (own !== null) {
      const named = agents.find((agent) => agent.name === own.agent);
      if (!named) return { ok: false, says: `${own.agent} is not an agent profile this project's template names` };
      if (own.runs !== null) {
        const { provider, model, effort } = laidOver(named, own.runs);
        if (provider === null)
          return { ok: false, says: `Paseo has no agent profile named ${named.runsOn} to run ${own.agent} on` };
        if (model === null)
          return {
            ok: false,
            says: `the Paseo agent profile ${named.runsOn} names no model: pick one with the effort`,
          };
        if (provider !== named.provider && !providers.includes(provider))
          return { ok: false, says: `Paseo finds no provider named ${provider} on this machine` };
        const unfit = await this.unfit({ provider, model, effort });
        if (unfit !== null) return { ok: false, says: unfit };
      }
      keepOwn(runtime.wiring.own, own.agent, own.runs);
    }
    const kept = ownOf(runtime.wiring.own);
    return {
      ok: true,
      agents: agents.map((agent) => ({ ...agent, own: kept.ok ? (kept.own[agent.name] ?? null) : null })),
      providers: [...providers],
      problem: kept.ok ? (matched.ok ? null : matched.says) : kept.says,
    };
  }

  /** The profile a repository would be attached with: the one named, or the only one installed; null once attached. */
  attaching(
    repo: string,
    named: string | undefined,
  ): { ok: true; profile: string | null } | { ok: false; says: string } {
    if (existsSync(join(projectDir(this.root, projectIdOf(realpathSync(repo))), "project.json")))
      return { ok: true, profile: null };
    const installed = listProfiles(this.root).map((listed) => listed.name);
    if (named !== undefined)
      return installed.includes(named)
        ? { ok: true, profile: named }
        : { ok: false, says: `no profile named ${named} is installed` };
    if (installed.length === 1) return { ok: true, profile: installed[0]! };
    return {
      ok: false,
      says:
        installed.length === 0
          ? "no template is installed: install one on Seatworks' page, under Templates"
          : "more than one template is installed: attach from Seatworks' page, which asks which",
    };
  }

  /** Opens a project with the profile named and starts its root's agent; one already attached keeps its profile. */
  async openProject(
    repo: string,
    base: string | undefined,
    named?: string,
  ): Promise<{ project: string; outcome: Submitted; note: string | null }> {
    const ready = await this.whenReady();
    const real = realpathSync(repo);
    const branch = base ?? (await currentBranch(real));
    const picked = this.attaching(real, named);
    if (!picked.ok) throw new Error(picked.says);
    const id = projectIdOf(real);
    const dir = projectDir(this.root, id);
    if (picked.profile !== null) {
      const pinned = pin(this.root, dir, picked.profile);
      if (!pinned.ok) throw new Error(pinned.says);
      keep(dir, { repo: real, profile: picked.profile, hash: pinned.hash });
    }
    const runtime = this.open(id, ready);
    const bundle = runtime.wiring.bundle;
    const outcome = await this.submitAs(
      runtime,
      { kind: "human" },
      {
        type: "open_project",
        base: branch,
        remote: await publishedAt(real),
        profile: runtime.wiring.profile,
        profileHash: bundle.hash,
        model: [...bundle.profile.root.models][0] ?? "",
      },
    );
    // Attaching again writes a note that waited, on the base the project opened with.
    const opened = runtime.project.view.scopes.get(ROOT)?.branch;
    const note = opened ? (await this.writeNote(runtime, opened)).text : null;
    return { project: id, outcome, note };
  }

  /** Commits the profile's note to the project's instruction file on its base, or takes it out; says what came of it. */
  private async writeNote(
    runtime: Runtime,
    base: string,
    remove = false,
  ): Promise<{ ok: boolean; text: string | null }> {
    const { workspace, wiring } = runtime;
    const note = wiring.bundle.project;
    if (!note) return { ok: true, text: null };
    const body = remove
      ? null
      : note.note.replaceAll("{branches}", branchesOf(wiring.project)).replaceAll("{base}", base);
    const message = remove
      ? `Take the ${PLUGIN_ID} note out of ${note.file}`
      : `Tell every agent here how the ${PLUGIN_ID} team works`;
    const put = await workspace.putBlock(base, note.file, PLUGIN_ID, body, message);
    if ("refused" in put) return { ok: false, text: `${note.file} was left as it is: ${put.refused}` };
    return { ok: true, text: "sha" in put ? `${note.file} on ${base}: committed ${put.sha.slice(0, 12)}.` : null };
  }

  /** A command from the Human's surface. */
  async human(project: string, body: CommandBody): Promise<Submitted> {
    const ready = await this.whenReady();
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    return this.submitAs(runtime, { kind: "human" }, body);
  }

  /** Every project the plugin keeps, open in memory or not. */
  projects(): { id: string; repo: string; open: boolean; profile: string | null }[] {
    const dir = join(this.root, "projects");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((id) => {
      const file = join(dir, id, "project.json");
      if (!existsSync(file)) return [];
      const { repo, profile } = JSON.parse(readFileSync(file, "utf8")) as { repo: string; profile?: string };
      return [{ id, repo, open: this.runtimes.has(id), profile: profile ?? null }];
    });
  }

  /** Whether a folder is inside the plugin's own state, such as the scratch a watch works in. */
  private keeps(real: string): boolean {
    const own = realpathSync(this.root);
    return real === own || real.startsWith(`${own}/`) || real.startsWith(`${own}\\`);
  }

  /** Paseo's projects no team is attached to yet, each with how it stands with git, for the Human to attach one. */
  async unattached(): Promise<Folder[]> {
    const api = this.link.current;
    if (!api) return [];
    const attached = new Set(this.projects().map((p) => p.repo));
    const listed = await api.projects.list();
    const found: Folder[] = [];
    for (const p of listed.projects) {
      if (!existsSync(p.projectRootPath)) continue;
      const root = realpathSync(p.projectRootPath);
      // What the plugin keeps for itself is no folder of the Human's to attach a team to.
      if (attached.has(root) || this.keeps(root) || found.some((one) => one.root === root)) continue;
      found.push({ name: p.projectDisplayName, root, ...(await gitStateOf(root)) });
    }
    return found;
  }

  /** A folder given by its path, as one of Paseo's projects is offered; one that is none, or has a team, says so. */
  async folderAt(dir: string): Promise<{ ok: true; folder: Folder } | { ok: false; says: string; folder?: never }> {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return { ok: false, says: `there is no folder at ${dir}` };
    const root = realpathSync(dir);
    if (this.projects().some((p) => p.repo === root)) return { ok: false, says: `${root} already has a team` };
    if (this.keeps(root)) return { ok: false, says: `${root} is a folder Seatworks keeps for itself` };
    return { ok: true, folder: { name: basename(root), root, ...(await gitStateOf(root)) } };
  }

  /** What a first commit of a folder would hold, once it is made a repository: read before the Human agrees to one. */
  async gitOffer(dir: string): Promise<{ ok: true; files: number; ignores: boolean } | { ok: false; says: string }> {
    const at = await this.folderAt(dir);
    if (!at.ok) return at;
    const offer = await firstCommitOf(at.folder.root);
    return "refused" in offer ? { ok: false, says: offer.refused } : { ok: true, ...offer };
  }

  /** Makes a folder a repository with one commit of what it holds, the Human's own, so a team can be attached. */
  async setUpGit(dir: string): Promise<{ ok: true } | { ok: false; says: string }> {
    const offer = await this.gitOffer(dir);
    if (!offer.ok) return offer;
    const made = await commitAll(realpathSync(dir));
    return "refused" in made ? { ok: false, says: made.refused } : { ok: true };
  }

  /** What every project's team left behind, and each project itself, for the Human to pick from. */
  async leftovers(): Promise<Leftover[]> {
    const ready = await this.whenReady();
    const found: Leftover[] = [];
    const dir = join(this.root, "projects");
    for (const id of existsSync(dir) ? readdirSync(dir) : []) {
      const file = join(dir, id, "project.json");
      if (!existsSync(file)) {
        found.push({
          id: leftoverId("project", id, ""),
          kind: "project",
          project: id,
          label: join(dir, id),
          why: "a folder with no project in it",
          removable: true,
          unmerged: 0,
          bytes: await sizeOf(join(dir, id)),
          at: null,
        });
        continue;
      }
      const { repo } = JSON.parse(readFileSync(file, "utf8")) as { repo: string };
      const agents = await ready.host.labelled({ [PROJECT_LABEL]: id });
      const kept: readonly Kept[] = "unavailable" in agents ? [] : agents;
      if (!existsSync(repo)) {
        found.push(projectLeftover(id, repo, null, await sizeOf(join(dir, id))));
        continue;
      }
      const runtime = this.runtimes.get(id) ?? this.open(id, ready);
      found.push(
        ...(await leftoversOf(id, runtime.project.view, runtime.workspace, kept)),
        // Not measured: an attached project is removed from its own page, and its worktrees in use are no leftover.
        projectLeftover(id, repo, runtime.project.view, null),
      );
    }
    const shelf = archiveDir(this.root);
    for (const name of existsSync(shelf) ? readdirSync(shelf) : []) {
      const file = join(shelf, name, "project.json");
      const { repo, removedAt } = existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as { repo?: string; removedAt?: string })
        : {};
      found.push({
        id: leftoverId("record", name, ""),
        kind: "record",
        project: name,
        label: repo ?? join(shelf, name),
        why: `the record of a project removed${removedAt ? ` on ${removedAt.slice(0, 10)}` : ""}: removing deletes it for good`,
        removable: true,
        unmerged: 0,
        bytes: await sizeOf(join(shelf, name)),
        at: removedAt ?? null,
      });
    }
    return found;
  }

  /** Where a project's repository is published, and the account that could put it on GitHub from here. */
  async remoteOf(
    project: string,
  ): Promise<
    | { ok: true; remotes: { name: string; at: string }[]; github: string | null; name: string }
    | { ok: false; says: string }
  > {
    const kept = this.projects().find((p) => p.id === project);
    if (!kept) return { ok: false, says: `no project ${project} is attached` };
    return { ok: true, remotes: await remotesOf(kept.repo), github: await githubLogin(), name: basename(kept.repo) };
  }

  /** Puts a project with no remote on GitHub, on the Human's word, and publishes its base there. */
  async createRemote(
    project: string,
    visibility: "private" | "public",
  ): Promise<{ ok: true; url: string } | { ok: false; says: string }> {
    const at = await this.remoteOf(project);
    if (!at.ok) return at;
    if (at.remotes.length > 0)
      return { ok: false, says: `it already has a remote, ${at.remotes.map((remote) => remote.name).join(", ")}` };
    if (at.github === null) return { ok: false, says: "GitHub's command line, gh, is not signed in on this machine" };
    const repo = this.projects().find((p) => p.id === project)!.repo;
    const made = await createOnGitHub(repo, at.name, visibility);
    if ("refused" in made) return { ok: false, says: made.refused };
    // The base is pushed as any publish is, so the record holds where the project is published from now on.
    const pushed = await this.human(project, { type: "publish", remote: "origin" });
    return pushed.ok ? { ok: true, url: made.created } : { ok: false, says: pushed.refused.says };
  }

  /** Removes what the Human picked, each checked again against what is left over now. */
  async clean(ids: readonly string[]): Promise<{ id: string; ok: boolean; text: string }[]> {
    const now = new Map((await this.leftovers()).map((l) => [l.id, l]));
    const picked = [...new Set(ids)].sort(
      (a, b) => Number(a.startsWith("project:")) - Number(b.startsWith("project:")),
    );
    const results = [];
    for (const id of picked) {
      const item = now.get(id);
      if (!item) results.push({ id, ok: false, text: "It is no longer left over." });
      else if (!item.removable) results.push({ id, ok: false, text: item.why });
      else results.push({ id, ...(await this.removeLeftover(item)) });
    }
    return results;
  }

  private async removeLeftover(item: Leftover): Promise<{ ok: boolean; text: string }> {
    if (item.kind === "project") return this.removeProject(item.project);
    if (item.kind === "record") {
      rmSync(join(archiveDir(this.root), item.project), { recursive: true, force: true });
      return { ok: true, text: `Deleted the record of ${item.label}.` };
    }
    const ref = refOf(item.id);
    const workspace = this.runtimes.get(item.project)?.workspace;
    let done: { removed: true } | { kept: string };
    if (item.kind === "agent") {
      const archived = await (await this.whenReady()).host.archive(ref);
      done = archived === "done" ? { removed: true } : { kept: "Paseo is not reachable yet." };
    } else if (!workspace) done = { kept: "Its project is no longer open." };
    else if (item.kind === "branch") done = await workspace.removeBranch(ref);
    else {
      const tree = await workspace.treeOf(ref);
      if (tree === null) done = { removed: true };
      else if (tree.unsaved) done = { kept: `${tree.path} holds uncommitted work` };
      else {
        const closed = await (await this.whenReady()).host.closeWorktree(tree.path);
        if (closed === "done") done = { removed: true };
        else done = { kept: "unavailable" in closed ? "Paseo is not reachable yet." : closed.failed };
      }
    }
    return "removed" in done ? { ok: true, text: `Removed ${item.label}.` } : { ok: false, text: done.kept };
  }

  /** Leaves what the record holds of a project in the file its profile names; nothing when it names none. */
  private async leaveMap(runtime: Runtime, base: string): Promise<{ ok: boolean; text: string }> {
    const file = runtime.wiring.bundle.project?.map;
    const body = file ? mapText(runtime.store.read(0), runtime.project.view) : null;
    if (!file || body === null) return { ok: true, text: "" };
    const message = `Leave what the ${PLUGIN_ID} team's record holds in ${file}`;
    const put = await runtime.workspace.putBlock(base, file, PLUGIN_ID, body, message);
    return "refused" in put ? { ok: false, text: `${file} was left as it is: ${put.refused}` } : { ok: true, text: "" };
  }

  /** Detaches a project and removes what the plugin made; its record is kept, and unsaved work stops it first. */
  private async removeProject(id: string): Promise<{ ok: boolean; text: string }> {
    const ready = await this.whenReady();
    const dir = projectDir(this.root, id);
    const file = join(dir, "project.json");
    if (!existsSync(file)) {
      rmSync(dir, { recursive: true, force: true });
      return { ok: true, text: `Removed ${dir}.` };
    }
    const { repo } = JSON.parse(readFileSync(file, "utf8")) as { repo: string };
    const present = existsSync(repo);
    const runtime = this.runtimes.get(id) ?? (present ? this.open(id, ready) : null);
    // With its repository gone there are no worktrees, branches or note to take out: only memory and agents.
    const workspace = present ? (runtime?.workspace ?? null) : null;
    const unsaved = workspace ? (await workspace.trees(branchesOf(id))).filter((c) => c.unsaved) : [];
    if (unsaved.length > 0)
      return {
        ok: false,
        text: `Uncommitted work is still in ${unsaved.map((c) => c.path).join(", ")}: commit or move it first.`,
      };
    const base = runtime?.project.view.scopes.get(ROOT)?.branch;
    if (runtime && workspace && base) {
      const left = await this.leaveMap(runtime, base);
      if (!left.ok) return left;
      const taken = await this.writeNote(runtime, base, true);
      if (!taken.ok) return { ok: false, text: taken.text ?? "" };
    }
    // Nothing opens the project again while it goes: every reader looks for this file first.
    const aside = join(dir, "project.removing.json");
    renameSync(file, aside);
    const archived = new Set<string>();
    try {
      if (runtime) await this.unload(id, runtime);
      // Listed once the project is unloaded, so an agent its last effects started is among them.
      const agents = await ready.host.labelled({ [PROJECT_LABEL]: id });
      if ("unavailable" in agents) return await this.putBack(id, aside, archived, "Paseo is not reachable yet.");
      for (const a of agents) {
        await ready.host.archive(a.host);
        archived.add(a.host);
      }
      const kept: string[] = [];
      if (workspace) {
        for (const tree of await workspace.trees(branchesOf(id))) {
          const closed = await ready.host.closeWorktree(tree.path);
          if (closed !== "done") kept.push("unavailable" in closed ? "Paseo is not reachable yet." : closed.failed);
        }
        if (kept.length === 0)
          for (const b of await workspace.branchesUnder(branchesOf(id), null)) {
            const r = await workspace.removeBranch(b.branch);
            if ("kept" in r) kept.push(r.kept);
          }
      }
      if (kept.length > 0)
        return await this.putBack(
          id,
          aside,
          archived,
          `Its agents are archived, but some of it stayed: ${kept.join("; ")}`,
        );
    } catch (error) {
      const says = error instanceof Error ? error.message : String(error);
      return this.putBack(id, aside, archived, `The removal stopped part way and the project stays attached: ${says}`);
    }
    this.holds.releaseProject(id);
    const removedAt = new Date().toISOString();
    const into = join(archiveDir(this.root), `${id}-${removedAt.replace(/[:.]/g, "-")}`);
    mkdirSync(archiveDir(this.root), { recursive: true });
    renameSync(dir, into);
    const moved = join(into, "project.removing.json");
    writeFileSync(
      join(into, "project.json"),
      JSON.stringify({ ...(JSON.parse(readFileSync(moved, "utf8")) as object), removedAt }),
    );
    rmSync(moved);
    return { ok: true, text: `Removed the project for ${repo}; its record is kept in ${into} until you delete it.` };
  }

  /** Attaches a project again after a removal stopped part way: its note back, and each archived agent said gone. */
  private async putBack(
    id: string,
    aside: string,
    archived: ReadonlySet<string>,
    text: string,
  ): Promise<{ ok: boolean; text: string }> {
    renameSync(aside, join(projectDir(this.root, id), "project.json"));
    const ready = await this.whenReady();
    const { repo } = JSON.parse(readFileSync(join(projectDir(this.root, id), "project.json"), "utf8")) as {
      repo: string;
    };
    if (existsSync(repo)) {
      const runtime = this.open(id, ready);
      const base = runtime.project.view.scopes.get(ROOT)?.branch;
      if (base) await this.writeNote(runtime, base);
      for (const a of runtime.project.view.actors.values())
        if (a.status === "seated" && a.host !== null && archived.has(a.host))
          await this.submitAs(
            runtime,
            { kind: "bridge" },
            { type: "record_gone", actor: a.id, why: "its agent was archived by a removal that stopped part way" },
          );
    }
    return { ok: false, text };
  }

  /** The Human's view of one project: what they need to know, and the last things that happened. */
  async view(project: string): Promise<{
    human: HumanView;
    activity: { at: string; text: string }[];
    stuck: string[];
    landed: number;
    root: string;
    base: string | null;
    rootGone: string | null;
    template: ProjectTemplate;
  } | null> {
    const ready = await this.whenReady();
    const dir = projectDir(this.root, project);
    if (!existsSync(join(dir, "project.json"))) return null;
    const kept = keptIn(dir, project);
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    const state = runtime.project.view;
    const recent = runtime.store.recent(200);
    const human = humanView(state);
    // The last agent to leave the root says why nobody sits there now; the state forgets an agent once it is gone.
    const sat = new Set(recent.flatMap((e) => (e.type === "actor_seated" && e.scope === ROOT ? [e.actor] : [])));
    const left =
      human.root?.owner === null ? recent.findLast((e) => e.type === "actor_gone" && sat.has(e.actor)) : undefined;
    return {
      human,
      activity: recent
        .flatMap((e) => {
          const text = activityLine(e);
          return text === null ? [] : [{ at: e.at, text }];
        })
        .slice(-60),
      base: state.scopes.get(ROOT)?.branch ?? null,
      rootGone: left?.type === "actor_gone" ? left.why : null,
      stuck: stuckOf(
        runtime.project.view,
        runtime.store.pending(),
        runtime.store.abandoned(),
        runtime.wiring.bundle.profile,
      ),
      landed: runtime.store.count("integrated"),
      root: statusText(runtime.project.view, "root", null) ?? "",
      template: templateOf(this.root, dir, kept.profile, kept.hash),
    };
  }

  /** The attached project a directory belongs to: its repository, or a folder the plugin keeps for it. */
  projectAt(dir: string): string | null {
    if (!existsSync(dir)) return null;
    const real = realpathSync(dir);
    const inside = (root: string) => real === root || real.startsWith(`${root}/`) || real.startsWith(`${root}\\`);
    return this.projects().find((p) => inside(p.repo) || inside(projectDir(this.root, p.id)))?.id ?? null;
  }

  /** The look back's reading of the log: one finding's chain of change, or the five signals. */
  async record(project: string, finding: string | null): Promise<{ chain: Chain | null; signals: Signals } | null> {
    const ready = await this.whenReady();
    if (!existsSync(join(projectDir(this.root, project), "project.json"))) return null;
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    return {
      chain: finding === null ? null : chainOf(runtime.store.read(0), finding),
      signals: signalsOf(runtime.store.read(0)),
    };
  }

  statusOf(project: string, scope: string): string | null {
    const runtime = this.runtimes.get(project);
    return runtime ? statusText(runtime.project.view, scope, null) : null;
  }

  // Paseo's hooks, carried in as facts.

  /** One agent's turns are taken one at a time: each reads its agent's history from where the one before left it. */
  turnEnded(
    hostId: string,
    outcome: { kind: string; error?: { message: string } },
    timeline: readonly AgentTimelineItem[],
  ): Promise<void> {
    return this.turns.run(hostId, () => this.takeTurn(hostId, outcome, timeline));
  }

  private async takeTurn(
    hostId: string,
    outcome: { kind: string; error?: { message: string } },
    timeline: readonly AgentTimelineItem[],
  ): Promise<void> {
    const ready = await this.whenReady();
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (!who || !runtime) return;
    const read = runtime.project.view.actors.get(who.actor)?.seen ?? 0;
    const { items, typed, began, seen } = turnOf(timeline, read, (id) => OURS.test(id));
    runtime.loaded.reflex?.onTurn(who.project, who.actor, items, runtime.project.view);
    const usage = await ready.host.usage(hostId);
    const result = outcome.kind === "completed" ? "done" : outcome.kind === "failed" ? "failed" : "cancelled";
    for (const text of typed)
      await this.submitAs(runtime, { kind: "bridge" }, { type: "record_human_words", actor: who.actor, text });
    await this.submitAs(
      runtime,
      { kind: "bridge" },
      {
        type: "record_turn",
        actor: who.actor,
        outcome: result,
        why: outcome.error?.message ?? null,
        began,
        tokensSoFar: usage.tokens,
        usdSoFar: usage.usd,
        seen,
      },
    );
  }

  async permissionAsked(hostId: string, request: string, text: string): Promise<void> {
    await this.whenReady();
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (who && runtime)
      await this.submitAs(runtime, { kind: "bridge" }, { type: "record_permission", actor: who.actor, request, text });
  }

  /** A permission Paseo's own prompt answered: settled on the record, so nobody is left owing an answer to it. */
  async permissionResolved(hostId: string, request: string, allow: boolean): Promise<void> {
    await this.whenReady();
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (who && runtime)
      await this.submitAs(
        runtime,
        { kind: "bridge" },
        { type: "record_permission_settled", actor: who.actor, request, allow },
      );
  }

  async archived(hostId: string): Promise<void> {
    await this.whenReady();
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (!who || !runtime) return;
    if (runtime.project.view.actors.get(who.actor)?.status === "seated")
      await this.submitAs(
        runtime,
        { kind: "bridge" },
        { type: "record_gone", actor: who.actor, why: "its agent was archived in Paseo" },
      );
  }

  /** Catches up on hooks missed while the plugin was not running: a waiting permission, an archived agent. */
  private async reconcile(ready: Ready): Promise<void> {
    for (const host of [...this.byHost.keys()]) {
      const now = await ready.host.now(host);
      if ("unavailable" in now) return;
      if (now.gone) await this.archived(host);
      else for (const p of now.permissions) await this.permissionAsked(host, p.id, p.text);
    }
    for (const runtime of this.runtimes.values()) runtime.dispatcher.kick();
  }

  /** A provider's harness for one room, its home laid there anew: its file is read once per plugin process. */
  private harness(provider: string, room: Room): Harness | null {
    const ready = this.readyNow;
    if (!ready) return null;
    if (!this.harnesses.has(provider)) this.harnesses.set(provider, harnessFile(ready.dir, provider));
    const file = this.harnesses.get(provider);
    if (!file) return null;
    // What an agent's home names of this machine: the plugin, the Node that runs it, and the socket its tools reach.
    const places = { plugin: ready.dir, node: process.execPath, socket: ready.socketPath };
    return harnessOf(file, room, provider, places);
  }

  /** The environment a reopened agent session gets back whole, since Paseo keeps none of what it started with. */
  async envFor(hostId: string, provider: string): Promise<Record<string, string> | null> {
    // After a daemon restart this hook comes first, before the projects are open that know the agent.
    const ready = await within(this.whenReady(), READY_WAIT_MS).catch((error: unknown) => {
      daemonLog.error("seatworks could not start", error);
      return null;
    });
    if (!ready) return null;
    const who = this.byHost.get(hostId);
    if (!who) return null;
    const runtime = this.runtimes.get(who.project) ?? this.open(who.project, ready);
    const actor = runtime.project.view.actors.get(who.actor);
    const scope = actor ? runtime.project.view.scopes.get(actor.scope) : undefined;
    const role = actor ? runtime.wiring.bundle.profile.roles.get(actor.role) : undefined;
    if (!actor || !scope || !role) return null;
    const cwd = await seatDir(runtime.wiring, runtime.project.view, scope);
    if (cwd === null) return null;
    const env = seatEnv(runtime.wiring, runtime.project.view, { actor: actor.id, scope, cwd, role });
    return { ...agentEnv(runtime.wiring, env), ...this.harness(provider, roomOf(runtime.wiring, actor.role))?.env };
  }

  /** Resolves once no project has an effect in flight; for tests and a clean unload. */
  async idle(): Promise<void> {
    for (let round = 0; round < 50; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      for (const [id, r] of this.runtimes) await r.loaded.reflex?.settled(id);
      const busy = [...this.runtimes.values()].some((r) => r.dispatcher.busy);
      if (!busy) return;
      for (const r of this.runtimes.values()) await r.dispatcher.idle();
    }
  }

  /** Lets go of settled outbox rows, and of projects idle past a day, whose next command opens them again. */
  async tidy(now: number): Promise<void> {
    for (const [id, runtime] of this.runtimes) {
      runtime.store.sweep(now);
      const seated = [...runtime.project.view.actors.values()].some((a) => a.status === "seated");
      const pending = runtime.store.pending().length > 0 || runtime.dispatcher.busy;
      if (!seated && !pending && now - runtime.lastActive > IDLE_MS) await this.unload(id, runtime);
    }
  }

  /** Takes no further effect for a project and ends its running checks, which nothing would end once this process is gone. */
  private halt(runtime: Runtime): void {
    for (const stop of runtime.stops) stop();
    runtime.dispatcher.dispose();
    runtime.evidence.stop();
  }

  private async unload(id: string, runtime: Runtime): Promise<void> {
    this.halt(runtime);
    await runtime.dispatcher.idle();
    runtime.project.dispose();
    this.runtimes.delete(id);
    for (const [host, who] of this.byHost) if (who.project === id) this.byHost.delete(host);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.upkeep);
    // Every project first: Paseo ends a stopping plugin after two seconds, and one project's unloading may take them.
    for (const runtime of this.runtimes.values()) this.halt(runtime);
    for (const [id, runtime] of this.runtimes) await this.unload(id, runtime);
    this.byHost.clear();
    await this.readyNow?.socket.close();
    this.holds.close();
  }

  private open(id: string, ready: Ready): Runtime {
    const existing = this.runtimes.get(id);
    if (existing) return existing;
    const dir = projectDir(this.root, id);
    const { repo, profile, hash } = keptIn(dir, id);
    const loaded = this.load(id, pinnedDir(dir, hash));
    const store = new ProjectStore(join(dir, "ledger.db"));
    let project: Project;
    try {
      store.sweep(Date.now());
      project = Project.open(id, store, loaded.bundle.profile);
    } catch (error) {
      store.close();
      throw error;
    }
    const workspace = new Workspace(repo);
    const scratch = scratchFor(this.root, id);
    mkdirSync(scratch, { recursive: true });
    const evidence = new EvidenceRunner(repo, join(scratch, "evidence"));
    // What a profile gives is read through the runtime, so files taken anew reach every effect that follows.
    const wiring: Wiring = {
      project: id,
      attached: () => store.began(),
      workspace,
      evidence,
      host: ready.host,
      holds: this.holds,
      profile,
      get bundle() {
        return runtime.loaded.bundle;
      },
      keys: this.keys,
      team: {
        command: process.execPath,
        args: ["--experimental-strip-types", "--no-warnings", join(ready.dir, "bin", "team.ts")],
        socket: ready.socketPath,
        shimDir: ready.shimDir,
      },
      scratch,
      rooms: join(dir, "rooms"),
      rules: rulesDir(this.root, profile),
      agents: matchingFile(this.root, profile),
      own: ownFile(dir),
      checkTimeoutMs: CHECK_TIMEOUT_MS,
      recorded: (scope) => store.about(scope),
    };
    const handlers = handlersFor(wiring);
    const dispatcher = new Dispatcher(project, store, handlers, () => this.holds.held());
    const runtime: Runtime = {
      project,
      store,
      dispatcher,
      workspace,
      evidence,
      wiring,
      loaded,
      stops: [],
      lastActive: Date.now(),
    };
    this.runtimes.set(id, runtime);
    this.index(id, runtime);
    runtime.stops.push(
      project.onCommitted((events) => {
        // Before any effect of these events is sent: an agent made of them reads the file from its first command.
        keepHeld(scratch, project.view);
        keepMail(wiring, store.pending(), project.view);
        runtime.loaded.reflex?.onEvents(id, events, project.view);
        runtime.lastActive = Date.now();
        this.index(id, runtime);
        dispatcher.kick();
      }),
      this.holds.onRelease(() => {
        dispatcher.kick();
      }),
      this.link.onReady(() => {
        dispatcher.kick();
      }),
    );
    dispatcher.kick();
    void this.recordProfile(runtime).catch((error: unknown) => {
      daemonLog.error(`seatworks could not record the profile project ${id} runs`, error);
    });
    return runtime;
  }

  /** A profile's files loaded for a project from its own copy of them. */
  private load(id: string, dir: string): Loaded {
    if (!existsSync(join(dir, "profile.yaml")))
      throw new Error(`project ${id} has lost its copy of its template at ${dir}: sync it on its page`);
    const bundle = loadBundle(dir);
    return { bundle, reflex: this.reflexFor(bundle) };
  }

  /** Says on the record the hash of the files a project runs, when it is not the one the record has. */
  private async recordProfile(runtime: Runtime): Promise<void> {
    const hash = runtime.loaded.bundle.hash;
    if (runtime.project.view.project === null || runtime.project.view.project.profileHash === hash) return;
    await this.submitAs(runtime, { kind: "bridge" }, { type: "record_profile", profileHash: hash });
  }

  /** A profile's reflex, asked of the profile's own classifier with the Human's key; none when it asks nothing. */
  private reflexFor(bundle: Bundle): Reflex | null {
    const config = loadReflex(bundle.dir, bundle.asks);
    if (!config) return null;
    const routes = Object.values(bundle.classifier ?? {});
    let made: { for: string; classifier: Classifier } | null = null;
    return new Reflex(
      config,
      (): Asker => {
        const { on, host, key } = this.asks;
        // No classifier in the template, or switched off on this machine: a choice, so nothing is said of it.
        if (routes.length === 0 || !on) return { ok: false, says: null };
        const served = `This project's template asks a classifier at ${routes.map((r) => hostOf(r.endpoint)).join(", ")}`;
        const route = routes.find((r) => hostOf(r.endpoint) === host);
        // A key goes to the host the Human gave it for and to no other, whatever a template names.
        if (!route)
          return {
            ok: false,
            says: `${served}, and the key in the plugin's settings is for ${host || "no host"}: name one of those hosts there, or switch the classifier off. ${WORKS_ON}`,
          };
        if (key === "")
          return {
            ok: false,
            says: `${served}, and no key is set for ${host}: set one in the plugin's settings, or switch the classifier off there. ${WORKS_ON}`,
          };
        const id = `${route.endpoint}\n${key}`;
        if (made?.for !== id) made = { for: id, classifier: new Classifier(route, key, config.mask) };
        return { ok: true, classifier: made.classifier };
      },
      async (project, body) => {
        const runtime = this.runtimes.get(project);
        if (runtime) await this.submitAs(runtime, { kind: "bridge" }, body);
      },
      (project, text) => {
        if (text === null) this.alarms.delete(project);
        else this.alarms.set(project, text);
      },
      {
        settled: (project, actor, names, tests) => this.settledNames(project, actor, names, tests),
        diffs: async (project, scope, commit) => {
          const runtime = this.runtimes.get(project);
          const s = runtime?.project.view.scopes.get(scope);
          const since = runtime && s ? changeOf(runtime.project.view, s) : null;
          return runtime && since ? runtime.workspace.fileDiffs(since.base, commit, since.within) : [];
        },
      },
    );
  }

  /** Keeps the map from Paseo's agent ids to seated actors current: one entry per seated agent, none after. */
  private index(project: string, runtime: Runtime): void {
    for (const [host, who] of this.byHost)
      if (who.project === project && runtime.project.view.actors.get(who.actor)?.status !== "seated")
        this.byHost.delete(host);
    for (const a of runtime.project.view.actors.values())
      if (a.host !== null && a.status === "seated") this.byHost.set(a.host, { project, actor: a.id });
  }

  private port(id: string): ProjectPort | undefined {
    const ready = this.readyNow;
    if (!ready || this.disposed || !existsSync(join(projectDir(this.root, id), "project.json"))) return undefined;
    const runtime = this.runtimes.get(id) ?? this.open(id, ready);
    return {
      get view() {
        return runtime.project.view;
      },
      submit: (command) => runtime.project.submit(command),
      get report() {
        return runtime.wiring.bundle.profile.report;
      },
      reached: (actor) => {
        if (runtime.project.view.actors.get(actor)?.tools !== false) return;
        this.submitAs(runtime, { kind: "bridge" }, { type: "record_tools", actor }).catch((error: unknown) => {
          daemonLog.error(`project ${id}: that ${actor}'s tools reached the plugin could not be recorded`, error);
        });
      },
      roleTools: (actor) => {
        const a = runtime.project.view.actors.get(actor);
        if (a?.status !== "seated") return null;
        return runtime.wiring.bundle.profile.roles.get(a.role)?.tools ?? new Set();
      },
      roleGone: (actor) => {
        const a = runtime.project.view.actors.get(actor);
        return a?.status === "seated" && !runtime.wiring.bundle.profile.roles.has(a.role) ? a.role : null;
      },
      read: (actor, name, args) => this.read(runtime, actor, name, args),
      mail: async (actor) => {
        const text = await runtime.dispatcher.handIn(actor, intoTurn(runtime.wiring, Date.now));
        if (text !== null) keepMail(runtime.wiring, runtime.store.pending(), runtime.project.view);
        return text;
      },
    };
  }

  private async read(runtime: Runtime, actor: string, name: ReadName, a: ReadArgs): Promise<string> {
    const view = runtime.project.view;
    const own = view.actors.get(actor)?.scope ?? "root";
    if (name === "status") return statusText(view, a.scope ?? own, actor) ?? `No scope ${a.scope ?? own} is open.`;
    if (name === "record") {
      const scope = a.scope ?? own;
      const held = view.scopes.get(scope);
      if (held && isUnseen(view, actor, held)) return noRecord(scope);
      const reader = standsAbove(view, actor, scope) ? "above" : held?.owner === actor ? "owner" : "other";
      const text = scopeRecordText(runtime.store.about(scope), scope, reader);
      // What a look back reads is the root's owner's alone: it names the watch, which the watched never learn of.
      return scope === ROOT && held?.owner === actor ? `${text}\n\n${lookBackText(() => runtime.store.read(0))}` : text;
    }
    if (name === "diff") {
      const scope = view.scopes.get(a.scope ?? own);
      if (!scope || isUnseen(view, actor, scope)) return `No scope ${a.scope ?? own} is open.`;
      const since = changeOf(view, scope);
      if (!since) return `Scope ${scope.id} has no parent branch to compare with.`;
      const tip = a.commit ?? scope.branch ?? scope.commit;
      if (!tip) return `Scope ${scope.id} has no branch or commit.`;
      return runtime.workspace.diff(since.base, tip, since.within);
    }
    const ready = await this.whenReady();
    const target = view.actors.get(a.actor ?? "");
    const reader = view.actors.get(actor);
    // Those told of an agent's work are above it, so a look reaches only down: the watched never learn of the watch.
    if (!target || !reader || !mayLook(view, reader, target))
      return `${a.actor ?? "?"} is no agent in your scope or below it: those are the ones you look at.`;
    if (!target.host) return `${target.id} has no agent to look at.`;
    return ready.host.look(target.host, a.last ?? 40);
  }

  private async submitAs(runtime: Runtime, caller: Caller, body: CommandBody): Promise<Submitted> {
    return runtime.project.submit({ id: crypto.randomUUID(), at: new Date().toISOString(), caller, body });
  }
}

/** What a scope's change is read against: its parent's branch, or where it started and its own paths on a branch it shares. */
function changeOf(view: State, scope: Scope): { base: string; within: readonly string[] } | null {
  const parent = scope.parent ? view.scopes.get(scope.parent) : undefined;
  if (!parent?.branch) return null;
  // Work done on the parent's own branch has no branch to tell it by: it is what changed under its paths since it began.
  return scope.branch === parent.branch && scope.head !== null
    ? { base: scope.head, within: scope.paths }
    : { base: parent.branch, within: [] };
}

/** What `work` gives, or null when it takes longer than `ms`. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The branch a repository has checked out, the base a team lands on unless the Human names another. */
async function currentBranch(repo: string): Promise<string> {
  const run = await git(repo, ["symbolic-ref", "-q", "--short", "HEAD"]);
  return run.code === 0 && run.stdout.trim() ? run.stdout.trim() : "main";
}

/** A provider's harness as its file states it (HARNESS.md): what each property adds, its process's variables, its home. */
type HarnessFile = Partial<Pick<Harness, "always" | "writes" | "reads" | "servers">> & {
  readonly home: Home;
  readonly env?: Readonly<Record<string, unknown>>;
};

function harnessFile(dir: string, provider: string): HarnessFile | null {
  const file = join(dir, "harness", `${provider}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as HarnessFile) : null;
}

/** A harness for one room: its home laid there, in a folder of the provider's own, and named to the agent's process. */
function harnessOf(h: HarnessFile, room: Room, provider: string, places: Places): Harness {
  const home = layHome(join(room.dir, provider), h.home, places, room.skills);
  // A variable an agent reads its config from is written in the file as that config, and handed over as its JSON.
  const named = Object.entries(h.env ?? {}).map(([name, v]) => [name, typeof v === "string" ? v : JSON.stringify(v)]);
  // A setting an agent takes a skill at a time is written once in the file, for a skill, and set for each the room has.
  const set = (settings: unknown) =>
    withSkills(
      withPlaces(settings ?? {}, places),
      room.skills.map((s) => basename(s)),
    );
  return {
    always: set(h.always) as Harness["always"],
    writes: set(h.writes) as Harness["writes"],
    reads: set(h.reads) as Harness["reads"],
    env: { ...(Object.fromEntries(named) as Record<string, string>), ...home },
    servers: h.servers ?? true,
  };
}
