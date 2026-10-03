import type { Graph, GraphNode, Wire } from "./graph.ts";

/** What a person has open on the canvas. It is the viewer's: the page keeps it, and no file of the template does. */
export type Folds = {
  /** The roles whose equipment is open. */
  readonly roles: ReadonlySet<string>;
  /** The stacks that are open, by the kind of node each holds. */
  readonly stacks: ReadonlySet<Stacked>;
};

type Stacked = "question" | "moment";

/** The families no wire places that fold into one node each, until opened. */
export const STACKS = [
  { id: "stack:question", kind: "question", title: "Reflex questions" },
  { id: "stack:moment", kind: "moment", title: "Watch moments" },
] as const satisfies readonly { id: string; kind: Stacked; title: string }[];

const EQUIPMENT: readonly Wire["kind"][] = ["skill", "tools", "server"];
/** The wires that place a node when a template is laid out; the others join what is already placed. */
const PLACING: readonly Wire["kind"][] = ["spawns", "human", "does", "then"];

/** The roles each skill, tool group and server is wired into: what it folds into. */
function holdersOf(graph: Graph): ReadonlyMap<string, readonly string[]> {
  const holders = new Map<string, string[]>();
  for (const wire of graph.wires)
    if (EQUIPMENT.includes(wire.kind)) holders.set(wire.from, [...(holders.get(wire.from) ?? []), wire.to]);
  return holders;
}

/** How much is folded into a role: its skills, and the tool groups and servers beside them. */
export function foldedInto(graph: Graph, role: string): { readonly skills: number; readonly more: number } {
  const into = graph.wires.filter((wire) => wire.to === role && EQUIPMENT.includes(wire.kind));
  const skills = into.filter((wire) => wire.kind === "skill").length;
  return { skills, more: into.length - skills };
}

/** The nodes on the canvas. Never folded: what no role has, what carries a note, and what is picked. */
export function shownOf(
  graph: Graph,
  folds: Folds,
  picked: string | null,
  noted: ReadonlySet<string>,
): ReadonlySet<string> {
  const holders = holdersOf(graph);
  const shown = (node: GraphNode) => {
    if (node.id === picked || noted.has(node.id)) return true;
    if (node.kind === "question" || node.kind === "moment") return folds.stacks.has(node.kind);
    const held = holders.get(node.id);
    return held === undefined || held.some((role) => folds.roles.has(role));
  };
  return new Set(graph.nodes.filter(shown).map((node) => node.id));
}

/** The wires on the canvas: equipment's only into a role that is open, unless it is shown for itself. */
export function wiresOf(
  graph: Graph,
  folds: Folds,
  picked: string | null,
  noted: ReadonlySet<string>,
): readonly Wire[] {
  const shown = shownOf(graph, folds, picked, noted);
  const itself = (id: string) => id === picked || noted.has(id);
  return graph.wires.filter(
    (wire) =>
      shown.has(wire.from) &&
      shown.has(wire.to) &&
      (!EQUIPMENT.includes(wire.kind) || folds.roles.has(wire.to) || itself(wire.from)),
  );
}

/** The role a shown skill, tool group or server sits beside: the first that is open of those it is wired into. */
export function besideOf(graph: Graph, folds: Folds): ReadonlyMap<string, string> {
  return new Map(
    [...holdersOf(graph)].map(([id, roles]) => [id, roles.find((role) => folds.roles.has(role)) ?? roles[0]!]),
  );
}

/** A node as the layout takes it: its family shares rows and a frame, `beside` is how many nodes it may open. */
export type Anchored = { readonly id: string; readonly family: string; readonly beside: number };

/** What is laid out: no node that sits beside a role, a stack for each family that folds, the wires that place one. */
export function anchoredOf(graph: Graph): {
  readonly nodes: readonly Anchored[];
  readonly wires: readonly Pick<Wire, "kind" | "from" | "to">[];
} {
  const held = holdersOf(graph);
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  const of = (...wanted: GraphNode["kind"][]) =>
    graph.nodes.filter((node) => wanted.includes(node.kind) && !held.has(node.id));
  const beside = (id: string) => [...held.values()].filter((roles) => roles.includes(id)).length;
  const as = (family: string) => (node: GraphNode) => ({ id: node.id, family, beside: beside(node.id) });
  return {
    nodes: [
      ...of("human", "role", "step").map(as("team")),
      ...of("skill", "tools", "server").map(as("equipment")),
      ...of("classifier").map(as("watch")),
      ...STACKS.filter((stack) => kinds.has(stack.kind)).map((stack) => ({ id: stack.id, family: "watch", beside: 0 })),
      ...of("section").map(as("section")),
      ...of("question").map(as("question")),
      ...of("moment").map(as("moment")),
    ],
    wires: graph.wires.filter((wire) => PLACING.includes(wire.kind)),
  };
}
