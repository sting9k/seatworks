import type { Command } from "../contracts/commands.ts";
import { HUMAN, type Party } from "../contracts/ids.ts";
import type { Actor, Scope } from "../contracts/ledger.ts";
import type { Profile, Relation } from "../contracts/profile.ts";
import { isWithin, ownerOfParent } from "./authority.ts";
import { namedIn } from "./named.ts";
import type { State } from "./state.ts";

/** What the record shows of where a refused command's caller stands; facts only, never advice. */
export function standing(state: State, profile: Profile, command: Command): readonly string[] {
  const caller = command.caller;
  const lines: string[] = [];
  let self: Actor | undefined;
  if (caller.kind === "human") lines.push("You are the Human: you stand where the root's parent would.");
  if (caller.kind === "agent") {
    self = state.actors.get(caller.actor);
    if (!self) lines.push(`You are ${caller.actor}, who has no seat on the record.`);
    else if (self.status !== "seated") lines.push(`You are ${self.id}, ${self.status}: you hold no seat now.`);
    else {
      const scope = state.scopes.get(self.scope);
      const above = scope ? ownerOfParent(state, scope) : null;
      lines.push(`You are ${self.id}, a ${self.role} seated on scope ${self.scope}, under ${partyText(above)}.`);
      const role = profile.roles.get(self.role);
      if (role && scope) {
        const to = [...role.speaksTo].map((r) => spokenTo(state, scope, r));
        lines.push(`Your role speaks to: ${to.length > 0 ? to.join("; ") : "nobody"}.`);
      }
    }
  }
  for (const id of namedIn(command.body)) {
    if (id === self?.id || id === self?.scope) continue;
    const scope = state.scopes.get(id);
    if (scope) lines.push(scopeText(state, scope));
    else {
      const actor = state.actors.get(id);
      if (actor) lines.push(`${actor.id}: a ${actor.role}, ${actor.status} on scope ${actor.scope}.`);
    }
  }
  return lines;
}

function spokenTo(state: State, own: Scope, relation: Relation): string {
  switch (relation) {
    case "human":
      return "the Human";
    case "parent":
      return `your parent's owner (${partyText(own.parent === null ? null : ownerOfParent(state, own))})`;
    case "children":
      return `your children (${seatedList(state, (s) => s.parent === own.id)})`;
    case "descendants":
      return `those below you (${seatedList(state, (s) => s.id !== own.id && isWithin(state, s.id, own.id))})`;
    default: {
      const never: never = relation;
      return never;
    }
  }
}

function seatedList(state: State, which: (s: Scope) => boolean): string {
  const ids = [...state.scopes.values()]
    .filter((s) => s.status === "open" && which(s) && s.owner !== null)
    .map((s) => s.owner)
    .filter((a): a is string => a !== null && state.actors.get(a)?.status === "seated");
  return ids.length > 0 ? ids.join(", ") : "none seated";
}

function scopeText(state: State, scope: Scope): string {
  const owner = scope.owner === null ? undefined : state.actors.get(scope.owner);
  const who = owner?.status === "seated" ? `owned by ${owner.id}, a ${owner.role}` : "owned by nobody seated";
  const parent =
    scope.parent === null
      ? "the root, under the Human"
      : `parent ${scope.parent}, owned by ${partyText(ownerOfParent(state, scope))}`;
  const marks = [scope.status, ...(scope.held ? ["held"] : []), ...(scope.integrating ? ["being integrated"] : [])];
  return `Scope ${scope.id}: ${who}; ${parent}; ${marks.join(", ")}.`;
}

function partyText(p: Party | null): string {
  return p === null ? "nobody" : p === HUMAN ? "the Human" : p;
}
