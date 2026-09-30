import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type Caller, parseBody } from "../../shared/contracts/commands.ts";
import type { Effect } from "../../shared/contracts/effects.ts";
import type { Event } from "../../shared/contracts/events.ts";
import { type Profile, ProfileFileSchema, resolveProfile } from "../../shared/contracts/profile.ts";
import { decide } from "../../shared/kernel/decider.ts";
import type { Refusal } from "../../shared/kernel/decide/context.ts";
import { evolve, foldCommand } from "../../shared/kernel/evolve.ts";
import { react } from "../../shared/kernel/react.ts";
import { INITIAL, type State } from "../../shared/kernel/state.ts";

export function slpProfile(): Profile {
  const file = ProfileFileSchema.parse(
    parse(readFileSync(join(import.meta.dirname, "../../profile/slp/profile.yaml"), "utf8")),
  );
  const resolved = resolveProfile(file);
  if (!resolved.ok) throw new Error(resolved.says);
  return resolved.profile;
}

export type Outcome =
  { ok: true; events: Event[]; effects: Effect[] } | { ok: false; refused: Refusal; standing: readonly string[] };

/** The kernel driven as the shell drives it: parse at the boundary, decide, stamp, fold, react. */
export class Ledger {
  state: State = INITIAL;
  readonly log: Event[] = [];
  readonly effects: Effect[] = [];
  private commands = 0;
  readonly profile: Profile;

  constructor(profile: Profile = slpProfile()) {
    this.profile = profile;
  }

  send(caller: Caller, type: string, args: Record<string, unknown> = {}): Outcome {
    const parsed = parseBody(type, args);
    if (!parsed.ok) throw new Error(`${type}: ${parsed.says}`);
    this.commands += 1;
    const at = new Date(Date.UTC(2026, 8, 29, 0, 0, this.commands)).toISOString();
    const commandId = `cmd-${this.commands}`;
    const by = caller.kind === "agent" ? caller.actor : caller.kind;
    const decision = decide({ id: commandId, at, caller, body: parsed.body }, this.state, this.profile);
    if (!decision.ok) return decision;
    const events: Event[] = [];
    const effects: Effect[] = [];
    let seq = this.state.seq;
    for (const body of decision.events) events.push({ ...body, seq: ++seq, at, by, commandId });
    let folding = this.state;
    for (const event of events) {
      folding = evolve(folding, event);
      effects.push(...react(event, folding));
    }
    this.state = foldCommand(this.state, events);
    this.log.push(...events);
    this.effects.push(...effects);
    return { ok: true, events, effects };
  }

  as(actor: string, type: string, args: Record<string, unknown> = {}): Outcome {
    return this.send({ kind: "agent", actor }, type, args);
  }

  human(type: string, args: Record<string, unknown> = {}): Outcome {
    return this.send({ kind: "human" }, type, args);
  }

  fact(type: string, args: Record<string, unknown> = {}): Outcome {
    return this.send({ kind: "bridge" }, type, args);
  }

  /** Sends and requires success, for the steps a scenario sets up. */
  must(outcome: Outcome): Event[] {
    if (!outcome.ok) throw new Error(`refused ${outcome.refused.invariant}: ${outcome.refused.says}`);
    return outcome.events;
  }
}

export const brief = (goal: string, extra: Record<string, unknown> = {}) => ({
  goal: { text: goal },
  kind: "discovery",
  ...extra,
});
export const plan = (goal: string, usd: number | null = null) => ({
  goal: { text: goal },
  appetite: { line: { text: "a day" }, usd },
});
export const SHA = (n: number) => n.toString(16).padStart(40, "a");

/** A project with a Supervisor (a1), a lane under it with its Lead (a2), and one Peer (a3) on src/net/. */
export function team(ledger = new Ledger()) {
  ledger.must(ledger.human("open_project", { base: "main", profileHash: "p1", model: "slp-supervisor" }));
  ledger.must(ledger.fact("record_workspace", { scope: "root", ok: true, branch: "main", head: SHA(0) }));
  ledger.must(
    ledger.as("a1", "open_scope", {
      parent: "root",
      role: "lead",
      paths: ["src/"],
      brief: brief("Ship the net layer"),
    }),
  );
  ledger.must(ledger.fact("record_workspace", { scope: "1", ok: true, branch: "sw/1" }));
  ledger.must(ledger.as("a2", "set_plan", { scope: "1", plan: plan("Ship the net layer", 50) }));
  ledger.must(
    ledger.as("a2", "open_scope", {
      parent: "1",
      role: "peer",
      paths: ["src/net/"],
      brief: brief("Encode directions", { constraints: [{ text: "int16 precision" }] }),
    }),
  );
  ledger.must(ledger.fact("record_workspace", { scope: "1.1", ok: true, branch: "sw/1.1" }));
  return { ledger, supervisor: "a1", lead: "a2", peer: "a3", lane: "1", task: "1.1" };
}

export function refusedBy(outcome: Outcome): string | null {
  return outcome.ok ? null : outcome.refused.invariant;
}
