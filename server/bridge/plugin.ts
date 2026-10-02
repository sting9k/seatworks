import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { Caller, CommandBody } from "../../shared/contracts/commands.ts";
import { PROJECT_LABEL, ROOT } from "../../shared/contracts/ids.ts";
import type { ReadArgs, ReadName } from "../../shared/contracts/tools.ts";
import { activityLine } from "../../shared/views/activity.ts";
import { type Chain, type Signals, chainOf, scopeRecordText, signalsOf } from "../../shared/views/record.ts";
import type {
  HumanView,
  Leftover,
  Preset,
  ProfileAgents,
  ProjectTemplate,
  TemplateOffer,
  TemplateSource,
} from "../../shared/contracts/rpc.ts";
import { humanView } from "../../shared/views/human.ts";
import { statusText } from "../../shared/views/status.ts";
import { stuckOf } from "../../shared/views/stuck.ts";
import { type Home, type Places, layHome } from "../core/home.ts";
import { KeyedQueue } from "../core/keyed-queue.ts";
import { Keys } from "../core/keys.ts";
import { daemonLog } from "../core/logger.ts";
import { archiveDir, projectDir } from "../core/paths.ts";
import { rulesDir } from "../core/rules.ts";
import { installShim } from "../core/shim.ts";
import { type Harness, PaseoHost } from "../satellites/agent-host/host.ts";
import { PaseoLink } from "../satellites/agent-host/paseo-link.ts";
import { EvidenceRunner } from "../satellites/evidence/runner.ts";
import { MachineHolds } from "../satellites/machine/holds.ts";
import { ProjectStore } from "../satellites/store/project-store.ts";
import { turnOf } from "../satellites/agent-host/items.ts";
import type { Route } from "../../shared/contracts/reflex.ts";
import { loadReflex, loadRoutes } from "../satellites/reflex/config.ts";
import { Jev } from "../satellites/reflex/jev.ts";
import { git } from "../satellites/workspace/git.ts";
import { Workspace } from "../satellites/workspace/workspace.ts";
import { agentsByProfile, match, type Matching, matchingFile } from "../profile/agents.ts";
import { type Bundle, loadBundle } from "../profile/bundle.ts";
import { install, offerOf } from "../profile/install.ts";
import { pin, pinnedDir, templateOf } from "../profile/pinned.ts";
import { listPresets } from "../profile/presets.ts";
import { listProfiles, type Listed as ListedProfile, removeProfile } from "../profile/profiles.ts";
import { Dispatcher } from "./dispatcher.ts";
import { type Wiring, branchesOf, handlersFor, scratchFor, seatEnv, withShim } from "./effects.ts";
import { type Kept, leftoverId, leftoversOf, projectLeftover, refOf } from "./leftovers.ts";
import { Project, type Submitted } from "./project.ts";
import { Reflex } from "./reflex.ts";
import { type ProjectPort, TeamSocket } from "./team-socket.ts";

