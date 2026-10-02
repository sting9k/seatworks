import { graphlib, layout } from "@dagrejs/dagre";
import type { Graph } from "../template/graph.ts";

type Size = { readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };

const GAP = 12;

/** Where each node sits when a template keeps no positions: inputs left of a role, what it seats right of it. */
export function laidOut(graph: Graph, sizes: ReadonlyMap<string, Size>): Map<string, Point> {
  const wired = new graphlib.Graph();
  wired.setGraph({ rankdir: "LR", nodesep: 10, ranksep: 140 });
  wired.setDefaultEdgeLabel(() => ({}));
  for (const wire of graph.wires) {
    for (const id of [wire.from, wire.to]) wired.setNode(id, { ...sizes.get(id)! });
    wired.setEdge(wire.from, wire.to);
  }
  layout(wired);

  const placed = new Map<string, Point>();
  let right = 0;
  let bottom = 0;
  for (const id of wired.nodes()) {
    const at = wired.node(id) as Size & Point;
    placed.set(id, { x: at.x - at.width / 2, y: at.y - at.height / 2 });
    right = Math.max(right, at.x + at.width / 2);
    bottom = Math.max(bottom, at.y + at.height / 2);
  }

  let x = 0;
  let y = bottom + 120;
  let rowHeight = 0;
  for (const node of graph.nodes) {
    if (placed.has(node.id)) continue;
    const size = sizes.get(node.id)!;
    if (x > 0 && x + size.width > right) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    placed.set(node.id, { x, y });
    x += size.width + GAP;
    rowHeight = Math.max(rowHeight, size.height);
  }
  return placed;
}
