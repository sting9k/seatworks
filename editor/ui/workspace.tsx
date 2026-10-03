import {
  Background,
  BackgroundVariant,
  type Edge,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useConnection,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type Point, positioned } from "../template/about.ts";
import { notesOf } from "../template/checks.ts";
import {
  addAsked,
  addRole,
  addRoute,
  addSection,
  addServer,
  addSkill,
  addStep,
  applied,
  duplicateRole,
  type Edit,
  giveServer,
  removeAsked,
  removeRole,
  removeClassifier,
  removeSection,
  removeServer,
  removeSkill,
  removeStep,
  renameTemplate,
  stepIdFor,
  together,
  wired,
} from "../template/edits.ts";
import { anchoredOf, besideOf, foldedInto, type Folds, shownOf, STACKS, wiresOf } from "../template/fold.ts";
import { type Graph, type GraphNode, graphOf, type Wire } from "../template/graph.ts";
import { readTemplate, type Template } from "../template/read-template.ts";
import { AskName, PickNode, PickTools } from "./dialogs.tsx";
import { type Editing, EditingContext, isMakeable, type Makeable, NotesContext } from "./editing.ts";
import { download } from "./files.ts";
import { CLEAR, Menu, ZoomTools } from "./floating.tsx";
import { Icon } from "./icons.tsx";
import { Inspector, type Mark } from "./inspector.tsx";
import { BETWEEN_ROLES, FAN, fanned, laidOut } from "./layout.ts";
import { type FlowNode, type FrameNode, NODE_TYPES, type StackNode, USES } from "./nodes.tsx";
import { DRAGGED, FilesPanel, nameOf, NodesPanel, NotesPanel } from "./sidebar.tsx";

type Drawn = FlowNode | FrameNode | StackNode;
type Size = { readonly width: number; readonly height: number };
type WireEdge = Edge<{ readonly kind: Wire["kind"] }>;
type Socket = Wire["kind"] | typeof USES;
/** A socket a wire was pulled from: what it takes, its node, and which end of the wire the node is. */
type Pulled = { readonly socket: Socket; readonly node: string; readonly end: "in" | "out" };
type Asking =
  | { readonly make: Makeable; readonly at: Point; readonly wire?: Pulled }
  | { readonly make: "name" }
  /** A server being given to a role, which is done with the tools of it the role may call. */
  | { readonly make: "give"; readonly server: string; readonly role: string };
/** What of the graph is on the canvas now, and the role each opened skill, tool group or server sits beside. */
type View = {
  readonly folds: Folds;
  readonly shown: ReadonlySet<string>;
  readonly wires: readonly Wire[];
  readonly beside: ReadonlyMap<string, string>;
};

/** The families no wire places, each in a titled frame that carries its nodes when it is moved. */
const FRAMES = [
  { id: "frame:watch", family: "watch", title: "The watch" },
  { id: "frame:sections", family: "section", title: "A report's sections" },
  { id: "frame:questions", family: "question", title: "Reflex questions" },
  { id: "frame:moments", family: "moment", title: "Watch moments" },
] as const;
const FRAME = { pad: 16, title: 36 };
/** What a node measures before it has been drawn: a compact node's size, and a role's height. */
const UNMEASURED: Size = { width: FAN.width, height: 40 };
const ROLE_HEIGHT = 300;
const NO_FOLDS: Folds = { roles: new Set(), stacks: new Set() };
/** The kinds of wire a role's `uses` socket takes. */
const EQUIPMENT: readonly string[] = ["skill", "tools", "server"];
/** The kind of node at each end of a kind of wire (EDITOR.md, Wires). */
const ENDS: Readonly<Record<Wire["kind"], { readonly out: GraphNode["kind"]; readonly in: GraphNode["kind"] }>> = {
  spawns: { out: "role", in: "role" },
  skill: { out: "skill", in: "role" },
  tools: { out: "tools", in: "role" },
  server: { out: "server", in: "role" },
  watches: { out: "moment", in: "role" },
  human: { out: "role", in: "human" },
  does: { out: "role", in: "step" },
  then: { out: "step", in: "step" },
};
const ASKS: Readonly<Record<Makeable, { readonly title: string; readonly hint: string }>> = {
  role: { title: "Name the new role", hint: "lower-case letters, digits and dashes" },
  skill: { title: "Name the new skill", hint: "lower-case letters, digits and dashes" },
  server: { title: "Name the new server", hint: "lower-case letters, digits and dashes" },
  step: { title: "Name the new step", hint: "what the step is called" },
  classifier: {
    title: "Name a route it is served by",
    hint: "the service's name: lower-case letters, digits and dashes",
  },
  question: { title: "Name the new question", hint: "lower-case letters, digits and dashes" },
  moment: { title: "Name the new moment", hint: "lower-case letters, digits and dashes" },
  section: { title: "Name the new section", hint: "lower-case letters, digits and underscores" },
};

