import type { Caller, CommandBody } from "../../shared/contracts/commands.ts";
import { type EffectBody, LOADS_MACHINE } from "../../shared/contracts/effects.ts";
import type { State } from "../../shared/kernel/state.ts";
import { daemonLog } from "../core/logger.ts";
import type { PendingEffect, ProjectStore } from "../satellites/store/project-store.ts";
import type { Project } from "./project.ts";

/** What a satellite made of an effect. `wait` leaves it pending with no attempt counted: a busy reader, a held machine. */
export type Handled =
  /** `taken`: of a batch, how many of its effects were done, oldest first; the rest stay pending. All, when left out. */
  | { status: "done"; facts?: readonly CommandBody[]; taken?: number }
  | { status: "dropped"; why: string }
  | { status: "wait" }
  | { status: "failed"; why: string; facts?: readonly CommandBody[] };

export type EffectHandler<K extends EffectBody["kind"] = EffectBody["kind"]> = (
  effect: Extract<EffectBody, { kind: K }>,
  context: { project: string; state: State; key: string },
) => Promise<Handled>;

export type Delivery = Extract<EffectBody, { kind: "deliver" }>;

/** Every kind has its handler; deliveries to one reader come as one batch, since a reader is woken once for them all. */
export type Handlers = { [K in Exclude<EffectBody["kind"], "deliver">]: EffectHandler<K> } & {
  deliver: (batch: readonly Delivery[], context: { project: string; state: State; key: string }) => Promise<Handled>;
};

/** Tries before an effect that keeps throwing is settled as failed and logged. */
const MAX_ATTEMPTS = 5;

/** Carries pending effects to their satellites and facts back as commands; one channel runs one effect at a time. */
export class Dispatcher {
  private readonly inFlight = new Set<string>();
  private readonly busyChannels = new Set<string>();
  /** Effects that answered `wait` since the last change: bounded by what is pending, cleared on every change. */
  private readonly waiting = new Set<string>();
  /** Channels whose effect threw, each until its pause ends; a change ends none sooner, or an outage would use up the tries. */
  private readonly paused = new Set<string>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private disposed = false;
  private readonly project: Project;
  private readonly store: ProjectStore;
  private readonly handlers: Handlers;
  private readonly machineHeld: () => boolean;
  private readonly now: () => Date;

  constructor(
    project: Project,
    store: ProjectStore,
    handlers: Handlers,
    machineHeld: () => boolean,
    now: () => Date = () => new Date(),
  ) {
    this.project = project;
    this.store = store;
    this.handlers = handlers;
    this.machineHeld = machineHeld;
    this.now = now;
  }

  /** Starts each pending effect whose channel is free; waiters are retried only after a change, or one would spin. */
  kick(after: "change" | "freed" = "change"): void {
    if (this.disposed) return;
    if (after === "change") this.waiting.clear();
    const pending = this.store.pending();
    for (const effect of pending) {
      if (this.inFlight.has(effect.key) || this.waiting.has(effect.key)) continue;
      const channel = channelOf(effect.body);
      if (this.busyChannels.has(channel) || this.paused.has(channel)) continue;
      if (LOADS_MACHINE.has(effect.body.kind) && this.machineHeld()) continue;
      const to = effect.body.kind === "deliver" ? effect.body.to : null;
      const batch =
        to === null
          ? [effect]
          : pending.filter((p) => p.body.kind === "deliver" && p.body.to === to && !this.inFlight.has(p.key));
      for (const e of batch) this.inFlight.add(e.key);
      this.busyChannels.add(channel);
      void this.run(batch, channel)
        .catch((error: unknown) => {
          daemonLog.error(`project ${this.project.id}: effect ${effect.key} could not be counted as tried`, error);
        })
        .then(() => {
          for (const e of batch) this.inFlight.delete(e.key);
          this.busyChannels.delete(channel);
          // An effect its channel held back while this one ran starts now.
          this.retry();
        });
    }
  }

  get busy(): boolean {
    return this.inFlight.size > 0;
  }

  /** Settles when nothing is in flight; for tests and for a clean unload. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await new Promise((resolve) => setImmediate(resolve));
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** One effect to its satellite and its facts to the record; a throw anywhere on the way is a try that failed. */
  private async run(batch: readonly PendingEffect[], channel: string): Promise<void> {
    const effect = batch[0]!;
    const context = { project: this.project.id, state: this.project.view, key: effect.key };
    try {
      const handled =
        effect.body.kind === "deliver"
          ? await this.handlers.deliver(
              batch.map((e) => e.body as Delivery),
              context,
            )
          : await (this.handlers[effect.body.kind] as EffectHandler)(effect.body, context);
      if (handled.status === "wait") {
        for (const e of batch) this.waiting.add(e.key);
        return;
      }
      if (this.disposed) return;
      const at = this.now().toISOString();
      // Facts before the settle: a crash between them re-runs the effect, and its facts come back with the same ids.
      const facts = handled.status === "done" || handled.status === "failed" ? (handled.facts ?? []) : [];
      const caller: Caller = { kind: "bridge" };
      for (const [i, body] of facts.entries()) {
        const outcome = await this.project.submit({ id: `fact:${effect.key}:${i}`, at, caller, body });
        if (!outcome.ok)
          daemonLog.error(`project ${this.project.id}: fact for ${effect.key} refused: ${outcome.refused.says}`);
      }
      const settled = handled.status === "done" ? batch.slice(0, handled.taken) : batch;
      for (const e of settled)
        this.store.settle(e.key, handled.status, handled.status === "done" ? null : handled.why, at);
    } catch (error) {
      if (this.disposed) return;
      // The pause is set before anything else is asked of the store, so a store that throws too cannot make it spin.
      const last = effect.attempts + 1 >= MAX_ATTEMPTS;
      this.pause(channel, last ? 0 : 2 ** effect.attempts * 1000);
      this.store.attempted(effect.key);
      if (!last) return;
      this.store.settle(effect.key, "abandoned", String(error), this.now().toISOString());
      daemonLog.error(`project ${this.project.id}: effect ${effect.key} failed ${MAX_ATTEMPTS} times`, error);
    }
  }

  /** Holds a channel back, its order kept, and starts it again when the pause ends, whatever changed meanwhile. */
  private pause(channel: string, ms: number): void {
    this.paused.add(channel);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.paused.delete(channel);
      this.retry();
    }, ms);
    timer.unref();
    this.timers.add(timer);
  }

  /** Starts what a freed channel or an ended pause lets start; a store that cannot be read is said, not thrown. */
  private retry(): void {
    try {
      this.kick("freed");
    } catch (error) {
      daemonLog.error(`project ${this.project.id}: its pending effects could not be read`, error);
    }
  }
}

/** The lane an effect runs in: one at a time per agent, per scope, per scope's checks, or for the machine and publishing. */
function channelOf(e: EffectBody): string {
  switch (e.kind) {
    case "deliver":
      return `agent:${e.to}`;
    case "agent.create":
    case "agent.archive":
    case "agent.permission":
      return `agent:${e.actor}`;
    case "workspace.create":
    case "workspace.candidate":
    case "workspace.advance":
    case "workspace.remove":
      return `scope:${e.scope}`;
    // Checks run in a copy of their own, so nothing of the scope waits out a check: only its next check does.
    case "evidence.run":
      return `checks:${e.scope}`;
    case "workspace.publish":
      return "publish";
    case "machine.hold":
      return "machine";
  }
}
