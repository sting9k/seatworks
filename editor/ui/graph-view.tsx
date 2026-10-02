import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { type Point, positioned } from "../template/about.ts";
import { type Graph, type GraphNode, graphOf } from "../template/graph.ts";
import type { Template } from "../template/read-template.ts";
import { download } from "./files.ts";
import { laidOut } from "./layout.ts";
import { type FlowNode, type FrameNode, NODE_TYPES } from "./nodes.tsx";
import { SidePanel } from "./side-panel.tsx";

type Drawn = FlowNode | FrameNode;

const FAMILIES: readonly { readonly name: string; readonly kinds: readonly GraphNode["kind"][] }[] = [
  { name: "Team", kinds: ["role", "human"] },
  { name: "Equipment", kinds: ["skill", "tools"] },
  { name: "Attention", kinds: ["moment", "question"] },
];
const QUESTIONS = "frame:questions";
const FRAME = { pad: 14, title: 34 };

const nameOf = (node: GraphNode) => (node.kind === "human" ? "The Human" : node.name);
const fileOf = (node: GraphNode) => ("file" in node ? node.file : null);

type Props = {
  readonly template: Template;
  /** Whether it holds a change that has not been exported. */
  readonly changed: boolean;
  /** The template's files after a change; everything shown is read again from them. */
  readonly onChange: (files: Template["files"]) => void;
  readonly onExported: () => void;
  readonly onBack: () => void;
};

/** One template: its graph, the nodes it is made of by family, and what the picked one says. */
export function GraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <Opened {...props} />
    </ReactFlowProvider>
  );
}

function Opened({ template, changed, onChange, onExported, onBack }: Props) {
  const graph = useMemo(() => graphOf(template), [template]);
  const edges = useMemo(() => edgesOf(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Drawn>(graph.nodes.map(unplaced));
  const [arranged, setArranged] = useState(false);
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const measured = useNodesInitialized();
  const flow = useReactFlow<Drawn>();

  // A node's size is known only once it is drawn, so the first drawing is hidden and measured, then laid out.
  useEffect(() => {
    if (!measured || arranged) return;
    const sizes = new Map(
      flow.getNodes().map((node) => [node.id, { width: node.measured!.width!, height: node.measured!.height! }]),
    );
    const kept = new Map(Object.entries(template.about.editor?.positions ?? {}));
    const places = graph.nodes.every((node) => kept.has(node.id)) ? kept : laidOut(graph, sizes);
    setNodes((drawn) => framed(drawn, places, sizes));
    setArranged(true);
  }, [measured, arranged, flow, graph, template, setNodes]);
  useEffect(() => {
    if (arranged) void flow.fitView({ padding: 0.06 });
  }, [arranged, flow]);

  /** Where every node is now is kept, so the template opens next time as it was left. */
  const keepPlaces = () => {
    const drawn = flow.getNodes();
    const frames = new Map(drawn.flatMap((node) => (node.type === "frame" ? [[node.id, node.position]] : [])));
    const places = new Map<string, Point>();
    const sizes = new Map<string, { width: number; height: number }>();
    for (const node of drawn) {
      if (node.type === "frame") continue;
      const frame = node.parentId === undefined ? { x: 0, y: 0 } : frames.get(node.parentId)!;
      places.set(node.id, { x: frame.x + node.position.x, y: frame.y + node.position.y });
      sizes.set(node.id, { width: node.measured!.width!, height: node.measured!.height! });
    }
    setNodes((current) => framed(current, places, sizes));
    onChange(positioned(template.files, template.about, places));
  };

  const pick = (node: GraphNode) => {
    setPicked(node);
    setFile(fileOf(node));
  };
  const show = (node: GraphNode) => {
    pick(node);
    setNodes((drawn) => drawn.map((other) => ({ ...other, selected: other.id === node.id })));
    void flow.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1, padding: 1.2 });
  };

  return (
    <div className="editor">
      <header className="bar">
        <button type="button" className="back" onClick={onBack}>
          ‹ Templates
        </button>
        <h1>{template.about.name}</h1>
        {changed ? <span className="pill">Changed, not exported</span> : null}
        <button
          type="button"
          className="cta"
          onClick={() => {
            download(template.about.name, template.files);
            onExported();
          }}
        >
          Export
        </button>
      </header>
      <Library graph={graph} picked={picked} onPick={show} />
      <div className={arranged ? "canvas" : "canvas arranging"}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (node.type !== "frame") pick(node.data.node);
          }}
          onPaneClick={() => {
            setPicked(null);
          }}
          onNodeDragStop={keepPlaces}
          nodesConnectable={false}
          deleteKeyCode={null}
          minZoom={0.1}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeClassName={(node) => `mini-${node.type ?? ""}`} />
        </ReactFlow>
      </div>
      <SidePanel files={template.files} picked={picked} open={file} onOpen={setFile} />
    </div>
  );
}

