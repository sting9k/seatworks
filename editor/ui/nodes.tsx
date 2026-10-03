import { Handle, type Node, type NodeProps, NodeToolbar, type NodeTypes, Position } from "@xyflow/react";
import type { STACKS } from "../template/fold.ts";
import type { GraphNode, Job, Wire } from "../template/graph.ts";
import { isMakeable, useEditing, useNotes } from "./editing.ts";
import { Icon } from "./icons.tsx";
import { plural } from "./words.ts";

type Of<Kind extends GraphNode["kind"]> = Extract<GraphNode, { kind: Kind }>;
/** How much is folded into a role, and whether it is open. */
type Folded = { readonly skills: number; readonly more: number; readonly open: boolean };
/** A node of the template on the canvas, drawn by its kind; a role carries what is folded into it. */
export type FlowNode<Kind extends GraphNode["kind"] = GraphNode["kind"]> = {
  [K in Kind]: Node<{ readonly node: Of<K>; readonly folded?: Folded }, K>;
}[Kind];
/** A titled box behind the nodes of a family that no wire places. */
export type FrameNode = Node<{ readonly title: string }, "frame">;
/** A family that folds, held as one node until it is opened. */
export type StackNode = Node<
  { readonly stack: (typeof STACKS)[number]; readonly count: number; readonly open: boolean },
  "stack"
>;

/** What a role is for, as a person says it. */
export const JOB_WORDS: Readonly<Record<Job, string>> = {
  delegates: "Hands out work",
  writes: "Writes code",
  reading: "Reviews",
  watches: "Watches",
};

/** The socket of a role every skill, tool group and server is wired into. */
export const USES = "uses";
type Socket = Wire["kind"] | typeof USES;

/** A socket takes its own kind of wire, and `uses` any equipment; the kind is its colour and its handle's id. */
function Plug({ kind, end }: { kind: Socket; end: "in" | "out" }) {
  return (
    <Handle
      id={`${kind}-${end}`}
      type={end === "in" ? "target" : "source"}
      position={end === "in" ? Position.Left : Position.Right}
      className={`plug wire-${kind}`}
    />
  );
}

/** One line of a role's sockets: what comes in named at its left, what goes out at its right. */
function Ports({ taking, into, giving, out }: { taking: Socket; into: string; giving: Socket; out: string }) {
  return (
    <div className="ports">
      <Plug kind={taking} end="in" />
      <span>{into}</span>
      <span>{out}</span>
      <Plug kind={giving} end="out" />
    </div>
  );
}

/** How many notes are about a node; what they say is in the panel on the right. */
function Noted({ id }: { id: string }) {
  const notes = useNotes(id);
  return notes.length === 0 ? null : (
    <span className="noted-mark" title={notes.map((note) => note.says).join("\n")}>
      <Icon name="alert" />
      {notes.length}
    </span>
  );
}

