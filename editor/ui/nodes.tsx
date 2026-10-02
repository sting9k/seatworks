import { Handle, type Node, type NodeProps, type NodeTypes, Position } from "@xyflow/react";
import type { GraphNode, Wire } from "../template/graph.ts";

type Of<Kind extends GraphNode["kind"]> = Extract<GraphNode, { kind: Kind }>;
/** A node of the template on the canvas, of the kind its drawing is picked by. */
export type FlowNode<Kind extends GraphNode["kind"] = GraphNode["kind"]> = {
  [K in Kind]: Node<{ readonly node: Of<K> }, K>;
}[Kind];
/** A titled box behind the nodes of a family that no wire places. */
export type FrameNode = Node<{ readonly title: string }, "frame">;

/** A socket takes only its own kind of wire (EDITOR.md, Wires); the kind is its colour and its handle's id. */
function Plug({ kind, end }: { kind: Wire["kind"]; end: "in" | "out" }) {
  return (
    <Handle
      id={`${kind}-${end}`}
      type={end === "in" ? "target" : "source"}
      position={end === "in" ? Position.Left : Position.Right}
      className={`plug wire-${kind}`}
      isConnectable={false}
    />
  );
}

/** What comes in is named on the left; what goes out is named by its kind on the right, as ComfyUI names a type. */
function Socket({ kind, end, label }: { kind: Wire["kind"]; end: "in" | "out"; label: string }) {
  return (
    <div className={`socket socket-${end}`}>
      <Plug kind={kind} end={end} />
      {label}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function Role({ data: { node } }: NodeProps<FlowNode<"role">>) {
  return (
    <div className="node node-role">
      <header>
        <i className="dot kind-role" />
        {node.name}
      </header>
      <div className="sockets">
        <div>
          <Socket kind="spawns" end="in" label="seated by" />
          <Socket kind="skill" end="in" label="skills" />
          <Socket kind="tools" end="in" label="more tools" />
          <Socket kind="watches" end="in" label="moments" />
        </div>
        <div>
          <Socket kind="spawns" end="out" label="SEATS" />
          <Socket kind="human" end="out" label="HUMAN" />
        </div>
      </div>
      <div className="switches">
        {node.properties.map((property) => (
          <span key={property} className="switch on">
            {property}
          </span>
        ))}
      </div>
      <Field label="speaks to" value={node.speaks.length > 0 ? node.speaks.join(", ") : "nobody"} />
      <Field label="models" value={node.models.length > 0 ? node.models.join(", ") : "none named"} />
      <Field label="prompt" value={node.file ?? "none"} />
      {node.groups.map((group) => (
        <details key={group.id} className="group nodrag">
          <summary className="field">
            <span>{group.name}</span>
            <span className="value">
              {group.tools.filter((tool) => tool.ticked).length} / {group.tools.length}
            </span>
          </summary>
          <ul>
            {group.tools.map((tool) => (
              <li key={tool.name} className={tool.ticked ? "ticked" : "unticked"}>
                {tool.name}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** A node with one socket and no settings is its title alone, as a collapsed node is; the side panel says the rest. */
function Compact({
  kind,
  title,
  plug,
  quiet,
}: {
  kind: GraphNode["kind"];
  title: string;
  plug?: Wire["kind"];
  quiet?: string;
}) {
  return (
    <div className={`node compact${quiet ? " inactive" : ""}`}>
      {plug ? <Plug kind={plug} end={kind === "human" ? "in" : "out"} /> : null}
      <header>
        <i className={`dot kind-${kind}`} />
        {title}
        {quiet ? <span className="quiet">{quiet}</span> : null}
      </header>
    </div>
  );
}

const Human = () => <Compact kind="human" title="The Human" plug="human" />;
const Skill = ({ data: { node } }: NodeProps<FlowNode<"skill">>) => (
  <Compact kind="skill" title={node.name} plug="skill" />
);
const Tools = ({ data: { node } }: NodeProps<FlowNode<"tools">>) => (
  <Compact kind="tools" title={`${node.name} · ${node.tools.length}`} plug="tools" />
);
const Question = ({ data: { node } }: NodeProps<FlowNode<"question">>) => (
  <Compact kind="question" title={node.name} {...(node.active ? {} : { quiet: "not asked" })} />
);
const Moment = ({ data: { node } }: NodeProps<FlowNode<"moment">>) => (
  <Compact kind="moment" title={node.name} plug="watches" {...(node.active ? {} : { quiet: "not watched" })} />
);

const Frame = ({ data }: NodeProps<FrameNode>) => (
  <div className="frame">
    <header>{data.title}</header>
  </div>
);

export const NODE_TYPES = {
  role: Role,
  human: Human,
  skill: Skill,
  tools: Tools,
  question: Question,
  moment: Moment,
  frame: Frame,
} satisfies NodeTypes;
