import { HUMAN } from "../contracts/ids.ts";
import type { Scope } from "../contracts/ledger.ts";
import type { Refusal } from "./decide/context.ts";
import { anyOverlap } from "./paths.ts";
import type { State } from "./state.ts";

/** The invariants that hold over the whole state, checked after every command and by the property tests (KERNEL.md §5). */

export function checkState(state: State): Refusal | null {
  return oneWriter(state) ?? delegatorsWriteNothing(state) ?? siblingsOrdered(state) ?? obligationsHeld(state);
}

/** I1: a scope's writer is its own seated actor, and no actor writes two scopes. */
function oneWriter(state: State): Refusal | null {
  const writing = new Map<string, string>();
  for (const scope of state.scopes.values()) {
    if (scope.status !== "open" || scope.writer === null) continue;
    const actor = state.actors.get(scope.writer);
    if (actor?.scope !== scope.id)
      return { invariant: "I1", says: `scope ${scope.id}'s writer ${scope.writer} is not seated in it` };
    const other = writing.get(scope.writer);
    if (other !== undefined)
      return { invariant: "I1", says: `${scope.writer} would write both ${other} and ${scope.id}` };
    writing.set(scope.writer, scope.id);
  }
  return null;
}

/** I2: a scope that delegates has no writer, so its owner never writes what its children hold. */
function delegatorsWriteNothing(state: State): Refusal | null {
  for (const scope of state.scopes.values())
    if (
      scope.status === "open" &&
      scope.writer !== null &&
      [...state.scopes.values()].some((c) => c.parent === scope.id && c.status === "open")
    )
      return { invariant: "I2", says: `scope ${scope.id} has a writer and open children` };
  return null;
}

/** I3: open siblings whose paths overlap wait one for the other, and `after` makes no cycle. */
function siblingsOrdered(state: State): Refusal | null {
  const open = [...state.scopes.values()].filter((s) => s.status === "open" && s.kind === "work");
  const byParent = new Map<string | null, Scope[]>();
  for (const s of open) byParent.set(s.parent, [...(byParent.get(s.parent) ?? []), s]);
  const waits = (a: Scope, b: Scope): boolean => {
    const seen = new Set<string>();
    const stack = [...a.after];
    for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
      if (at === b.id) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...(state.scopes.get(at)?.after ?? []));
    }
    return false;
  };
  for (const s of open)
    if (waits(s, s)) return { invariant: "I3", says: `scope ${s.id} would wait for itself through \`after\`` };
  for (const siblings of byParent.values())
    for (let i = 0; i < siblings.length; i++)
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i]!;
        const b = siblings[j]!;
        const shared = anyOverlap(a.paths, b.paths);
        if (shared !== null && !waits(a, b) && !waits(b, a))
          return {
            invariant: "I3",
            says: `scopes ${a.id} and ${b.id} both hold ${shared || "the whole tree"}; one must wait for the other`,
          };
      }
  return null;
}

/** I11: an open obligation is owed by someone who can act on it: a seated actor or the Human. */
function obligationsHeld(state: State): Refusal | null {
  for (const o of state.obligations.values())
    if (o.owedBy !== HUMAN && state.actors.get(o.owedBy)?.status !== "seated")
      return { invariant: "I11", says: `obligation ${o.id} would be owed by ${o.owedBy}, who is not seated` };
  return null;
}