export const PLUGIN_ID = "seatworks";
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
  /** Where the reflex asks, by the name the plugin's settings give each route. */
  routes: Readonly<Record<string, Route>>;
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
  private readonly harnesses = new Map<string, Harness | null>();
  private readonly holds: MachineHolds;
  private readonly runtimes = new Map<string, Runtime>();
  private readonly byHost = new Map<string, { project: string; actor: string }>();
  private readonly turns = new KeyedQueue<string>();
  private ready: Promise<Ready> | null = null;
  private reflexKey: { route: string; key: string } = { route: "openrouter", key: "" };
  private alarmText: string | null = null;
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

  /** Names already settled for an agent: in its brief, its parent's plan, the base, or its own code. */
  private async settledNames(project: string, actorId: string, names: readonly string[]): Promise<ReadonlySet<string>> {
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
    for (const n of await runtime.workspace.namesIn(runtime.workspace.repo, parent?.branch ?? "HEAD", rest))
      settled.add(n);
    const own = runtime.workspace.pathOf(scope.id);
    if (existsSync(own)) for (const n of await runtime.workspace.namesIn(own, null, rest)) settled.add(n);
    return settled;
  }

  /** Where the reflex asks Jev, from the plugin's settings; the key is kept here only, never logged. */
  setReflex(route: string, key: string): void {
    this.reflexKey = { route, key };
    this.alarmText = null;
  }

  /** A standing alarm for the Human, such as the reflex having no key; null when all is well. */
  get alarm(): string | null {
    return this.alarmText;
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
    const host = new PaseoHost(this.link, (provider) => this.harness(provider));
    const shimDir = installShim(this.root, join(dir, "bin", "git-shim.ts"));
    const socketPath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\seatworks-${createHash("sha256").update(this.root).digest("hex").slice(0, 16)}`
        : join(this.root, "team.sock");
    const socket = new TeamSocket(socketPath, this.keys, (id) => this.port(id));
    await socket.listen();
    const ready: Ready = { dir, host, shimDir, socket, socketPath, routes: loadRoutes(dir) };
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
    const ready = await this.whenReady();
    const dir = projectDir(this.root, project);
    if (!existsSync(join(dir, "project.json"))) return { ok: false, says: `no project ${project} is attached` };
    const kept = keptIn(dir, project);
    const pinned = pin(this.root, dir, kept.profile);
    if (!pinned.ok) return pinned;
    keep(dir, { ...kept, hash: pinned.hash });
    const runtime = this.runtimes.get(project);
    if (runtime) {
      runtime.loaded = this.load(project, pinnedDir(dir, pinned.hash), ready);
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
  ): Promise<{ ok: true; profiles: ProfileAgents[]; available: string[] } | { ok: false; says: string }> {
    const has = await (await this.whenReady()).host.agentProfiles();
    if ("unavailable" in has) return { ok: false, says: UNREACHED };
    if (matched !== null) {
      const kept = match(this.root, matched.profile, matched.matching, has);
      if (!kept.ok) return kept;
    }
    return { ok: true, profiles: agentsByProfile(this.root, has), available: has.map((p) => p.name) };
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
          ? "no template is installed: install one on Seatworks' Plugin page, under Templates"
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
        remote: null,
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
  projects(): { id: string; repo: string; open: boolean }[] {
    const dir = join(this.root, "projects");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((id) => {
      const file = join(dir, id, "project.json");
      if (!existsSync(file)) return [];
      const { repo } = JSON.parse(readFileSync(file, "utf8")) as { repo: string };
      return [{ id, repo, open: this.runtimes.has(id) }];
    });
  }

  /** Paseo's git projects no team is attached to yet, for the Human to attach one. */
  async unattached(): Promise<{ name: string; root: string }[]> {
    const api = this.link.current;
    if (!api) return [];
    const attached = new Set(this.projects().map((p) => p.repo));
    const listed = await api.projects.list();
    return listed.projects.flatMap((p) => {
      if (p.projectKind !== "git" || !existsSync(p.projectRootPath)) return [];
      const root = realpathSync(p.projectRootPath);
      return attached.has(root) ? [] : [{ name: p.projectDisplayName, root }];
    });
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
        });
        continue;
      }
      const { repo } = JSON.parse(readFileSync(file, "utf8")) as { repo: string };
      const agents = await ready.host.labelled({ [PROJECT_LABEL]: id });
      const kept: readonly Kept[] = "unavailable" in agents ? [] : agents;
      if (!existsSync(repo)) {
        found.push(projectLeftover(id, repo, null));
        continue;
      }
      const runtime = this.runtimes.get(id) ?? this.open(id, ready);
      found.push(
        ...(await leftoversOf(id, runtime.project.view, runtime.workspace, kept)),
        projectLeftover(id, repo, runtime.project.view),
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
      });
    }
    return found;
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
      const copy = (await workspace.onDisk()).find((c) => c.key === ref);
      done = copy ? await workspace.remove(ref, copy.branch, null) : { removed: true };
    }
    return "removed" in done ? { ok: true, text: `Removed ${item.label}.` } : { ok: false, text: done.kept };
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
    // With its repository gone there are no copies, branches or note to take out: only memory and agents.
    const workspace = present ? (runtime?.workspace ?? null) : null;
    const unsaved = workspace ? (await workspace.onDisk()).filter((c) => c.unsaved) : [];
    if (unsaved.length > 0)
      return {
        ok: false,
        text: `Uncommitted work is still in ${unsaved.map((c) => c.path).join(", ")}: commit or move it first.`,
      };
    const base = runtime?.project.view.scopes.get(ROOT)?.branch;
    if (runtime && workspace && base) {
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
        for (const c of await workspace.onDisk()) {
          const r = await workspace.remove(c.key, c.branch, null);
          if ("kept" in r) kept.push(r.kept);
        }
        await workspace.prune();
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
    activity: string[];
    stuck: string[];
    root: string;
    template: ProjectTemplate;
  } | null> {
    const ready = await this.whenReady();
    const dir = projectDir(this.root, project);
    if (!existsSync(join(dir, "project.json"))) return null;
    const kept = keptIn(dir, project);
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    const activity = runtime.store
      .recent(200)
      .flatMap((e) => activityLine(e) ?? [])
      .slice(-60);
    return {
      human: humanView(runtime.project.view),
      activity,
      stuck: stuckOf(
        runtime.project.view,
        runtime.store.pending(),
        runtime.store.abandoned(),
        runtime.wiring.bundle.profile,
      ),
      root: statusText(runtime.project.view, "root", null) ?? "",
      template: templateOf(this.root, dir, kept.profile, kept.hash),
    };
  }

  /** The attached project a directory belongs to: its repository, or one of the copies made for it. */
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

  /** A provider's harness, laid out once per plugin process: a few providers at most. */
  private harness(provider: string): Harness | null {
    const ready = this.readyNow;
    if (!ready) return null;
    // What an agent's home names of this machine: the plugin, the Node that runs it, and the socket its tools reach.
    const places = { plugin: ready.dir, node: process.execPath, socket: ready.socketPath };
    if (!this.harnesses.has(provider)) this.harnesses.set(provider, harnessOf(ready.dir, this.root, provider, places));
    return this.harnesses.get(provider) ?? null;
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
    const { env } = seatEnv(runtime.wiring, actor.id, scope, role.writes);
    return { ...withShim(runtime.wiring, env), ...this.harness(provider)?.env };
  }

  /** Resolves once no project has an effect in flight; for tests and a clean unload. */
  async idle(): Promise<void> {
    for (let round = 0; round < 50; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
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
    const loaded = this.load(id, pinnedDir(dir, hash), ready);
    const store = new ProjectStore(join(dir, "ledger.db"));
    let project: Project;
    try {
      store.sweep(Date.now());
      project = Project.open(id, store, loaded.bundle.profile);
    } catch (error) {
      store.close();
      throw error;
    }
    const workspace = new Workspace(repo, join(dir, "copies"));
    const scratch = scratchFor(this.root, id);
    mkdirSync(scratch, { recursive: true });
    const evidence = new EvidenceRunner(repo, join(scratch, "evidence"));
    // What a profile gives is read through the runtime, so files taken anew reach every effect that follows.
    const wiring: Wiring = {
      project: id,
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
      rules: rulesDir(this.root, profile),
      agents: matchingFile(this.root, profile),
      checkTimeoutMs: CHECK_TIMEOUT_MS,
      log: () => store.read(0),
      marker: PLUGIN_ID,
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
  private load(id: string, dir: string, ready: Ready): Loaded {
    if (!existsSync(join(dir, "profile.yaml")))
      throw new Error(`project ${id} has lost its copy of its template at ${dir}: sync it on its page`);
    const bundle = loadBundle(dir);
    return { bundle, reflex: this.reflexFor(bundle, ready.routes) };
  }

  /** Says on the record the hash of the files a project runs, when it is not the one the record has. */
  private async recordProfile(runtime: Runtime): Promise<void> {
    const hash = runtime.loaded.bundle.hash;
    if (runtime.project.view.project === null || runtime.project.view.project.profileHash === hash) return;
    await this.submitAs(runtime, { kind: "bridge" }, { type: "record_profile", profileHash: hash });
  }

  /** A profile's reflex, asked by the plugin's own route and key; none when the profile asks nothing. */
  private reflexFor(bundle: Bundle, routes: Readonly<Record<string, Route>>): Reflex | null {
    const config = loadReflex(bundle.dir, bundle.asks);
    if (!config) return null;
    let jev: { for: string; client: Jev } | null = null;
    return new Reflex(
      config,
      () => {
        const route = routes[this.reflexKey.route];
        if (!route || this.reflexKey.key === "") return null;
        const id = `${this.reflexKey.route}:${this.reflexKey.key}`;
        if (jev?.for !== id) jev = { for: id, client: new Jev(route, this.reflexKey.key, config.mask) };
        return jev.client;
      },
      async (project, body) => {
        const runtime = this.runtimes.get(project);
        if (runtime) await this.submitAs(runtime, { kind: "bridge" }, body);
      },
      (text) => {
        this.alarmText = text;
      },
      {
        settled: (project, actor, names) => this.settledNames(project, actor, names),
        diffs: async (project, scope, commit) => {
          const runtime = this.runtimes.get(project);
          const s = runtime?.project.view.scopes.get(scope);
          const parent = s?.parent ? runtime?.project.view.scopes.get(s.parent) : undefined;
          if (!runtime || !parent?.branch) return [];
          return runtime.workspace.fileDiffs(parent.branch, commit);
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
    };
  }

  private async read(runtime: Runtime, actor: string, name: ReadName, a: ReadArgs): Promise<string> {
    const view = runtime.project.view;
    const own = view.actors.get(actor)?.scope ?? "root";
    if (name === "status") return statusText(view, a.scope ?? own, actor) ?? `No scope ${a.scope ?? own} is open.`;
    if (name === "record") return scopeRecordText(runtime.store.about(a.scope ?? own), a.scope ?? own);
    if (name === "diff") {
      const scope = view.scopes.get(a.scope ?? own);
      if (!scope) return `No scope ${a.scope ?? own} is open.`;
      const parent = scope.parent ? view.scopes.get(scope.parent) : undefined;
      if (!parent?.branch) return `Scope ${scope.id} has no parent branch to compare with.`;
      const tip = a.commit ?? scope.branch ?? scope.commit;
      if (!tip) return `Scope ${scope.id} has no branch or commit.`;
      return runtime.workspace.diff(parent.branch, tip);
    }
    const ready = await this.whenReady();
    const target = view.actors.get(a.actor ?? "");
    if (!target?.host) return `${a.actor ?? "?"} has no agent to look at.`;
    return ready.host.look(target.host, a.last ?? 40);
  }

  private async submitAs(runtime: Runtime, caller: Caller, body: CommandBody): Promise<Submitted> {
    return runtime.project.submit({ id: crypto.randomUUID(), at: new Date().toISOString(), caller, body });
  }
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

/** A provider's harness file (HARNESS.md), with the home it describes laid out under the plugin's state root. */
function harnessOf(dir: string, root: string, provider: string, places: Places): Harness | null {
  const file = join(dir, "harness", `${provider}.json`);
  if (!existsSync(file)) return null;
  const h = JSON.parse(readFileSync(file, "utf8")) as Partial<Harness> & { home?: Home };
  const home = h.home ? layHome(join(root, "homes", provider), h.home, places) : {};
  return {
    always: h.always ?? {},
    writes: h.writes ?? {},
    reads: h.reads ?? {},
    env: home,
    servers: h.servers ?? true,
  };
}
