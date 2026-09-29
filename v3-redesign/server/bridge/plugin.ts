import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { Caller, CommandBody } from "../../shared/contracts/commands.ts";
import type { ReadName } from "../../shared/contracts/tools.ts";
import { activityLine } from "../../shared/views/activity.ts";
import { type Chain, type Signals, chainOf, scopeRecordText, signalsOf } from "../../shared/views/record.ts";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { humanView } from "../../shared/views/human.ts";
import { statusText } from "../../shared/views/status.ts";
import { Keys } from "../core/keys.ts";
import { daemonLog } from "../core/logger.ts";
import { projectDir } from "../core/paths.ts";
import { installShim } from "../core/shim.ts";
import { type Harness, PaseoHost } from "../satellites/agent-host/host.ts";
import { PaseoLink } from "../satellites/agent-host/paseo-link.ts";
import { EvidenceRunner } from "../satellites/evidence/runner.ts";
import { MachineHolds } from "../satellites/machine/holds.ts";
import { ProjectStore } from "../satellites/store/project-store.ts";
import type { TurnItem } from "../satellites/agent-host/items.ts";
import { loadReflex } from "../satellites/reflex/config.ts";
import { Jev } from "../satellites/reflex/jev.ts";
import { git } from "../satellites/workspace/git.ts";
import { Workspace } from "../satellites/workspace/workspace.ts";
import { type Bundle, loadBundle, profileDir } from "../profile/bundle.ts";
import { Dispatcher } from "./dispatcher.ts";
import { handlersFor, scratchFor } from "./effects.ts";
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

type Runtime = {
  project: Project;
  store: ProjectStore;
  dispatcher: Dispatcher;
  workspace: Workspace;
  stops: (() => void)[];
  lastActive: number;
};
type Ready = { dir: string; bundle: Bundle; host: PaseoHost; shimDir: string; socket: TeamSocket; socketPath: string };

/**
 * The bridge: the only place that builds the whole. It opens each project's shell, carries Paseo's hooks in as facts
 * and each effect out to its satellite, and serves the agents' tools (PORTS.md, Bridge).
 */
