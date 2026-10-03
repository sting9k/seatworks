import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "../../shared/contracts/ids.ts";
import type { Scope } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";

/** Where every branch the plugin has made for a project's lanes lives. */
export function branchesOf(project: string): string {
  return `sw/${project}/`;
}

/** The branch a lane's work is done on, checked out in the worktree made for the lane. */
export const laneBranch = (project: string, lane: string): string => `${branchesOf(project)}${lane}`;

/** A scope and every scope it is under, by id. */
function above(state: State, scope: Scope): Set<string> {
  const ids = new Set([scope.id]);
  for (let up = scope.parent; up !== null; up = state.scopes.get(up)?.parent ?? null) ids.add(up);
  return ids;
}

/** The scope under the root that a scope's work belongs to: the root's own for the root. */
export function laneOf(state: State, scope: Scope): Scope {
  let at = scope;
  for (let up = at.parent; up !== null && up !== ROOT; up = at.parent) {
    const parent = state.scopes.get(up);
    if (!parent) break;
    at = parent;
  }
  return at;
}

/** Whether a scope's agent works in a folder others work in too: any seat of a lane but one that writes it and seats nobody. */
export function shares(
  state: State,
  scope: Scope,
  role: { readonly writes: boolean; readonly delegates: boolean },
): boolean {
  if (scope.id === ROOT || scope.kind === "watch") return false;
  return laneOf(state, scope).id !== scope.id || !role.writes || role.delegates;
}

/** Where a seat reads whose each path of its lane is: a file a seat, kept as the record moves. */
export const heldFile = (scratch: string, actor: string): string => join(scratch, "held", actor);

/** Whose each path is in the worktree a scope works in, a line each, the first that holds a file deciding: no scope is its own. */
export function heldBeside(state: State, scope: Scope): string {
  const lane = laneOf(state, scope).id;
  const over = above(state, scope);
  const under: Scope[] = [];
  const beside: Scope[] = [];
  for (const other of state.scopes.values()) {
    if (other.status !== "open" || other.id === ROOT || other.kind === "watch" || other.id === scope.id) continue;
    if (laneOf(state, other).id !== lane) continue;
    // What it handed out is the child's alone; what it works under holds its paths with it, unless that one writes too.
    if (above(state, other).has(scope.id)) under.push(other);
    else if (!over.has(other.id) || other.writes) beside.push(other);
  }
  // The innermost first: a path two of them hold is the one's that was given it last.
  const inner = (a: Scope, b: Scope) => above(state, b).size - above(state, a).size;
  const lines = [
    ...under.sort(inner).flatMap((other) => other.paths.map((path) => `${path}\t${other.id}`)),
    ...scope.paths.map((path) => `${path}\t`),
    ...beside.sort(inner).flatMap((other) => other.paths.map((path) => `${path}\t${other.id}`)),
  ];
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Writes each seated agent's file of whose each path is, where that has changed since it was written. */
export function keepHeld(scratch: string, state: State): void {
  for (const actor of state.actors.values()) {
    const scope = actor.status === "seated" ? state.scopes.get(actor.scope) : undefined;
    if (!scope || scope.id === ROOT || scope.kind === "watch") continue;
    const file = heldFile(scratch, actor.id);
    const held = heldBeside(state, scope);
    if (existsSync(file) && readFileSync(file, "utf8") === held) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, held);
  }
}
