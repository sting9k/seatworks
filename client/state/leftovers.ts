import type { Leftover } from "../../shared/contracts/rpc.ts";

/** What teams left behind, sorted by what removing it costs. */
export type Sorted = {
  /** Nothing is lost with it: picked for the Human. */
  readonly safe: readonly Leftover[];
  /** Commits on no other branch go with it, or it is a project whole: the Human looks first. */
  readonly check: readonly Leftover[];
  /** It cannot be removed, and says why. */
  readonly kept: readonly Leftover[];
  /** The record of a project already removed. */
  readonly records: readonly Leftover[];
};

/** Sorts a scan; an attached project as a whole is left out, since it is removed from its own page. */
export function sortLeftovers(found: readonly Leftover[], attached: ReadonlySet<string>): Sorted {
  const rest = found.filter((left) => !(left.kind === "project" && attached.has(left.project)));
  const things = rest.filter((left) => left.kind !== "record");
  const costly = (left: Leftover) => left.unmerged > 0 || left.kind === "project";
  return {
    safe: things.filter((left) => left.removable && !costly(left)),
    check: things.filter((left) => left.removable && costly(left)),
    kept: things.filter((left) => !left.removable),
    records: rest.filter((left) => left.kind === "record"),
  };
}

/** A leftover's state in a word or two for its line; a warning is what the Human looks at first. */
export function tagOf(
  left: Leftover,
): { readonly label: string; readonly tone: "neutral" | "warning" | "success" } | null {
  if (left.kind === "copy" && !left.removable) return { label: "uncommitted work", tone: "neutral" };
  if (left.kind === "agent") return { label: "seat ended", tone: "neutral" };
  if (left.kind !== "branch") return null;
  return left.unmerged > 0
    ? { label: `${left.unmerged} commit${left.unmerged === 1 ? "" : "s"} not merged`, tone: "warning" }
    : { label: "merged", tone: "success" };
}

const KINDS = [
  ["copy", "copy", "copies"],
  ["branch", "branch", "branches"],
  ["agent", "agent", "agents"],
] as const;

/** What one project's team left behind, counted by kind for a line, with what it takes on disk. */
export function leftBy(found: readonly Leftover[], project: string): { says: string | null; bytes: number } {
  const counted = KINDS.flatMap(([kind, one, many]) => {
    const left = found.filter((thing) => thing.project === project && thing.kind === kind);
    return left.length === 0 ? [] : [{ says: `${left.length} ${left.length === 1 ? one : many}`, left }];
  });
  return {
    says: counted.length > 0 ? counted.map((kind) => kind.says).join(", ") : null,
    bytes: counted.flatMap((kind) => kind.left).reduce((sum, thing) => sum + (thing.bytes ?? 0), 0),
  };
}
