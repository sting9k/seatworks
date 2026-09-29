import type { Command } from "../../shared/contracts/commands.ts";
import type { Effect } from "../../shared/contracts/effects.ts";
import type { Event } from "../../shared/contracts/events.ts";
import type { Profile } from "../../shared/contracts/profile.ts";
import type { Refusal } from "../../shared/kernel/decide/context.ts";
import { decide } from "../../shared/kernel/decider.ts";
import { evolve, foldCommand } from "../../shared/kernel/evolve.ts";
import { react } from "../../shared/kernel/react.ts";
import { INITIAL, type State } from "../../shared/kernel/state.ts";
import { decode, encode } from "../core/codec.ts";
import { KeyedQueue } from "../core/keyed-queue.ts";
import type { ProjectStore } from "../satellites/store/project-store.ts";

export type Submitted = { ok: true; events: readonly Event[]; replayed: boolean } | { ok: false; refused: Refusal };

/** A snapshot every so many events, so a restart folds little. */
const SNAPSHOT_EVERY = 500;

/**
 * One project's shell around the kernel: one writer, commands one at a time, events and their effects committed
 * together, nothing kept in memory the log does not hold (CORE.md, The shell).
 */
export class Project {
  readonly id: string;
  private state: State;
  private readonly store: ProjectStore;
  private readonly profile: Profile;
  private readonly queue = new KeyedQueue<string>();
  private readonly listeners = new Set<(events: readonly Event[]) => void>();
  private sinceSnapshot = 0;

  private constructor(id: string, store: ProjectStore, profile: Profile, state: State) {
    this.id = id;
    this.store = store;
    this.profile = profile;
    this.state = state;
  }

  /** Folds the log from the latest snapshot, one command's events at a time, as they were first folded. */
  static open(id: string, store: ProjectStore, profile: Profile): Project {
    const snapshot = store.latestSnapshot();
    let state = snapshot ? (decode(snapshot.state) as State) : INITIAL;
    let batch: Event[] = [];
    for (const event of store.read(state.seq)) {
      if (batch.length > 0 && batch[0]!.commandId !== event.commandId) {
        state = foldCommand(state, batch);
        batch = [];
      }
      batch.push(event);
    }
    if (batch.length > 0) state = foldCommand(state, batch);
    return new Project(id, store, profile, state);
  }

  get view(): State {
    return this.state;
  }

  /** Decides, commits and folds one command; a command id seen before gets its earlier events and changes nothing. */
  submit(command: Command): Promise<Submitted> {
    return this.queue.run("writer", () => this.take(command));
  }

  onCommitted(listener: (events: readonly Event[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    if (this.sinceSnapshot > 0) this.store.putSnapshot(this.state.seq, encode(this.state));
    this.store.close();
  }

  private take(command: Command): Submitted {
    const earlier = this.store.commandEvents(command.id);
    if (earlier.length > 0) return { ok: true, events: earlier, replayed: true };
    const decision = decide(command, this.state, this.profile);
    if (!decision.ok) return decision;
    if (decision.events.length === 0) return { ok: true, events: [], replayed: false };

    const by = command.caller.kind === "agent" ? command.caller.actor : command.caller.kind;
    let seq = this.state.seq;
    const events = decision.events.map((body) => ({ ...body, seq: ++seq, at: command.at, by, commandId: command.id }));
    const effects: Effect[] = [];
    let folding = this.state;
    for (const event of events) {
      folding = evolve(folding, event);
      effects.push(...react(event, folding));
    }
    const appended = this.store.append(events, effects, this.state.seq);
    if (!appended.ok) throw new Error(`project ${this.id}: ${appended.says}`);
    this.state = foldCommand(this.state, events);

    this.sinceSnapshot += events.length;
    if (this.sinceSnapshot >= SNAPSHOT_EVERY) {
      this.store.putSnapshot(this.state.seq, encode(this.state));
      this.sinceSnapshot = 0;
    }
    for (const listener of this.listeners) listener(events);
    return { ok: true, events, replayed: false };
  }
}
