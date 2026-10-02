import { useMemo } from "react";
import type { Graph } from "../template/graph.ts";
import { laidOut } from "./layout.ts";

const ROLE = { width: 80, height: 60 };
const SMALL = { width: 64, height: 12 };

/** A template's cover in the gallery: its own graph, drawn small. */
export function Cover({ graph }: { graph: Graph }) {
  const drawn = useMemo(() => {
    const sizes = new Map(graph.nodes.map((node) => [node.id, node.kind === "role" ? ROLE : SMALL]));
    const placed = laidOut(graph, sizes);
    const boxes = graph.nodes.map((node) => ({ node, ...placed.get(node.id)!, ...sizes.get(node.id)! }));
    const middle = new Map(boxes.map((box) => [box.node.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]));
    return {
      boxes,
      middle,
      width: Math.max(...boxes.map((box) => box.x + box.width)),
      height: Math.max(...boxes.map((box) => box.y + box.height)),
    };
  }, [graph]);
  return (
    <svg
      className="cover"
      viewBox={`-20 -20 ${drawn.width + 40} ${drawn.height + 40}`}
      role="img"
      aria-label="Its graph"
    >
      {graph.wires.map((wire) => {
        const from = drawn.middle.get(wire.from)!;
        const to = drawn.middle.get(wire.to)!;
        return (
          <line
            key={`${wire.kind}:${wire.from}>${wire.to}`}
            className={`stroke-${wire.kind}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        );
      })}
      {drawn.boxes.map((box) => (
        <rect
          key={box.node.id}
          className={`fill-${box.node.kind}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={3}
        />
      ))}
    </svg>
  );
}
