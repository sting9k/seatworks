import type { Effect } from "../contracts/effects.ts";
import { HUMAN } from "../contracts/ids.ts";
import { ownerOfParent } from "../kernel/authority.ts";
import type { State } from "../kernel/state.ts";

type Pending = Effect & { readonly attempts: number };
type Abandoned = Effect & { readonly why: string };

/**
 * What looks stuck, as facts for the Human: effects the satellites keep throwing on or gave up on, open scopes with
 * nobody seated, and words queued for a seated actor whose agent never started. It reads and changes nothing.
 */
export function stuckOf(state: State, pending: readonly Pending[], abandoned: readonly Abandoned[]): string[] {
  const lines: string[] = [];
  for (const e of abandoned) lines.push(`Effect ${e.key} (${e.body.kind}) was given up: ${e.why}`);
  for (const e of pending)
    if (e.attempts > 0)
      lines.push(
        `Effect ${e.key} (${e.body.kind}) has thrown ${e.attempts} time${e.attempts === 1 ? "" : "s"} and is tried again.`,
      );
  for (const scope of state.scopes.values()) {
    if (scope.status !== "open") continue;
    const owner = scope.owner === null ? undefined : state.actors.get(scope.owner);
    if (owner?.status === "seated") continue;
    const above = ownerOfParent(state, scope);
    const by = above === null ? "nobody" : above === HUMAN ? "the Human" : above;
    lines.push(`Scope ${scope.id} is open with nobody seated; its parent's owner is ${by}.`);
  }
  const waiting = new Map<string, number>();
  for (const e of pending) if (e.body.kind === "deliver") waiting.set(e.body.to, (waiting.get(e.body.to) ?? 0) + 1);
  for (const [id, n] of waiting) {
    const actor = state.actors.get(id);
    if (actor?.status === "seated" && actor.host === null)
      lines.push(
        `${id} is seated on scope ${actor.scope} with no agent yet: ${n} deliver${n === 1 ? "y waits" : "ies wait"} for it.`,
      );
  }
  return lines;
}