export class Plugin {
  readonly link = new PaseoLink();
  private readonly root: string;
  private readonly keys: Keys;
  private readonly holds: MachineHolds;
  private readonly runtimes = new Map<string, Runtime>();
  private readonly byHost = new Map<string, { project: string; actor: string }>();
  private ready: Promise<Ready> | null = null;
  private bundle: Bundle | null = null;
  private reflex: Reflex | null = null;
  private reflexKey: { route: string; key: string } = { route: "openrouter", key: "" };
  private jev: { for: string; client: Jev } | null = null;
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
      void this.tidy(Date.now());
    }, UPKEEP_MS);
    this.upkeep.unref();
    this.link.onReady(() => {
      void this.whenReady().catch((error: unknown) => {
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

  whenReady(): Promise<Ready> {
    this.ready ??= this.start();
    return this.ready;
  }

  private async start(): Promise<Ready> {
    const api = this.link.current;
    if (!api) throw new Error("Paseo's API has not arrived");
    const plugins = (await api.config.get()).config.plugins ?? {};
    const dir = plugins[PLUGIN_ID]?.path;
    if (!dir) throw new Error(`Paseo's config has no plugins.${PLUGIN_ID} with a path`);
    const bundle = loadBundle(profileDir(join(dir, "profile", "slp"), this.root));
    this.bundle = bundle;
    const config = loadReflex(bundle.dir);
    if (config)
      this.reflex = new Reflex(
        config,
        () => {
          const route = config.routes[this.reflexKey.route];
          if (!route || this.reflexKey.key === "") return null;
          const id = `${this.reflexKey.route}:${this.reflexKey.key}`;
          if (this.jev?.for !== id) this.jev = { for: id, client: new Jev(route, this.reflexKey.key, config.mask) };
          return this.jev.client;
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
          testDiffs: async (project, scope, commit) => {
            const runtime = this.runtimes.get(project);
            const s = runtime?.project.view.scopes.get(scope);
            const parent = s?.parent ? runtime?.project.view.scopes.get(s.parent) : undefined;
            if (!runtime || !parent?.branch || !config.testPath) return [];
            return runtime.workspace.fileDiffs(parent.branch, commit, config.testPath);
          },
        },
      );
    const host = new PaseoHost(this.link, (provider) => harnessOf(dir, provider));
    const shimDir = installShim(this.root, join(dir, "bin", "git-shim.ts"));
    const socketPath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\seatworks-${createHash("sha256").update(this.root).digest("hex").slice(0, 16)}`
        : join(this.root, "team.sock");
    const socket = new TeamSocket(socketPath, this.keys, (id) => this.port(id));
    await socket.listen();
    const ready: Ready = { dir, bundle, host, shimDir, socket, socketPath };
    this.readyNow = ready;
    const projects = join(this.root, "projects");
    if (existsSync(projects))
      for (const id of readdirSync(projects)) if (existsSync(join(projects, id, "project.json"))) this.open(id, ready);
    return ready;
  }

  /** Opens a project for a repository, or the one already open for it, and starts its Supervisor. */
  async openProject(repo: string, base: string | undefined): Promise<{ project: string; outcome: Submitted }> {
    const ready = await this.whenReady();
    const real = realpathSync(repo);
    const branch = base ?? (await currentBranch(real));
    const id = createHash("sha256").update(real).digest("hex").slice(0, 12);
    const dir = projectDir(this.root, id);
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, "project.json")))
      writeFileSync(join(dir, "project.json"), JSON.stringify({ repo: real }));
    const runtime = this.open(id, ready);
    const model = [...ready.bundle.profile.root.models][0] ?? "";
    const outcome = await this.submitAs(
      runtime,
      { kind: "human" },
      { type: "open_project", base: branch, remote: null, profileHash: ready.bundle.hash, model },
    );
    return { project: id, outcome };
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

  /** The Human's view of one project: what they need to know, and the last things that happened. */
  async view(project: string): Promise<{ human: HumanView; activity: string[]; root: string } | null> {
    const ready = await this.whenReady();
    if (!existsSync(join(projectDir(this.root, project), "project.json"))) return null;
    const runtime = this.runtimes.get(project) ?? this.open(project, ready);
    const activity = runtime.store
      .recent(200)
      .flatMap((e) => activityLine(e) ?? [])
      .slice(-60);
    return {
      human: humanView(runtime.project.view),
      activity,
      root: statusText(runtime.project.view, "root", null) ?? "",
    };
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

  async turnEnded(
    hostId: string,
    outcome: { kind: string; error?: { message: string } },
    typed: readonly string[],
    items: readonly TurnItem[],
  ): Promise<void> {
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (who && runtime) this.reflex?.onTurn(who.project, who.actor, items, runtime.project.view);
    if (!who || !runtime) return;
    const ready = await this.whenReady();
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
        tokens: usage.tokens,
        usd: usage.usd,
      },
    );
  }

  async permissionAsked(hostId: string, request: string, text: string): Promise<void> {
    const who = this.byHost.get(hostId);
    const runtime = who ? this.runtimes.get(who.project) : undefined;
    if (who && runtime)
      await this.submitAs(runtime, { kind: "bridge" }, { type: "record_permission", actor: who.actor, request, text });
  }

  async archived(hostId: string): Promise<void> {
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

  /** The environment a reopened session of one of the plugin's agents gets back: its key among it. */
  envFor(hostId: string): Record<string, string> | null {
    const who = this.byHost.get(hostId);
    if (!who) return null;
    return {
      SEATWORKS_PROJECT: who.project,
      SEATWORKS_ACTOR: who.actor,
      SEATWORKS_KEY: this.keys.keyOf(who.project, who.actor),
    };
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

  private async unload(id: string, runtime: Runtime): Promise<void> {
    for (const stop of runtime.stops) stop();
    runtime.dispatcher.dispose();
    await runtime.dispatcher.idle();
    runtime.project.dispose();
    this.runtimes.delete(id);
    for (const [host, who] of this.byHost) if (who.project === id) this.byHost.delete(host);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    clearInterval(this.upkeep);
    for (const [id, runtime] of this.runtimes) await this.unload(id, runtime);
    this.byHost.clear();
    if (this.ready) await (await this.ready).socket.close();
    this.holds.close();
  }

  private open(id: string, ready: Ready): Runtime {
    const existing = this.runtimes.get(id);
    if (existing) return existing;
    const dir = projectDir(this.root, id);
    const { repo } = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")) as { repo: string };
    const store = new ProjectStore(join(dir, "ledger.db"));
    store.sweep(Date.now());
    const project = Project.open(id, store, ready.bundle.profile);
    const workspace = new Workspace(repo, join(dir, "copies"));
    const scratch = scratchFor(this.root, id);
    mkdirSync(scratch, { recursive: true });
    const handlers = handlersFor({
      project: id,
      workspace,
      evidence: new EvidenceRunner(repo, join(scratch, "evidence"), ready.bundle.environment),
      host: ready.host,
      holds: this.holds,
      bundle: ready.bundle,
      keys: this.keys,
      team: {
        command: process.execPath,
        args: ["--experimental-strip-types", "--no-warnings", join(ready.dir, "bin", "team.ts")],
        socket: ready.socketPath,
        shimDir: ready.shimDir,
      },
      scratch,
      checkTimeoutMs: CHECK_TIMEOUT_MS,
    });
    const dispatcher = new Dispatcher(project, store, handlers, () => this.holds.held());
    const runtime: Runtime = { project, store, dispatcher, workspace, stops: [], lastActive: Date.now() };
    this.runtimes.set(id, runtime);
    this.index(id, runtime);
    runtime.stops.push(
      project.onCommitted((events) => {
        this.reflex?.onEvents(id, events, project.view);
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
    return runtime;
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
      roleTools: (actor) => {
        const a = runtime.project.view.actors.get(actor);
        return a?.status === "seated" ? (this.bundle?.profile.roles.get(a.role)?.tools ?? null) : null;
      },
      read: (actor, name, args) => this.read(runtime, actor, name, args),
    };
  }

  private async read(runtime: Runtime, actor: string, name: ReadName, args: unknown): Promise<string> {
    const a = (args ?? {}) as { scope?: string; actor?: string; commit?: string; last?: number };
    const view = runtime.project.view;
    const own = view.actors.get(actor)?.scope ?? "root";
    if (name === "status") return statusText(view, a.scope ?? own, actor) ?? `No scope ${a.scope ?? own} is open.`;
    if (name === "record") return scopeRecordText(runtime.store.read(0), a.scope ?? own);
    if (name === "diff") {
      const scope = view.scopes.get(a.scope ?? own);
      const parent = scope?.parent ? view.scopes.get(scope.parent) : undefined;
      if (!scope || !parent?.branch) return `Scope ${a.scope ?? own} has no parent branch to compare with.`;
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

/** The branch a repository has checked out, the base a team lands on unless the Human names another. */
async function currentBranch(repo: string): Promise<string> {
  const run = await git(repo, ["symbolic-ref", "-q", "--short", "HEAD"]);
  return run.code === 0 && run.stdout.trim() ? run.stdout.trim() : "main";
}

function harnessOf(dir: string, provider: string): Harness | null {
  const file = join(dir, "harness", `${provider}.json`);
  if (!existsSync(file)) return null;
  const h = JSON.parse(readFileSync(file, "utf8")) as Partial<Harness>;
  return { always: h.always ?? {}, writes: h.writes ?? {}, reads: h.reads ?? {} };
}