/** The few things done to the picked node itself, above it as ComfyUI puts them. */
function Actions({ node }: { node: GraphNode }) {
  const editing = useEditing();
  return (
    <NodeToolbar className="actions" offset={10}>
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

/** A seat in the team: its name, what it runs as, what it does in plain words, and what is folded into it. */
function Role({ data: { node, folded } }: NodeProps<FlowNode<"role">>) {
  const { fold } = useEditing();
  const does = [
    node.properties.includes("root") ? "Leads the team" : null,
    node.job ? JOB_WORDS[node.job] : null,
    node.job === "delegates" && node.properties.includes("writes") ? JOB_WORDS.writes : null,
    node.properties.includes("humanDoor") || node.speaks.includes("human") ? "Talks to you" : null,
  ].filter((word) => word !== null);
  const held = folded && folded.skills + folded.more > 0 ? folded : null;
  return (
    <div className="node node-role">
      <Actions node={node} />
      <header>
        <i className="dot kind-role" />
        <span className="kind">Role</span>
        <Noted id={node.id} />
      </header>
      <h3>{node.name}</h3>
      <p className="runs mono">
        {node.models.length > 0 ? `Runs as ${node.models.join(", then ")}` : "No agent profile yet"}
      </p>
      <Ports taking="spawns" into="seated by" giving="spawns" out="seats" />
      <Ports taking={USES} into="uses" giving="human" out="talks to you" />
      <Ports taking="watches" into="watched by" giving="does" out="does" />
      {does.length > 0 ? (
        <div className="does">
          {does.map((word) => (
            <span key={word}>{word}</span>
          ))}
        </div>
      ) : null}
      <footer className="nodrag">
        {held ? (
          <button
            type="button"
            className={held.open ? "fold open" : "fold"}
            aria-expanded={held.open}
            title={held.open ? "Fold these into the role" : "Show what it uses"}
            onClick={(event) => {
              event.stopPropagation();
              fold(node.id);
            }}
          >
            <Icon name={held.open ? "chevronDown" : "chevronRight"} />
            {held.skills > 0 ? plural(held.skills, "skill") : `${held.more} more`}
            {held.skills > 0 && held.more > 0 ? ` +${held.more}` : ""}
          </button>
        ) : null}
        <span>
          {held ? "" : "No skills · "}
          {plural(node.shown, "tool")} · {node.alwaysOn.toLocaleString("en")} words a turn
        </span>
      </footer>
    </div>
  );
}

function Step({ data: { node } }: NodeProps<FlowNode<"step">>) {
  return (
    <div className="node node-step">
      <Actions node={node} />
      <header>
        <i className="dot kind-step" />
        <span className="kind">Step</span>
      </header>
      <h3>{node.name}</h3>
      <Ports taking="does" into="done by" giving="then" out="then" />
      <div className="ports">
        <Plug kind="then" end="in" />
        <span>after</span>
      </div>
      {node.text === "" ? null : <p className="clamped">{node.text}</p>}
    </div>
  );
}

type CompactProps = {
  readonly node: GraphNode;
  readonly title: string;
  /** What kind of node it is, in a word at its right. */
  readonly says: string;
  readonly plug?: Wire["kind"];
  readonly quiet?: boolean;
};

/** A node that is one thing with one name: its family's dot, its name, its kind in a word, and at most one socket. */
function Compact({ node, title, says, plug, quiet }: CompactProps) {
  return (
    <div className={`node compact${quiet ? " inactive" : ""}`}>
      <Actions node={node} />
      {plug ? <Plug kind={plug} end="out" /> : null}
      <i className={`dot kind-${node.kind}`} />
      <b>{title}</b>
      <Noted id={node.id} />
      <span className="kind">{says}</span>
    </div>
  );
}

const Human = ({ data: { node } }: NodeProps<FlowNode<"human">>) => (
  <div className="node node-human">
    <Actions node={node} />
    <Plug kind="human" end="in" />
    <Icon name="user" />
    <b>You</b>
    <span className="kind">the Human</span>
  </div>
);
const Skill = ({ data: { node } }: NodeProps<FlowNode<"skill">>) => (
  <Compact node={node} title={node.name} says="skill" plug="skill" />
);
const Tools = ({ data: { node } }: NodeProps<FlowNode<"tools">>) => (
  <Compact node={node} title={node.name} says={`${node.tools.length} tools`} plug="tools" />
);
const Server = ({ data: { node } }: NodeProps<FlowNode<"server">>) => (
  <Compact node={node} title={node.name} says="outside server" plug="server" />
);
const Question = ({ data: { node } }: NodeProps<FlowNode<"question">>) => (
  <Compact node={node} title={node.name} says={node.active ? "question" : "not asked"} quiet={!node.active} />
);
const Moment = ({ data: { node } }: NodeProps<FlowNode<"moment">>) => (
  <Compact
    node={node}
    title={node.name}
    says={node.active ? "moment" : "not watched"}
    plug="watches"
    quiet={!node.active}
  />
);
const Section = ({ data: { node } }: NodeProps<FlowNode<"section">>) => (
  <Compact node={node} title={node.name} says="section" />
);
const Classifier = ({ data: { node } }: NodeProps<FlowNode<"classifier">>) => (
  <div className="node node-classifier">
    <Actions node={node} />
    <header>
      <i className="dot kind-classifier" />
      <b>{node.name}</b>
      <Noted id={node.id} />
      <span className="kind">{plural(node.routes.length, "route")}</span>
    </header>
    <p className="mono">{node.routes[0]?.model ?? ""}</p>
  </div>
);

const Frame = ({ data }: NodeProps<FrameNode>) => (
  <div className="frame">
    <header>{data.title}</header>
  </div>
);

/** Many nodes of one kind held as one, so a wall of questions is one line until someone opens it. */
function Stack({ data: { stack, count, open } }: NodeProps<StackNode>) {
  const { fold } = useEditing();
  return (
    <button
      type="button"
      className={open ? "node stack open" : "node stack"}
      aria-expanded={open}
      onClick={() => {
        fold(stack.id);
      }}
    >
      <i className={`dot kind-${stack.kind}`} />
      <b>{stack.title}</b>
      <span className="count">{count}</span>
      <Icon name={open ? "chevronDown" : "chevronRight"} />
    </button>
  );
}

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
  classifier: Classifier,
  frame: Frame,
  stack: Stack,
} satisfies NodeTypes;
