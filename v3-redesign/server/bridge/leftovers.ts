import { ACTOR_LABEL, ROOT } from "../../shared/contracts/ids.ts";
import type { Leftover } from "../../shared/contracts/rpc.ts";
import type { State } from "../../shared/kernel/state.ts";
import type { Workspace } from "../satellites/workspace/workspace.ts";
import { branchesOf } from "./effects.ts";

/** An agent Paseo still keeps for a project, as the agent host lists it. */
export type Kept = {
  readonly host: string;
  readonly title: string | null;
  readonly labels: Readonly<Record<string, string>>;
};

/** A leftover's id: its kind, its project and what it names there, so a removal can be matched to a fresh listing. */
export function leftoverId(kind: Leftover["kind"], project: string, ref: string): string {
  return `${kind}:${project}:${ref}`;
}

/** What names the thing a leftover id points at: the copy's key, the branch, the agent's id, or nothing. */
export function refOf(id: string): string {
  return id.split(":").slice(2).join(":");
}

/**
 * What a project's team left behind: copies and branches no open scope uses, and agents whose seat ended but that Paseo
 * still keeps. A copy holding unsaved work is listed and never offered for removal.
 */
export async function leftoversOf(
  project: string,
  view: State,
  workspace: Workspace,
  agents: readonly Kept[],
): Promise<Leftover[]> {
  const open = [...view.scopes.values()].filter((s) => s.status === "open");
  const usedPaths = new Set(open.map((s) => workspace.pathOf(s.id)));
  const usedBranches = new Set(open.flatMap((s) => (s.branch ? [s.branch] : [])));
  const base = view.scopes.get(ROOT)?.branch ?? null;
  const found: Leftover[] = [];
  for (const copy of await workspace.onDisk())
    if (!usedPaths.has(copy.path))
      found.push({
        id: leftoverId("copy", project, copy.key),
        kind: "copy",
        project,
        label: copy.path,
        why: copy.unsaved
          ? `no open scope uses it, but ${copy.branch ?? "it"} has uncommitted work there: commit or move it first`
          : "no open scope uses it",
        removable: !copy.unsaved,
      });
  for (const b of await workspace.branchesUnder(branchesOf(project), base))
    if (!usedBranches.has(b.branch))
      found.push({
        id: leftoverId("branch", project, b.branch),
        kind: "branch",
        project,
        label: b.branch,
        why: b.merged
          ? `no open scope uses it, and ${base ?? "the base"} holds its work`
          : `no open scope uses it, and it is not merged into ${base ?? "the base"}: its commits go with it`,
        removable: true,
      });
  for (const a of agents) {
    const actor = view.actors.get(a.labels[ACTOR_LABEL] ?? "");
    if (actor?.status !== "seated")
      found.push({
        id: leftoverId("agent", project, a.host),
        kind: "agent",
        project,
        label: a.title ?? a.host,
        why: actor
          ? `its seat was ${actor.status}, but Paseo still keeps the agent`
          : "no seat of the project names it",
        removable: true,
      });
  }
  return found;
}

/** The whole project as one leftover: what removing it ends and deletes. */
export function projectLeftover(project: string, repo: string, view: State | null): Leftover {
  const seated = view ? [...view.actors.values()].filter((a) => a.status === "seated").length : 0;
  const open = view ? [...view.scopes.values()].filter((s) => s.status === "open" && s.id !== ROOT).length : 0;
  const why =
    view === null
      ? "its repository is gone: removing archives its agents and keeps its record aside"
      : seated > 0 || open > 0
        ? `${seated} agents seated and ${open} scopes open: removing archives them, deletes the project's copies and branches, and keeps its record aside`
        : "removing deletes the project's copies and branches, and keeps its record aside for a look back";
  return { id: leftoverId("project", project, ""), kind: "project", project, label: repo, why, removable: true };
}
