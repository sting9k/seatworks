import type { Caller, CommandBody } from "../../shared/contracts/commands.ts";
import { type EffectBody, LOADS_MACHINE } from "../../shared/contracts/effects.ts";
import type { State } from "../../shared/kernel/state.ts";
import { daemonLog } from "../core/logger.ts";
import type { PendingEffect, ProjectStore } from "../satellites/store/project-store.ts";
import type { Project } from "./project.ts";

/** What a satellite made of an effect. `wait` leaves it pending with no attempt counted: a busy reader, a held machine. */
export type Handled =
  | { status: "done"; facts?: readonly CommandBody[] }
  | { status: "dropped"; why: string }
  | { status: "wait" }
  | { status: "failed"; why: string; facts?: readonly CommandBody[] };

export type EffectHandler<K extends EffectBody["kind"] = EffectBody["kind"]> = (
  effect: Extract<EffectBody, { kind: K }>,
  context: { project: string; state: State; key: string },
) => Promise<Handled>;

export type Handlers = { [K in EffectBody["kind"]]: EffectHandler<K> };

/** Tries before an effect that keeps throwing is settled as failed and logged. */
const MAX_ATTEMPTS = 5;

/**
 * Carries a project's pending effects to their satellites and their facts back as commands (CORE.md, Dispatch).
 * Effects on different channels (one agent, one scope) run side by side; one channel runs one effect at a time.
 */
export class Dispatcher {
  private readonly inFlight = new Set<string>();
  private readonly busyChannels = new Set<string>();
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

  /** Starts every pending effect whose channel is free; called after each commit, on start, and when a hold lifts. */
  kick(): void {
    if (this.disposed) return;
    for (const effect of this.store.pending()) {
      if (this.inFlight.has(effect.key)) continue;
      const channel = channelOf(effect.body);
      if (this.busyChannels.has(channel)) continue;
      if (LOADS_MACHINE.has(effect.body.kind) && this.machineHeld()) continue;
      this.inFlight.add(effect.key);
      this.busyChannels.add(channel);
      void this.run(effect).finally(() => {
        this.inFlight.delete(effect.key);
        this.busyChannels.delete(channel);
      });
    }
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

  private async run(effect: PendingEffect): Promise<void> {
    const handler = this.handlers[effect.body.kind] as EffectHandler;
    let handled: Handled;
    try {
      handled = await handler(effect.body, { project: this.project.id, state: this.project.view, key: effect.key });
    } catch (error) {
      this.store.attempted(effect.key);
      if (effect.attempts + 1 >= MAX_ATTEMPTS) {
        this.store.settle(effect.key, "failed", String(error), this.now().toISOString());
        daemonLog.error(`project ${this.project.id}: effect ${effect.key} failed ${MAX_ATTEMPTS} times`, error);
      } else this.later(2 ** effect.attempts * 1000);
      return;
    }
    if (handled.status === "wait" || this.disposed) return;
    const at = this.now().toISOString();
    // Facts before the settle: a crash between them re-runs the effect, and its facts come back with the same ids.
    const facts = handled.status === "done" || handled.status === "failed" ? (handled.facts ?? []) : [];
    const caller: Caller = { kind: "bridge" };
    for (const [i, body] of facts.entries()) {
      const outcome = await this.project.submit({ id: `fact:${effect.key}:${i}`, at, caller, body });
      if (!outcome.ok)
        daemonLog.error(`project ${this.project.id}: fact for ${effect.key} refused: ${outcome.refused.says}`);
    }
    this.store.settle(effect.key, handled.status, handled.status === "done" ? null : handled.why, at);
  }

  private later(ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.kick();
    }, ms);
    timer.unref();
    this.timers.add(timer);
  }
}

/** The lane an effect runs in: one at a time per agent, per scope, or for the machine and publishing. */
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
    case "evidence.run":
      return `scope:${e.scope}`;
    case "workspace.publish":
      return "publish";
    case "machine.hold":
      return "machine";
  }
}
