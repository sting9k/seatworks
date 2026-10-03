import { useMemo } from "react";
import type { Graph } from "../template/graph.ts";
import { laidOut } from "./layout.ts";
import { nameOf } from "./sidebar.tsx";

const HEIGHT = 26;
/** A name's pill is as wide as its letters, so a cover is read and not only looked at. */
const widthOf = (name: string) => Math.round(name.length * 7.4 + 34);

/** A template's cover in the gallery: its own team, each role by name, who seats whom and who talks to the Human. */
export function Cover({ graph }: { graph: Graph }) {
  const drawn = useMemo(() => {
    const seats = graph.nodes.filter((node) => node.kind === "role" || node.kind === "human");
    const names = new Map(seats.map((node) => [node.id, node.kind === "human" ? "you" : nameOf(node)]));
    const wires = graph.wires.filter((wire) => wire.kind === "spawns" || wire.kind === "human");
    const sizes = new Map(seats.map((node) => [node.id, { width: widthOf(names.get(node.id)!), height: HEIGHT }]));
    const placed = laidOut({ nodes: seats.map(({ id }) => ({ id, family: "team", beside: 0 })), wires }, sizes, 56);
    const pills = seats.map((node) => ({
      node,
      name: names.get(node.id)!,
      ...placed.get(node.id)!,
      ...sizes.get(node.id)!,
    }));
    const byId = new Map(pills.map((pill) => [pill.node.id, pill]));
    return {
      pills,
      wires: wires.map((wire) => ({ wire, from: byId.get(wire.from)!, to: byId.get(wire.to)! })),
      width: Math.max(...pills.map((pill) => pill.x + pill.width)),
      height: Math.max(...pills.map((pill) => pill.y + pill.height)),
    };
  }, [graph]);
  return (
    <svg
      className="cover"
      viewBox={`-24 -24 ${drawn.width + 48} ${drawn.height + 48}`}
      role="img"
      aria-label="Its team"
    >
      {drawn.wires.map(({ wire, from, to }) => {
        const [x1, y1, x2, y2] = [from.x + from.width, from.y + HEIGHT / 2, to.x, to.y + HEIGHT / 2];
        const bend = Math.max(24, (x2 - x1) / 2);
        return (
          <path
            key={`${wire.kind}:${wire.from}>${wire.to}`}
            className={`stroke-${wire.kind}`}
            d={`M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`}
          />
        );
      })}
      {drawn.pills.map((pill) => (
        <g key={pill.node.id} className={`pill-${pill.node.kind}`} transform={`translate(${pill.x} ${pill.y})`}>
          <rect width={pill.width} height={HEIGHT} rx={HEIGHT / 2} />
          <circle cx={13} cy={HEIGHT / 2} r={3.5} />
          <text x={23} y={HEIGHT / 2 + 4}>
            {pill.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
