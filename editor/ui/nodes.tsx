import { Handle, type Node, type NodeProps, NodeToolbar, type NodeTypes, Position } from "@xyflow/react";
import { RELATIONS } from "../../shared/contracts/profile.ts";
import { setProperty, setSpeaks, setTool } from "../template/edits.ts";
import { type GraphNode, PROPERTIES, type Wire } from "../template/graph.ts";
import { isMakeable, useEditing, useNotes } from "./editing.ts";
import { Icon } from "./icons.tsx";

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

/** How many notes are about a node, by its name; what they say is in the side panel. */
function Noted({ id }: { id: string }) {
  const notes = useNotes(id);
  return notes.length === 0 ? null : (
    <span className="noted-mark" title={notes.map((note) => note.says).join("\n")}>
      {notes.length}
    </span>
  );
}

/** The few things done to the picked node itself, above it as ComfyUI puts them. */
function Actions({ node }: { node: GraphNode }) {
  const editing = useEditing();
  return (
    <NodeToolbar className="actions" offset={8}>
      {isMakeable(node.kind) ? (
        <button
          type="button"
          title="Take away"
          onClick={() => {
            editing.remove(node);
          }}
        >
          <Icon name="trash" />
        </button>
      ) : null}
      {node.kind === "role" ? (
        <button
          type="button"
          title="Duplicate"
          onClick={() => {
            editing.duplicate(node);
          }}
        >
          <Icon name="copy" />
        </button>
      ) : null}
      <button
        type="button"
        title="About it"
        onClick={() => {
          editing.showAbout(node);
        }}
      >
        <Icon name="info" />
      </button>
    </NodeToolbar>
  );
}

function Role({ data: { node } }: NodeProps<FlowNode<"role">>) {
  const { change } = useEditing();
  return (
    <div className="node node-role">
      <Actions node={node} />
      <header>
        <i className="dot kind-role" />
        {node.name}
        <Noted id={node.id} />
      </header>
      <div className="sockets">
        <div>
          <Socket kind="spawns" end="in" label="seated by" />
          <Socket kind="skill" end="in" label="skills" />
          <Socket kind="tools" end="in" label="more tools" />
          <Socket kind="server" end="in" label="servers" />
          <Socket kind="watches" end="in" label="moments" />
        </div>
        <div>
          <Socket kind="spawns" end="out" label="SEATS" />
          <Socket kind="human" end="out" label="HUMAN" />
          <Socket kind="does" end="out" label="DOES" />
        </div>
      </div>
      <div className="switches nodrag">
        {PROPERTIES.map((property) => {
          const on = node.properties.includes(property);
          return (
            <button
              key={property}
              type="button"
              className={on ? "switch on" : "switch"}
              aria-pressed={on}
              onClick={() => {
                change(setProperty(node.name, property, !on));
              }}
            >
              {property}
            </button>
          );
        })}
      </div>
      <div className="field nodrag">
        <span>speaks to</span>
        <span className="switches">
          {RELATIONS.filter((relation) => relation !== "human").map((relation) => {
            const on = node.speaks.includes(relation);
            return (
              <button
                key={relation}
                type="button"
                className={on ? "switch on" : "switch"}
                aria-pressed={on}
                onClick={() => {
                  change(setSpeaks(node.name, relation, !on));
                }}
              >
                {relation}
              </button>
            );
          })}
        </span>
      </div>
      <div className="field">
        <span>models</span>
        <span className="value">{node.models.length > 0 ? node.models.join(", ") : "none named"}</span>
      </div>
      <div className="field">
        <span>prompt</span>
        <span className="value">{node.file ?? "none"}</span>
      </div>
      <div className="field" title="Its prompt, the description of each of its skills and the team's flow">
        <span>read every turn</span>
        <span className="value">{node.alwaysOn.toLocaleString("en")} words</span>
      </div>
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
              <li key={tool.name}>
                <label className={tool.ticked ? "" : "unticked"}>
                  <input
                    type="checkbox"
                    checked={tool.ticked}
                    onChange={() => {
                      change(setTool(node.name, tool.name, !tool.ticked));
                    }}
                  />
                  {tool.name}
                </label>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function Step({ data: { node } }: NodeProps<FlowNode<"step">>) {
  return (
    <div className="node node-step">
      <Actions node={node} />
      <header>
        <i className="dot kind-step" />
        {node.name}
      </header>
      <div className="sockets">
        <div>
          <Socket kind="does" end="in" label="done by" />
          <Socket kind="then" end="in" label="after" />
        </div>
        <div>
          <Socket kind="then" end="out" label="THEN" />
        </div>
      </div>
      {node.text === "" ? null : <p className="clamped">{node.text}</p>}
    </div>
  );
}

/** A node with one socket and no settings is its title alone, as a collapsed node is; the side panel says the rest. */
function Compact({
  node,
  title,
  plug,
  quiet,
}: {
  node: GraphNode;
  title: string;
  plug?: Wire["kind"];
  quiet?: string;
}) {
  return (
    <div className={`node compact${quiet ? " inactive" : ""}`}>
      <Actions node={node} />
      {plug ? <Plug kind={plug} end={node.kind === "human" ? "in" : "out"} /> : null}
      <header>
        <i className={`dot kind-${node.kind}`} />
        {title}
        {quiet ? <span className="quiet">{quiet}</span> : null}
        <Noted id={node.id} />
      </header>
    </div>
  );
}

const Human = ({ data: { node } }: NodeProps<FlowNode<"human">>) => (
  <Compact node={node} title="The Human" plug="human" />
);
const Skill = ({ data: { node } }: NodeProps<FlowNode<"skill">>) => (
  <Compact node={node} title={node.name} plug="skill" />
);
const Tools = ({ data: { node } }: NodeProps<FlowNode<"tools">>) => (
  <Compact node={node} title={`${node.name} · ${node.tools.length}`} plug="tools" />
);
const Server = ({ data: { node } }: NodeProps<FlowNode<"server">>) => (
  <Compact node={node} title={node.name} plug="server" />
);
const Question = ({ data: { node } }: NodeProps<FlowNode<"question">>) => (
  <Compact node={node} title={node.name} {...(node.active ? {} : { quiet: "not asked" })} />
);
const Moment = ({ data: { node } }: NodeProps<FlowNode<"moment">>) => (
  <Compact node={node} title={node.name} plug="watches" {...(node.active ? {} : { quiet: "not watched" })} />
);
const Section = ({ data: { node } }: NodeProps<FlowNode<"section">>) => <Compact node={node} title={node.name} />;

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
  server: Server,
  question: Question,
  moment: Moment,
  step: Step,
  section: Section,
  frame: Frame,
} satisfies NodeTypes;
