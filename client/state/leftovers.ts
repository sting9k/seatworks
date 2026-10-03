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

/** Sorts a scan; an attached project as a whole is left out, since it is removed from its own row. */
export function sortLeftovers(found: readonly Leftover[], attached: ReadonlySet<string>): Sorted {
  const rest = found.filter((left) => !(left.kind === "project" && attached.has(left.project)));
  const things = rest.filter((left) => left.kind !== "record");
  const costly = (left: Leftover) => left.takesCommits || left.kind === "project";
  return {
    safe: things.filter((left) => left.removable && !costly(left)),
    check: things.filter((left) => left.removable && costly(left)),
    kept: things.filter((left) => !left.removable),
    records: rest.filter((left) => left.kind === "record"),
  };
}