function Library({
  graph,
  picked,
  onPick,
}: {
  graph: Graph;
  picked: GraphNode | null;
  onPick: (node: GraphNode) => void;
}) {
  const [query, setQuery] = useState("");
  const wanted = query.trim().toLowerCase();
  return (
    <nav className="library">
      <h2>Nodes</h2>
      <input
        type="search"
        placeholder="Search…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {FAMILIES.map((family) => {
        const members = graph.nodes.filter(
          (node) => family.kinds.includes(node.kind) && nameOf(node).toLowerCase().includes(wanted),
        );
        if (members.length === 0) return null;
        return (
          <details
            key={`${family.name}:${wanted === "" ? "all" : "found"}`}
            open={wanted !== "" || family.name === "Team"}
          >
            <summary>
              {family.name}
              <span className="count">{members.length}</span>
            </summary>
            <ul>
              {members.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className={node.id === picked?.id ? "open" : ""}
                    onClick={() => {
                      onPick(node);
                    }}
                  >
                    <i className={`dot kind-${node.kind}`} />
                    {nameOf(node)}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}

const unplaced = (node: GraphNode): FlowNode =>
  ({ id: node.id, type: node.kind, position: { x: 0, y: 0 }, data: { node } }) as FlowNode;

/**
 * The nodes at their places, the questions inside a frame of their own that carries them when it is moved: no wire
 * reaches a question, so nothing else says they belong together.
 */
function framed(
  drawn: readonly Drawn[],
  placed: ReadonlyMap<string, Point>,
  sizes: ReadonlyMap<string, { width: number; height: number }>,
): Drawn[] {
  const at = drawn.flatMap((node) => {
    if (node.type === "frame") return [];
    const { parentId: _, ...loose } = node;
    return [{ ...loose, position: placed.get(node.id)! }];
  });
  const inside = at.filter((node) => node.type === "question");
  if (inside.length === 0) return at;
  const left = Math.min(...inside.map((node) => node.position.x)) - FRAME.pad;
  const top = Math.min(...inside.map((node) => node.position.y)) - FRAME.pad - FRAME.title;
  const right = Math.max(...inside.map((node) => node.position.x + sizes.get(node.id)!.width)) + FRAME.pad;
  const bottom = Math.max(...inside.map((node) => node.position.y + sizes.get(node.id)!.height)) + FRAME.pad;
  const frame: FrameNode = {
    id: QUESTIONS,
    type: "frame",
    position: { x: left, y: top },
    style: { width: right - left, height: bottom - top },
    data: { title: "Reflex questions" },
    selectable: false,
  };
  return [
    frame,
    ...at.map((node) =>
      node.type === "question"
        ? { ...node, parentId: QUESTIONS, position: { x: node.position.x - left, y: node.position.y - top } }
        : node,
    ),
  ];
}

/** A wire that gives a role only part of a group says how much of it, since the group's node lists it whole. */
function edgesOf(graph: Graph): Edge[] {
  const groupSize = new Map(
    graph.nodes.flatMap((node) => (node.kind === "tools" ? [[node.id, node.tools.length]] : [])),
  );
  return graph.wires.map((wire) => ({
    id: `${wire.kind}:${wire.from}>${wire.to}`,
    source: wire.from,
    target: wire.to,
    sourceHandle: `${wire.kind}-out`,
    targetHandle: `${wire.kind}-in`,
    className: `wire-${wire.kind}`,
    ...(wire.kind === "tools" && wire.tools.length < groupSize.get(wire.from)!
      ? { label: `${wire.tools.length} of ${groupSize.get(wire.from)!}` }
      : {}),
  }));
}
