import { graphlib, layout } from "@dagrejs/dagre";
import type { Anchored } from "../template/fold.ts";

type Size = { readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };
type Laid = {
  readonly nodes: readonly Anchored[];
  readonly wires: readonly { readonly from: string; readonly to: string }[];
};

const GAP = 12;
/** Between two families no wire places: room for the frame each may sit in. */
const APART = 80;
/** A role's opened equipment: a column of nodes this wide at its left, this far from it, this far apart. */
export const FAN = { width: 220, gap: 56, pitch: 48 } as const;
/** Between a role and the roles it seats: room for the equipment of one of them, opened. */
export const BETWEEN_ROLES = FAN.width + FAN.gap * 2;

/** Where a role's opened equipment sits, counted from the role's own corner: the `at`-th of `of`, in a column. */
export const fanned = (roleHeight: number, at: number, of: number): Point => ({
  x: -(FAN.width + FAN.gap),
  y: Math.round(roleHeight / 2 - (of * FAN.pitch) / 2 + at * FAN.pitch),
});

/** Where each node sits when none is kept: what a role seats right of it, each unwired family in its own rows. */
export function laidOut(graph: Laid, sizes: ReadonlyMap<string, Size>, between: number): Map<string, Point> {
  const beside = new Map(graph.nodes.map((node) => [node.id, node.beside]));
  /** A node's box: as tall as the column it may open beside it, so two columns never meet. */
  const boxOf = (id: string): Size => {
    const size = sizes.get(id)!;
    return { width: size.width, height: Math.max(size.height, beside.get(id)! * FAN.pitch) };
  };
  const wired = new graphlib.Graph();
  wired.setGraph({ rankdir: "LR", nodesep: 24, ranksep: between });
  wired.setDefaultEdgeLabel(() => ({}));
  for (const wire of graph.wires) {
    for (const id of [wire.from, wire.to]) wired.setNode(id, boxOf(id));
    wired.setEdge(wire.from, wire.to);
  }
  layout(wired);

  const placed = new Map<string, Point>();
  let right = 0;
  let bottom = 0;
  for (const id of wired.nodes()) {
    const at = wired.node(id) as Size & Point;
    placed.set(id, { x: at.x - at.width / 2, y: at.y - sizes.get(id)!.height / 2 });
    right = Math.max(right, at.x + at.width / 2);
    bottom = Math.max(bottom, at.y + at.height / 2);
  }

  let x = 0;
  let y = bottom + 120;
  let rowHeight = 0;
  let family: string | null = null;
  for (const node of graph.nodes) {
    if (placed.has(node.id)) continue;
    const size = sizes.get(node.id)!;
    const another = family !== null && node.family !== family;
    if (x > 0 && (another || x + size.width > right)) {
      x = 0;
      y += rowHeight + (another ? APART : GAP);
      rowHeight = 0;
    }
    family = node.family;
    placed.set(node.id, { x, y });
    x += size.width + GAP;
    rowHeight = Math.max(rowHeight, size.height);
  }
  return placed;
}
