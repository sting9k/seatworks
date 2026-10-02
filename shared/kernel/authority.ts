import { type ActorId, HUMAN, type Party, type ScopeId, parentScopeId } from "../contracts/ids.ts";
import type { Actor, Scope } from "../contracts/ledger.ts";
import type { Profile, Relation, Role } from "../contracts/profile.ts";
import type { State } from "./state.ts";

/** Authority read off the scope graph (LEDGER.md §4), never off a role's name. */

export function scopeOf(state: State, id: ScopeId): Scope | undefined {
  return state.scopes.get(id);
}

/** The owner of a scope's parent; for the root, the Human, who stands where its parent would be. */
export function ownerOfParent(state: State, scope: Scope): Party | null {
  if (scope.parent === null) return HUMAN;
  return state.scopes.get(scope.parent)?.owner ?? null;
}

/** Where an attention about an actor goes, and who answers its permissions. */
export function ownerAbove(state: State, actor: Actor): Party | null {
  const scope = state.scopes.get(actor.scope);
  return scope ? ownerOfParent(state, scope) : null;
}

export function roleOf(profile: Profile, actor: Actor): Role | undefined {
  return profile.roles.get(actor.role);
}

/** Every scope below `id`, nearest first. */
export function descendants(state: State, id: ScopeId): Scope[] {
  const found: Scope[] = [];
  const queue = [id];
  for (let at = queue.shift(); at !== undefined; at = queue.shift())
    for (const scope of state.scopes.values())
      if (scope.parent === at) {
        found.push(scope);
        queue.push(scope.id);
      }
  return found;
}

/** Whether `inner` is `outer` or lies below it. */
export function isWithin(state: State, inner: ScopeId, outer: ScopeId): boolean {
  for (let at: ScopeId | null = inner; at !== null; at = state.scopes.get(at)?.parent ?? null)
    if (at === outer) return true;
  return false;
}

/** Whether an actor owns a scope above this one or watches: who is shown what the watch does and tells of it. */
export function standsAbove(state: State, actor: Party, scope: ScopeId): boolean {
  if (state.scopes.get(state.actors.get(actor)?.scope ?? "")?.kind === "watch") return true;
  for (let at = parentScopeId(scope); at !== null; at = parentScopeId(at))
    if (state.scopes.get(at)?.owner === actor) return true;
  return false;
}

/** Whether an actor looks at another: one in its own scope or below it, or, watching, one in what it watches over. */
export function mayLook(state: State, reader: Actor, target: Actor): boolean {
  const own = state.scopes.get(reader.scope);
  if (own?.kind === "watch") return own.over === "all" || own.over.some((o) => isWithin(state, target.scope, o));
  return isWithin(state, target.scope, reader.scope);
}

/** Whether a scope is one a reader is not shown: one that watches, to anyone but its own actor and those above it. */
export function isUnseen(state: State, reader: Party, scope: Scope): boolean {
  return scope.kind === "watch" && scope.owner !== reader && !standsAbove(state, reader, scope.id);
}

/** Whether a sender may start a message to a reader along its role's `speaksTo` (I10). */
export function maySpeak(state: State, profile: Profile, from: Actor, to: Party): boolean {
  const role = roleOf(profile, from);
  if (!role) return false;
  const may = (relation: Relation) => role.speaksTo.has(relation);
  if (to === HUMAN) return may("human");
  const reader = state.actors.get(to);
  if (!reader || reader.status !== "seated") return false;
  const own = state.scopes.get(from.scope);
  const theirs = state.scopes.get(reader.scope);
  if (!own || !theirs) return false;
  if (may("parent") && own.parent !== null && state.scopes.get(own.parent)?.owner === reader.id) return true;
  if (may("children") && theirs.parent === own.id) return true;
  if (may("descendants") && theirs.id !== own.id && isWithin(state, theirs.id, own.id)) return true;
  return false;
}

/** I7: whether a message from `from` reaches `reader` from outside its own scope and its parent's owner. */
export function fromOutside(state: State, from: Party, reader: Actor): boolean {
  const scope = state.scopes.get(reader.scope);
  if (!scope) return false;
  if (from === ownerOfParent(state, scope)) return false;
  const sender = state.actors.get(from);
  return !(sender && isWithin(state, sender.scope, scope.id));
}

/** The seated actor of a scope, if any. */
export function seatedIn(state: State, scope: ScopeId): ActorId | null {
  const owner = state.scopes.get(scope)?.owner ?? null;
  return owner !== null && state.actors.get(owner)?.status === "seated" ? owner : null;
}
