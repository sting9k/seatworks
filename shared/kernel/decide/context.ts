import type { Caller, Command, CommandBody } from "../../contracts/commands.ts";
import type { EventBody } from "../../contracts/events.ts";
import { BRIDGE, HUMAN, ID_PREFIX, type IdKind, type Party } from "../../contracts/ids.ts";
import type { Actor, Line, Ref } from "../../contracts/ledger.ts";
import type { Profile, Role } from "../../contracts/profile.ts";
import type { State } from "../state.ts";

export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8" | "I9" | "I10" | "I11" | "I12";

/** Why a command was not taken: the invariant it would break, or what else is wrong with it (LEDGER.md §2). */
export type Refusal = { readonly invariant: InvariantId | "authority" | "unknown" | "state"; readonly says: string };

export function refuse(invariant: Refusal["invariant"], says: string): Refusal {
  return { invariant, says };
}

/** What one command's handler works with: the state before it, the events it has made so far, and ids to hand out. */
export class Context<B extends CommandBody = CommandBody> {
  readonly state: State;
  readonly profile: Profile;
  readonly command: Command;
  readonly body: B;
  readonly events: EventBody[] = [];
  private readonly counts: Record<IdKind, number>;

  constructor(state: State, profile: Profile, command: Command) {
    this.state = state;
    this.profile = profile;
    this.command = command;
    this.body = command.body as B;
    this.counts = { ...state.counters };
  }

  /** Who the command is from, as a line's origin or a message's sender. */
  get party(): Party {
    return partyOf(this.command.caller);
  }

  get at(): string {
    return this.command.at;
  }

  /** The sequence number the next event will get once appended. */
  get nextSeq(): number {
    return this.state.seq + this.events.length + 1;
  }

  next(kind: IdKind): string {
    this.counts[kind] += 1;
    return `${ID_PREFIX[kind]}${this.counts[kind]}`;
  }

  emit(...events: EventBody[]): void {
    this.events.push(...events);
  }

  /** The calling agent, seated, with its role; or a refusal. */
  agent(): { actor: Actor; role: Role } | Refusal {
    const caller = this.command.caller;
    if (caller.kind !== "agent") return refuse("authority", `${this.body.type} is an agent's command`);
    const actor = this.state.actors.get(caller.actor);
    if (!actor || actor.status !== "seated") return refuse("authority", `${caller.actor} is not seated`);
    const role = this.profile.roles.get(actor.role);
    if (!role) return refuse("authority", `${actor.role} is not a role in this profile`);
    return { actor, role };
  }

  /** A line written now by the caller; it is the Human's only when `via` is something the Human said (I9). */
  line(text: string, via: Ref | null = null): Line {
    const origin = via !== null && saidByHuman(this.state, via) ? HUMAN : this.party;
    return { id: this.next("line"), text, origin, via, at: this.at };
  }
}

export function partyOf(caller: Caller): Party {
  if (caller.kind === "agent") return caller.actor;
  return caller.kind === "human" ? HUMAN : BRIDGE;
}

/** Whether a reference points at words the Human put on the record: a message they wrote, or an answer they gave. */
export function saidByHuman(state: State, via: Ref): boolean {
  return (via.kind === "message" || via.kind === "question") && state.humanWords.has(via.id);
}

export function isRefusal(value: unknown): value is Refusal {
  return typeof value === "object" && value !== null && "invariant" in value && "says" in value;
}