const fileOf = (node: GraphNode) => ("file" in node ? node.file : null);
const socketOf = (id: string | null | undefined) => (id ?? "").split("-")[0] as Socket;
/** Whether a socket takes a kind of wire: its own, and for a role's `uses` any equipment. */
const takes = (socket: Socket, kind: Socket) => socket === kind || (socket === USES && EQUIPMENT.includes(kind));
const toggled = <T,>(set: ReadonlySet<T>, item: T): ReadonlySet<T> => {
  const next = new Set(set);
  if (!next.delete(item)) next.add(item);
  return next;
};

type Props = {
  readonly template: Template;
  /** Its files as they were opened, to tell what has gone from it since. */
  readonly opened: Template["files"];
  /** The fewest and the most words a role of SLP reads every turn, when the gallery has it. */
  readonly mark: Mark | null;
  /** Whether it holds a change that has not been exported. */
  readonly changed: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The template's files after a change; everything shown is read again from them. */
  readonly onChange: (files: Template["files"]) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExported: () => void;
  readonly onClose: () => void;
};

/** One template being worked on: its graph, the panels beside it, and the tools that float over it. */
export function Workspace(props: Props) {
  return (
    <ReactFlowProvider>
      <Opened {...props} />
    </ReactFlowProvider>
  );
}

