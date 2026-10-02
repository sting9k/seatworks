import type { Effect } from "../contracts/effects.ts";
import { HUMAN } from "../contracts/ids.ts";
import type { Profile } from "../contracts/profile.ts";
import { ownerOfParent } from "../kernel/authority.ts";
import type { State } from "../kernel/state.ts";

type Pending = Effect & { readonly attempts: number };
type Abandoned = Effect & { readonly why: string };

/** What looks stuck, as facts for the Human: effects given up on, empty seats, unread words, a role gone, no tools. */
export function stuckOf(
  state: State,
  pending: readonly Pending[],
  abandoned: readonly Abandoned[],
  profile: Profile,
): string[] {
  const lines: string[] = [];
  for (const actor of state.actors.values())
    if (actor.status === "seated" && !profile.roles.has(actor.role))
      lines.push(
        `${actor.id} is seated on scope ${actor.scope} in a role the project's profile no longer has; its tools are refused until the profile has the role again or the seat is released.`,
      );
  for (const actor of state.actors.values())
    if (actor.status === "seated" && actor.host !== null && actor.turns > 0 && !actor.tools)
      lines.push(
        `${actor.id} is seated on scope ${actor.scope} and has ended a turn, but its agent's tools have never reached the plugin: it has none of the team's tools.`,
      );
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
