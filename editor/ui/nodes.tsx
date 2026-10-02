import { Handle, type Node, type NodeProps, type NodeTypes, Position } from "@xyflow/react";
import type { GraphNode, Wire } from "../template/graph.ts";

type Of<Kind extends GraphNode["kind"]> = Extract<GraphNode, { kind: Kind }>;
/** A node of the template on the canvas, of the kind its drawing is picked by. */
export type FlowNode<Kind extends GraphNode["kind"] = GraphNode["kind"]> = {
  [K in Kind]: Node<{ readonly node: Of<K> }, K>;
}[Kind];

/** A socket takes only its own kind of wire (EDITOR.md, Wires); the kind is its colour and its handle's id. */
function Plug({ kind, end, side }: { kind: Wire["kind"]; end: "in" | "out"; side: "left" | "right" }) {
  return (
    <Handle
      id={`${kind}-${end}`}
      type={end === "in" ? "target" : "source"}
      position={side === "left" ? Position.Left : Position.Right}
      className={`handle wire-${kind}`}
      isConnectable={false}
    />
  );
}

/** A labelled socket in a node that has several, on the row its label is on. */
function Socket({ label, ...plug }: { kind: Wire["kind"]; end: "in" | "out"; side: "left" | "right"; label: string }) {
  return (
    <div className={`socket socket-${plug.side}`}>
      <Plug {...plug} />
      {label}
    </div>
  );
}

function Role({ data: { node } }: NodeProps<FlowNode<"role">>) {
  return (
    <div className="node node-role">
      <header>
        <strong>{node.name}</strong>
        {node.properties.map((property) => (
          <span key={property} className="chip">
            {property}
          </span>
        ))}
      </header>
      <div className="sockets">
        <Socket kind="spawns" end="in" side="left" label="seated by" />
        <Socket kind="spawns" end="out" side="right" label="seats" />
        <Socket kind="skill" end="in" side="left" label="skills" />
        <Socket kind="human" end="out" side="right" label="the Human" />
        <Socket kind="tools" end="in" side="left" label="more tools" />
        <Socket kind="watches" end="in" side="right" label="watched for" />
      </div>
      <dl>
        <dt>Speaks to</dt>
        <dd>{node.speaks.length > 0 ? node.speaks.join(", ") : "nobody"}</dd>
        <dt>Models</dt>
        <dd>{node.models.length > 0 ? node.models.join(", ") : "none named"}</dd>
        <dt>Prompt</dt>
        <dd>{node.file ?? "none"}</dd>
      </dl>
      {node.groups.map((group) => (
        <details key={group.id} className="group nodrag">
          <summary>
            {group.name}
            <span className="count">
              {group.tools.filter((tool) => tool.ticked).length}/{group.tools.length}
            </span>
          </summary>
          <ul>
            {group.tools.map((tool) => (
              <li key={tool.name} className={tool.ticked ? "ticked" : "hidden-tool"}>
                {tool.name}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function Human() {
  return (
    <div className="node node-human">
      <Plug kind="human" end="in" side="left" />
      <header>
        <strong>The Human</strong>
      </header>
      <p>Asked and told by the roles wired here.</p>
    </div>
  );
}

function Skill({ data: { node } }: NodeProps<FlowNode<"skill">>) {
  return (
    <div className="node node-skill">
      <Plug kind="skill" end="out" side="right" />
      <header>
        <strong>{node.name}</strong>
      </header>
      <p className="clamped">{node.description}</p>
    </div>
  );
}

function Tools({ data: { node } }: NodeProps<FlowNode<"tools">>) {
  return (
    <div className="node node-tools">
      <Plug kind="tools" end="out" side="right" />
      <header>
        <strong>{node.name}</strong>
      </header>
      <ul>
        {node.tools.map((tool) => (
          <li key={tool} className="ticked">
            {tool}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Question({ data: { node } }: NodeProps<FlowNode<"question">>) {
  return (
    <div className={`node node-question${node.active ? "" : " inactive"}`}>
      <header>
        <strong>{node.name}</strong>
        {node.active ? null : <span className="chip">not asked</span>}
      </header>
      <p className="clamped">{node.asks}</p>
      <dl>
        <dt>On</dt>
        <dd>{node.on.join(", ")}</dd>
        <dt>Tells</dt>
        <dd>{node.tells ?? "the record only"}</dd>
      </dl>
    </div>
  );
}

function Moment({ data: { node } }: NodeProps<FlowNode<"moment">>) {
  return (
    <div className={`node node-moment${node.active ? "" : " inactive"}`}>
      <Plug kind="watches" end="out" side="left" />
      <header>
        <strong>{node.name}</strong>
        {node.active ? null : <span className="chip">not watched</span>}
      </header>
      <p className="clamped">{node.countedInCode ? "Counted in code; no model is asked." : node.asks}</p>
    </div>
  );
}

export const NODE_TYPES = {
  role: Role,
  human: Human,
  skill: Skill,
  tools: Tools,
  question: Question,
  moment: Moment,
} satisfies NodeTypes;