function Opened({
  template,
  opened,
  mark,
  changed,
  canUndo,
  canRedo,
  onChange,
  onUndo,
  onRedo,
  onExported,
  onClose,
}: Props) {
  const graph = useMemo(() => graphOf(template), [template]);
  const notes = useMemo(() => {
    const start = readTemplate(opened);
    return notesOf(template, start.ok ? start.template : template);
  }, [template, opened]);
  const kept = useMemo(() => new Map(Object.entries(template.about.editor?.positions ?? {})), [template]);
  const flow = useReactFlow<Drawn, WireEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Drawn>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WireEdge>([]);
  const [arrangedOnce, setArrangedOnce] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [folds, setFolds] = useState<Folds>(NO_FOLDS);
  /** A node to bring into view with what sits beside it, once that is drawn. */
  const [sought, setSought] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [side, setSide] = useState<"nodes" | "files" | "notes" | null>("nodes");
  const [about, setAbout] = useState(true);
  const [map, setMap] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [pulled, setPulled] = useState<(Pulled & { readonly at: Point }) | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const copied = useRef<string | null>(null);
  const measured = useNodesInitialized();
  const picked = graph.nodes.find((node) => node.id === pickedId) ?? null;
  const view = useMemo<View>(() => {
    const noted = new Set(notes.map((note) => note.node));
    return {
      folds,
      shown: shownOf(graph, folds, pickedId, noted),
      wires: wiresOf(graph, folds, pickedId, noted),
      beside: besideOf(graph, folds),
    };
  }, [graph, folds, pickedId, notes]);

  // What is drawn follows the files and what is folded: a node stays where it is, a new one takes the place kept for it.
  useEffect(() => {
    setNodes((drawn) => synced(graph, view, drawn, kept));
    setEdges((drawn) => {
      const selected = new Set(drawn.filter((edge) => edge.selected).map((edge) => edge.id));
      return edgesOf(graph, view.wires).map((edge) => ({ ...edge, selected: selected.has(edge.id) }));
    });
  }, [graph, view, kept, setNodes, setEdges]);

  // A node's size is known only once it is drawn, so the first drawing is hidden and measured, then laid out.
  useEffect(() => {
    if (!measured || arrangedOnce) return;
    const drawn = flow.getNodes();
    const anchored = anchoredOf(graph);
    const sizes = sizesOf(drawn);
    const places = anchored.nodes.every((node) => kept.has(node.id))
      ? kept
      : laidOut(anchored, new Map(anchored.nodes.map(({ id }) => [id, sizes.get(id) ?? UNMEASURED])), BETWEEN_ROLES);
    setNodes(arranged(graph, view, places, drawn));
    setArrangedOnce(true);
  }, [measured, arrangedOnce, flow, graph, view, kept, setNodes]);
  // Fitted on the frame after the layout is drawn: before it, every node is still where it was measured.
  useEffect(() => {
    if (!arrangedOnce) return;
    const frame = requestAnimationFrame(() => void flow.fitView({ padding: CLEAR }));
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [arrangedOnce, flow]);
  // What a fold opens is drawn a moment after it: the view moves once the node and what sits beside it are measured.
  useEffect(() => {
    if (sought === null) return;
    const beside = [...view.beside].flatMap(([id, role]) => (role === sought && view.shown.has(id) ? [id] : []));
    const wanted = [sought, ...beside];
    const sized = new Set(nodes.flatMap((node) => (node.measured?.width ? [node.id] : [])));
    if (!wanted.every((id) => sized.has(id))) return;
    void flow.fitView({ nodes: wanted.map((id) => ({ id })), duration: 300, maxZoom: 1, padding: CLEAR });
    setSought(null);
  }, [sought, view, nodes, flow]);

  /** Where every node that keeps a place is now; what sits beside a role keeps none. */
  const places = () => absoluteOf(flow.getNodes());
  const middle = () => {
    const box = canvas.current!.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };

  /** Makes a change and keeps every node's place: a new node where it was put, a renamed one where it was. */
  const change = (edit: Edit, placing: ReadonlyMap<string, Point> = new Map()) => {
    const made = applied(template, edit);
    if (!made.ok) {
      setRefused(made.says);
      return;
    }
    setRefused(null);
    const before = places();
    const after = anchoredOf(graphOf(made.template)).nodes.map((node) => node.id);
    const gone = [...before.keys()].filter((id) => !after.includes(id));
    const fresh = after.filter((id) => !before.has(id) && !placing.has(id));
    const fallback = gone.length === 1 && fresh.length === 1 ? before.get(gone[0]!)! : middle();
    onChange(positioned(made.files, new Map(after.map((id) => [id, placing.get(id) ?? before.get(id) ?? fallback]))));
  };

  const pick = (node: GraphNode) => {
    setPickedId(node.id);
    setFile(fileOf(node));
  };
  const remove = (node: GraphNode) => {
    const edit = removal(node);
    if (edit) change(edit);
  };
  /** Picks a node from a list and brings it into view: it may be off the canvas, or drawn only now. */
  const show = (node: GraphNode) => {
    pick(node);
    setSought(node.id);
    setNodes((drawn) => drawn.map((other) => ({ ...other, selected: other.id === node.id })));
  };
  const duplicate = (node: GraphNode) => {
    if (node.kind !== "role") return;
    let as = `${node.name}-copy`;
    for (let n = 2; template.profile.roles.has(as); n++) as = `${node.name}-copy-${n}`;
    const at = places().get(node.id)!;
    change(duplicateRole(node.name, as), new Map([[`role:${as}`, { x: at.x + 48, y: at.y + 48 }]]));
  };
  const make = (kind: Makeable, name: string, at: Point, wire?: Pulled) => {
    const id =
      kind === "step" ? `step:${stepIdFor(template.steps, name)}` : kind === "classifier" ? kind : `${kind}:${name}`;
    const add = adding(kind, name);
    // A server's wire is drawn afterwards, with the tools it gives: there is none to name before the server is.
    const as = wire?.socket === USES ? kind : wire?.socket;
    const joined =
      wire && as !== undefined && as !== "server" && as in ENDS
        ? wired(as as Wire["kind"], wire.end === "out" ? wire.node : id, wire.end === "out" ? id : wire.node, true)
        : null;
    change(joined ? together(add, joined) : add, new Map([[id, at]]));
  };
  /** Joins two nodes by a wire of a kind; a server's asks first which of its tools the role may call. */
  const join = (kind: Wire["kind"], from: string, to: string) => {
    if (kind === "server")
      setAsking({ make: "give", server: from.slice("server:".length), role: to.slice("role:".length) });
    else change(wired(kind, from, to, true));
  };
  const editing: Editing = {
    change,
    remove,
    duplicate,
    showAbout: (node) => {
      pick(node);
      setAbout(true);
    },
    fold: (id) => {
      const stack = STACKS.find((candidate) => candidate.id === id);
      setFolds((was) =>
        stack ? { ...was, stacks: toggled(was.stacks, stack.kind) } : { ...was, roles: toggled(was.roles, id) },
      );
      if (!stack && !folds.roles.has(id)) setSought(id);
    },
    give: (server, role) => {
      setAsking({ make: "give", server, role });
    },
  };
  const exportIt = () => {
    download(template.about.name, template.files);
    onExported();
  };

  // Copy and paste make a second role of the picked one; in a field they are left to the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "c" && picked?.kind === "role") copied.current = picked.id;
      const source = graph.nodes.find((node) => node.id === copied.current);
      if (event.key === "v" && source) duplicate(source);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  return (
    <EditingContext.Provider value={editing}>
      <NotesContext.Provider value={notes}>
        <div className="workspace">
          <nav className="rail">
            {(
              [
                ["nodes", "team", "Nodes"],
                ["files", "folder", "Files"],
                ["notes", "alert", "Notes"],
              ] as const
            ).map(([id, icon, title]) => (
              <button
                key={id}
                type="button"
                className={side === id ? "on" : ""}
                title={title}
                onClick={() => {
                  setSide(side === id ? null : id);
                }}
              >
                <Icon name={icon} />
                {id === "notes" && notes.length > 0 ? <b>{notes.length}</b> : null}
              </button>
            ))}
          </nav>
          {side === "nodes" ? (
            <NodesPanel
              graph={graph}
              picked={pickedId}
              onPick={show}
              onMake={(kind) => {
                setAsking({ make: kind, at: middle() });
              }}
            />
          ) : null}
          {side === "files" ? <FilesPanel files={template.files} open={file} onOpen={setFile} /> : null}
          {side === "notes" ? <NotesPanel graph={graph} notes={notes} onPick={show} /> : null}
          <div
            ref={canvas}
            className={arrangedOnce ? "canvas" : "canvas arranging"}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(DRAGGED)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              const kind = event.dataTransfer.getData(DRAGGED);
              if (!isMakeable(kind)) return;
              event.preventDefault();
              setAsking({ make: kind, at: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => {
                if (node.type !== "frame" && node.type !== "stack") pick(node.data.node);
              }}
              onPaneClick={() => {
                setPickedId(null);
              }}
              onNodeDragStop={() => {
                onChange(positioned(template.files, places()));
              }}
              isValidConnection={(wire) => {
                const kind = socketOf(wire.sourceHandle);
                return (
                  wire.source !== wire.target &&
                  takes(socketOf(wire.targetHandle), kind) &&
                  !edges.some(
                    (edge) => edge.source === wire.source && edge.target === wire.target && edge.data?.kind === kind,
                  )
                );
              }}
              onConnect={(wire) => {
                join(socketOf(wire.sourceHandle) as Wire["kind"], wire.source, wire.target);
              }}
              onConnectEnd={(event, ended) => {
                if (ended.isValid || ended.toNode || !ended.fromHandle) return;
                const at = "changedTouches" in event ? event.changedTouches[0]! : event;
                setPulled({
                  socket: socketOf(ended.fromHandle.id),
                  node: ended.fromNode.id,
                  end: ended.fromHandle.type === "source" ? "out" : "in",
                  at: { x: at.clientX, y: at.clientY },
                });
              }}
              onBeforeDelete={({ nodes: goneNodes, edges: goneEdges }) => {
                const gone = goneNodes.flatMap((node) =>
                  node.type !== "frame" && node.type !== "stack" && isMakeable(node.data.node.kind)
                    ? [node.data.node]
                    : [],
                );
                const ids = new Set(gone.map((node) => node.id));
                const cut = goneEdges.filter((edge) => edge.selected && !ids.has(edge.source) && !ids.has(edge.target));
                const edits = [
                  ...cut.map((edge) =>
                    edge.data!.kind === "server"
                      ? giveServer(edge.target.slice("role:".length), edge.source.slice("server:".length), [])
                      : wired(edge.data!.kind, edge.source, edge.target, false),
                  ),
                  ...gone.flatMap((node) => removal(node) ?? []),
                ];
                if (edits.length > 0) change(together(...edits));
                return Promise.resolve(false);
              }}
              minZoom={0.1}
              colorMode="dark"
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <Wiring canvas={canvas} />
              {map ? <MiniMap pannable zoomable nodeClassName={(node) => `mini-${node.type ?? ""}`} /> : null}
            </ReactFlow>

            <div className="bar float top left">
              <button
                type="button"
                className={side === null ? "tool" : "tool on"}
                title="The side panel"
                onClick={() => {
                  setSide(side === null ? "nodes" : null);
                }}
              >
                <Icon name="panelLeft" />
              </button>
              <Menu label={template.about.name}>
                <button
                  type="button"
                  onClick={() => {
                    setAsking({ make: "name" });
                  }}
                >
                  <Icon name="pencil" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const anchored = anchoredOf(graph);
                    const sizes = sizesOf(flow.getNodes());
                    const all = new Map(anchored.nodes.map(({ id }) => [id, sizes.get(id) ?? UNMEASURED]));
                    onChange(positioned(template.files, laidOut(anchored, all, BETWEEN_ROLES)));
                  }}
                >
                  <Icon name="tidy" />
                  Tidy up
                </button>
                <hr />
                <button type="button" onClick={exportIt}>
                  <Icon name="download" />
                  Export
                </button>
                <hr />
                <button type="button" onClick={onClose}>
                  <Icon name="close" />
                  Close template
                </button>
              </Menu>
            </div>

            <div className="bar float top right">
              <button type="button" className="tool" title="Undo" disabled={!canUndo} onClick={onUndo}>
                <Icon name="undo" />
              </button>
              <button type="button" className="tool" title="Redo" disabled={!canRedo} onClick={onRedo}>
                <Icon name="redo" />
              </button>
              <span className={changed ? "state changed" : "state"}>{changed ? "Not exported" : "Exported"}</span>
              <button type="button" className="signal" onClick={exportIt}>
                Export
              </button>
              <button
                type="button"
                className={about ? "tool on" : "tool"}
                title="About the picked node"
                onClick={() => {
                  setAbout(!about);
                }}
              >
                <Icon name="panelRight" />
              </button>
            </div>

            <div className="bar float bottom left">
              <button
                type="button"
                className="tool wide"
                disabled={folds.roles.size === 0 && folds.stacks.size === 0}
                onClick={() => {
                  setFolds(NO_FOLDS);
                }}
              >
                Fold all
              </button>
              <i className="rule" />
              <button
                type="button"
                className="tool wide"
                onClick={() => {
                  setFolds({
                    roles: new Set(graph.nodes.flatMap((node) => (node.kind === "role" ? [node.id] : []))),
                    stacks: new Set(STACKS.map((stack) => stack.kind)),
                  });
                }}
              >
                Show all
              </button>
            </div>

            <ZoomTools
              map={map}
              onMap={() => {
                setMap(!map);
              }}
            />

            {refused === null ? null : (
              <div className="toast" role="alert">
                <Icon name="alert" />
                Not done: {refused}
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => {
                    setRefused(null);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
          </div>
          {about && (picked || file !== null) ? (
            <Inspector template={template} mark={mark} picked={picked} open={file} onOpen={setFile} />
          ) : null}
        </div>
      </NotesContext.Provider>

      {pulled ? (
        <PickNode
          at={pulled.at}
          onClose={() => {
            setPulled(null);
          }}
          choices={choicesFor(graph, pulled, {
            join: (kind, other) => {
              setPulled(null);
              const [from, to] = pulled.end === "out" ? [pulled.node, other] : [other, pulled.node];
              join(kind, from, to);
            },
            make: (kind) => {
              setPulled(null);
              setAsking({ make: kind, at: flow.screenToFlowPosition(pulled.at), wire: pulled });
            },
          })}
        />
      ) : null}
      {asking?.make === "give" ? (
        <PickTools
          title={`Which tools of ${asking.server} may ${asking.role} call?`}
          known={graph.nodes.flatMap((node) =>
            node.kind === "server" && node.name === asking.server ? node.tools : [],
          )}
          given={template.file.roles[asking.role]?.servers?.[asking.server] ?? []}
          onClose={() => {
            setAsking(null);
          }}
          onTools={(tools) => {
            setAsking(null);
            // A role given none that had none is as it was: there is no wire to take away.
            if (tools.length > 0 || template.file.roles[asking.role]?.servers?.[asking.server])
              change(giveServer(asking.role, asking.server, tools));
          }}
        />
      ) : asking?.make === "name" ? (
        <AskName
          title="Rename the template"
          hint="its name in the gallery"
          start={template.about.name}
          onClose={() => {
            setAsking(null);
          }}
          onName={(name) => {
            setAsking(null);
            change(renameTemplate(name));
          }}
        />
      ) : asking ? (
        <AskName
          title={ASKS[asking.make].title}
          hint={ASKS[asking.make].hint}
          onClose={() => {
            setAsking(null);
          }}
          onName={(name) => {
            setAsking(null);
            make(asking.make, name, asking.at, asking.wire);
          }}
        />
      ) : null}
    </EditingContext.Provider>
  );
}

/** The edit that adds a node of a kind under a name, from its skeleton. */
function adding(kind: Makeable, name: string): Edit {
  switch (kind) {
    case "role":
      return addRole(name);
    case "skill":
      return addSkill(name);
    case "server":
      return addServer(name);
    case "step":
      return addStep(name);
    case "section":
      return addSection(name);
    case "classifier":
      return addRoute(name);
    case "question":
    case "moment":
      return addAsked(kind, name);
  }
}

/** The edit that takes a node away, for the kinds a person may take away. */
function removal(node: GraphNode): Edit | null {
  switch (node.kind) {
    case "role":
      return removeRole(node.name);
    case "skill":
      return removeSkill(node.name);
    case "step":
      return removeStep(node.id.slice("step:".length));
    case "server":
      return removeServer(node.name);
    case "section":
      return removeSection(node.name);
    case "classifier":
      return removeClassifier();
    case "question":
    case "moment":
      return removeAsked(node.kind, node.name);
    case "human":
    case "tools":
      return null;
  }
}

/** Marks the canvas with the wire being pulled; a part of its own, since a pulled wire redraws it on every move. */
function Wiring({ canvas }: { canvas: RefObject<HTMLDivElement | null> }) {
  const connection = useConnection();
  const kind = connection.inProgress ? socketOf(connection.fromHandle.id) : null;
  useEffect(() => {
    const marked = canvas.current;
    if (!marked || kind === null) return;
    marked.dataset.wiring = kind;
    return () => {
      delete marked.dataset.wiring;
    };
  }, [canvas, kind]);
  return null;
}

/** What a wire let go over empty canvas may go to: each node that takes it and has none yet, and a new one. */
function choicesFor(
  graph: Graph,
  pulled: Pulled,
  act: { readonly join: (kind: Wire["kind"], other: string) => void; readonly make: (kind: Makeable) => void },
) {
  const far = pulled.end === "out" ? "in" : "out";
  /** The kinds of wire the pulled socket takes, each with the kind of node at its far end. */
  const kinds = (Object.keys(ENDS) as Wire["kind"][]).filter((kind) => takes(pulled.socket, kind));
  const joined = new Set(
    graph.wires.flatMap((wire) => {
      if (!kinds.includes(wire.kind)) return [];
      if (pulled.end === "out") return wire.from === pulled.node ? [wire.to] : [];
      return wire.to === pulled.node ? [wire.from] : [];
    }),
  );
  return kinds.flatMap((kind) => {
    const other = ENDS[kind][far];
    const there = graph.nodes
      .filter((node) => node.kind === other && node.id !== pulled.node && !joined.has(node.id))
      .map((node) => ({
        key: node.id,
        name: nameOf(node),
        label: (
          <>
            <i className={`dot kind-${node.kind}`} />
            {nameOf(node)}
          </>
        ),
        pick: () => {
          act.join(kind, node.id);
        },
      }));
    if (!isMakeable(other)) return there;
    return [
      ...there,
      {
        key: `new ${other}`,
        name: `new ${other}`,
        label: (
          <>
            <Icon name="plus" />
            New {other}…
          </>
        ),
        pick: () => {
          act.make(other);
        },
      },
    ];
  });
}

const sizesOf = (drawn: readonly Drawn[]) =>
  new Map(
    drawn.flatMap((node): [string, Size][] =>
      node.measured?.width && node.measured.height
        ? [[node.id, { width: node.measured.width, height: node.measured.height }]]
        : [],
    ),
  );

/** Where each drawn node that keeps a place is, a framed one counted from the canvas and not from its frame. */
function absoluteOf(drawn: readonly Drawn[]): Map<string, Point> {
  const frames = new Map(drawn.flatMap((node) => (node.type === "frame" ? [[node.id, node.position]] : [])));
  return new Map(
    drawn.flatMap((node): [string, Point][] => {
      if (node.type === "frame") return [];
      if (node.parentId === undefined) return [[node.id, node.position]];
      const frame = frames.get(node.parentId);
      // What hangs on a role sits beside it wherever the role goes: it keeps no place of its own.
      return frame ? [[node.id, { x: frame.x + node.position.x, y: frame.y + node.position.y }]] : [];
    }),
  );
}

/** The graph's nodes as they are drawn: one already there keeps its place and what was measured of it. */
function synced(graph: Graph, view: View, drawn: readonly Drawn[], kept: ReadonlyMap<string, Point>): Drawn[] {
  const here = absoluteOf(drawn);
  const places = new Map(anchoredOf(graph).nodes.map(({ id }) => [id, kept.get(id) ?? here.get(id) ?? { x: 0, y: 0 }]));
  return arranged(graph, view, places, drawn);
}

/** Every node at its place: an unwired family in a frame that carries it, what a role has opened beside the role. */
function arranged(graph: Graph, view: View, placed: ReadonlyMap<string, Point>, before: readonly Drawn[]): Drawn[] {
  const anchored = anchoredOf(graph).nodes;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const sizes = sizesOf(before);
  const size = (id: string) => sizes.get(id) ?? UNMEASURED;
  const hidden = (id: string) => byId.has(id) && !view.shown.has(id);
  /** What React Flow keeps of a node already drawn, less what is set anew here. */
  const was = (id: string) => {
    const { parentId: _p, hidden: _h, draggable: _d, ...rest } = before.find((node) => node.id === id) ?? {};
    return rest;
  };

  const frames = new Map<string, FrameNode>();
  for (const { id, family, title } of FRAMES) {
    const inside = anchored.filter((node) => node.family === family && !hidden(node.id));
    if (inside.length === 0) continue;
    const at = inside.map((node) => ({ ...placed.get(node.id)!, ...size(node.id) }));
    const left = Math.min(...at.map((box) => box.x)) - FRAME.pad;
    const top = Math.min(...at.map((box) => box.y)) - FRAME.pad - FRAME.title;
    const right = Math.max(...at.map((box) => box.x + box.width)) + FRAME.pad;
    const bottom = Math.max(...at.map((box) => box.y + box.height)) + FRAME.pad;
    frames.set(family, {
      id,
      type: "frame",
      position: { x: left, y: top },
      style: { width: right - left, height: bottom - top },
      data: { title },
      selectable: false,
    });
  }

  const kept = anchored.map(({ id, family }): Drawn => {
    const frame = frames.get(family);
    const at = placed.get(id)!;
    const where = {
      position: frame ? { x: at.x - frame.position.x, y: at.y - frame.position.y } : at,
      ...(frame ? { parentId: frame.id } : {}),
    };
    const stack = STACKS.find((candidate) => candidate.id === id);
    if (stack) {
      const count = graph.nodes.filter((node) => node.kind === stack.kind).length;
      return {
        ...was(id),
        id,
        type: "stack",
        ...where,
        data: { stack, count, open: view.folds.stacks.has(stack.kind) },
      };
    }
    const node = byId.get(id)!;
    const folded = node.kind === "role" ? { ...foldedInto(graph, id), open: view.folds.roles.has(id) } : undefined;
    return { ...was(id), id, type: node.kind, ...where, hidden: hidden(id), data: { node, folded } } as FlowNode;
  });

  const fans = new Map<string, string[]>();
  for (const [id, role] of view.beside) if (view.shown.has(id)) fans.set(role, [...(fans.get(role) ?? []), id]);
  const beside = [...fans].flatMap(([role, ids]) =>
    ids.map((id, index): Drawn => {
      const node = byId.get(id)!;
      const position = fanned(sizes.get(role)?.height ?? ROLE_HEIGHT, index, ids.length);
      return {
        ...was(id),
        id,
        type: node.kind,
        parentId: role,
        position,
        draggable: false,
        data: { node },
      } as FlowNode;
    }),
  );
  return [...frames.values(), ...kept, ...beside];
}

/** The wires as they are drawn; one that gives a role part of a group, or a server's tools, says so. */
function edgesOf(graph: Graph, wires: readonly Wire[]): WireEdge[] {
  const groupSize = new Map(
    graph.nodes.flatMap((node) => (node.kind === "tools" ? [[node.id, node.tools.length]] : [])),
  );
  return wires.map((wire) => ({
    id: `${wire.kind}:${wire.from}>${wire.to}`,
    source: wire.from,
    target: wire.to,
    sourceHandle: `${wire.kind}-out`,
    targetHandle: `${EQUIPMENT.includes(wire.kind) ? USES : wire.kind}-in`,
    className: `wire-${wire.kind}`,
    data: { kind: wire.kind },
    ...(wire.kind === "tools" && wire.tools.length < groupSize.get(wire.from)!
      ? { label: `${wire.tools.length} of ${groupSize.get(wire.from)!}` }
      : wire.kind === "server"
        ? { label: wire.tools.join(", ") }
        : {}),
  }));
}
