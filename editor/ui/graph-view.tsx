import {
  Background,
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
import { type Graph, type GraphNode, graphOf } from "../template/graph.ts";
import type { Template } from "../template/read-template.ts";
import { FilePanel } from "./file-panel.tsx";
import { laidOut } from "./layout.ts";
import { type FlowNode, NODE_TYPES } from "./nodes.tsx";

const FAMILIES: readonly { readonly name: string; readonly kinds: readonly GraphNode["kind"][] }[] = [
  { name: "Team", kinds: ["role", "human"] },
  { name: "Equipment", kinds: ["skill", "tools"] },
  { name: "Attention", kinds: ["question", "moment"] },
];

const nameOf = (node: GraphNode) => (node.kind === "human" ? "The Human" : node.name);
const fileOf = (node: GraphNode) => ("file" in node ? node.file : null);

/** One template: its graph, the nodes it is made of by family, and its files. */
export function GraphView({ template, onBack }: { template: Template; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <Opened template={template} onBack={onBack} />
    </ReactFlowProvider>
  );
}

function Opened({ template, onBack }: { template: Template; onBack: () => void }) {
  const graph = useMemo(() => graphOf(template), [template]);
  const edges = useMemo(() => edgesOf(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes.map(unplaced));
  const [arranged, setArranged] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const measured = useNodesInitialized();
  const flow = useReactFlow<FlowNode>();

  // A node's size is known only once it is drawn, so the first drawing is hidden and measured, then laid out.
  useEffect(() => {
    if (!measured || arranged) return;
    const sizes = new Map(
      flow.getNodes().map((node) => [node.id, { width: node.measured!.width!, height: node.measured!.height! }]),
    );
    const placed = laidOut(graph, sizes);
    setNodes((drawn) => drawn.map((node) => ({ ...node, position: placed.get(node.id)! })));
    setArranged(true);
  }, [measured, arranged, flow, graph, setNodes]);
  useEffect(() => {
    if (arranged) void flow.fitView({ padding: 0.08 });
  }, [arranged, flow]);

  const show = (node: GraphNode) => {
    setFile(fileOf(node) ?? file);
    setNodes((drawn) => drawn.map((other) => ({ ...other, selected: other.id === node.id })));
    void flow.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1, padding: 0.6 });
  };

  return (
    <div className="editor">
      <header className="bar">
        <button type="button" onClick={onBack}>
          Templates
        </button>
        <h1>{template.about.name}</h1>
        <span className="facts">Read only</span>
      </header>
      <Library graph={graph} onPick={show} />
      <div className={arranged ? "canvas" : "canvas arranging"}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            setFile(fileOf(node.data.node) ?? file);
          }}
          nodesConnectable={false}
          deleteKeyCode={null}
          minZoom={0.1}
          colorMode="dark"
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeClassName={(node) => `mini-${node.type ?? ""}`} />
        </ReactFlow>
      </div>
      <FilePanel files={template.files} open={file} onOpen={setFile} />
    </div>
  );
}

function Library({ graph, onPick }: { graph: Graph; onPick: (node: GraphNode) => void }) {
  return (
    <nav className="library">
      <h2>Nodes</h2>
      {FAMILIES.map((family) => {
        const members = graph.nodes.filter((node) => family.kinds.includes(node.kind));
        return (
          <details key={family.name} open={family.name === "Team"}>
            <summary>
              {family.name}
              <span className="count">{members.length}</span>
            </summary>
            <ul>
              {members.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className={`kind-${node.kind}`}
                    onClick={() => {
                      onPick(node);
                    }}
                  >
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
