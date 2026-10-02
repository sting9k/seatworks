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
  addServer,
  addSkill,
  addStep,
  applied,
  duplicateRole,
  type Edit,
  giveServer,
  removeAsked,
  removeRole,
  removeServer,
  removeSkill,
  removeStep,
  renameTemplate,
  stepIdFor,
  together,
  wired,
} from "../template/edits.ts";
import { type Graph, type GraphNode, graphOf, type Wire } from "../template/graph.ts";
import { readTemplate, type Template } from "../template/read-template.ts";
import { AskName, PickNode } from "./dialogs.tsx";
import { type Editing, EditingContext, isMakeable, type Makeable, NotesContext } from "./editing.ts";
import { download } from "./files.ts";
import { Menu, ZoomTools } from "./floating.tsx";
import { Icon } from "./icons.tsx";
import { laidOut } from "./layout.ts";
import { type FlowNode, type FrameNode, NODE_TYPES } from "./nodes.tsx";
import { Properties } from "./properties.tsx";
import { DRAGGED, FilesPanel, nameOf, NodesPanel, NotesPanel } from "./sidebar.tsx";

type Drawn = FlowNode | FrameNode;
type Size = { readonly width: number; readonly height: number };
type WireEdge = Edge<{ readonly kind: Wire["kind"] }>;
/** A socket a wire was pulled from: its kind, its node, and which end of the wire the node is. */
type Pulled = { readonly kind: Wire["kind"]; readonly node: string; readonly end: "in" | "out" };
type Asking =
  | { readonly make: Makeable; readonly at: Point; readonly wire?: Pulled }
  | { readonly make: "name" }
  /** A server being given to a role, which is done with the tools of it the role may call. */
  | { readonly make: "give"; readonly server: string; readonly role: string };

const QUESTIONS = "frame:questions";
const FRAME = { pad: 14, title: 34 };
const UNMEASURED: Size = { width: 180, height: 32 };
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
  question: { title: "Name the new question", hint: "lower-case letters, digits and dashes" },
  moment: { title: "Name the new moment", hint: "lower-case letters, digits and dashes" },
};

const fileOf = (node: GraphNode) => ("file" in node ? node.file : null);
const kindOfSocket = (id: string | null | undefined) => (id ?? "").split("-")[0] as Wire["kind"];

type Props = {
  readonly template: Template;
  /** Its files as they were opened, to tell what has gone from it since. */
  readonly opened: Template["files"];
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

function Opened({ template, opened, changed, canUndo, canRedo, onChange, onUndo, onRedo, onExported, onClose }: Props) {
  const graph = useMemo(() => graphOf(template), [template]);
  const notes = useMemo(() => {
    const start = readTemplate(opened);
    return notesOf(template, start.ok ? start.template : template);
  }, [template, opened]);
  const kept = useMemo(() => new Map(Object.entries(template.about.editor?.positions ?? {})), [template]);
  const flow = useReactFlow<Drawn, WireEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Drawn>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WireEdge>([]);
  const [arranged, setArranged] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
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

  // What is drawn follows the files: a node stays where it is, a new one takes the place kept for it.
  useEffect(() => {
    setNodes((drawn) => synced(graph, drawn, kept));
    setEdges((drawn) => {
      const selected = new Set(drawn.filter((edge) => edge.selected).map((edge) => edge.id));
      return edgesOf(graph).map((edge) => ({ ...edge, selected: selected.has(edge.id) }));
    });
  }, [graph, kept, setNodes, setEdges]);

  // A node's size is known only once it is drawn, so the first drawing is hidden and measured, then laid out.
  useEffect(() => {
    if (!measured || arranged) return;
    const sizes = sizesOf(flow.getNodes());
    const places = graph.nodes.every((node) => kept.has(node.id)) ? kept : laidOut(graph, sizes);
    setNodes((drawn) => framed(drawn, places, sizes));
    setArranged(true);
  }, [measured, arranged, flow, graph, kept, setNodes]);
  useEffect(() => {
    if (arranged) void flow.fitView({ padding: 0.06 });
  }, [arranged, flow]);

  /** Where every node is now, a framed one counted from the canvas and not from its frame. */
  const places = () => {
    const drawn = flow.getNodes();
    const frames = new Map(drawn.flatMap((node) => (node.type === "frame" ? [[node.id, node.position]] : [])));
    return new Map(
      drawn.flatMap((node): [string, Point][] => {
        if (node.type === "frame") return [];
        const frame = node.parentId === undefined ? { x: 0, y: 0 } : frames.get(node.parentId)!;
        return [[node.id, { x: frame.x + node.position.x, y: frame.y + node.position.y }]];
      }),
    );
  };
  const middle = () => {
    const box = canvas.current!.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };

  /**
   * Makes a change and keeps every node's place with it. A node the change brings sits where it was put; one that
   * takes another's place, as a renamed role does, sits where that one was; any other, in the middle of the view.
   */
  const change = (edit: Edit, placing: ReadonlyMap<string, Point> = new Map()) => {
    const made = applied(template, edit);
    if (!made.ok) {
      setRefused(made.says);
      return;
    }
    setRefused(null);
    const before = places();
    const after = graphOf(made.template).nodes.map((node) => node.id);
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
  const show = (node: GraphNode) => {
    pick(node);
    setNodes((drawn) => drawn.map((other) => ({ ...other, selected: other.id === node.id })));
    void flow.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1, padding: 1.2 });
  };
  const duplicate = (node: GraphNode) => {
    if (node.kind !== "role") return;
    let as = `${node.name}-copy`;
    for (let n = 2; template.profile.roles.has(as); n++) as = `${node.name}-copy-${n}`;
    const at = places().get(node.id)!;
    change(duplicateRole(node.name, as), new Map([[`role:${as}`, { x: at.x + 48, y: at.y + 48 }]]));
  };
  const make = (kind: Makeable, name: string, at: Point, wire?: Pulled) => {
    const id = kind === "step" ? `step:${stepIdFor(template.steps, name)}` : `${kind}:${name}`;
    const add =
      kind === "role"
        ? addRole(name)
        : kind === "skill"
          ? addSkill(name)
          : kind === "server"
            ? addServer(name)
            : kind === "step"
              ? addStep(name)
              : addAsked(kind, name);
    // A server's wire is drawn afterwards, with the tools it gives: there is none to name before the server is.
    const joined =
      wire && wire.kind !== "server"
        ? wired(wire.kind, wire.end === "out" ? wire.node : id, wire.end === "out" ? id : wire.node, true)
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
            <button
              type="button"
              className={side === "nodes" ? "on" : ""}
              title="Nodes"
              onClick={() => {
                setSide(side === "nodes" ? null : "nodes");
              }}
            >
              <Icon name="nodes" />
            </button>
            <button
              type="button"
              className={side === "files" ? "on" : ""}
              title="Files"
              onClick={() => {
                setSide(side === "files" ? null : "files");
              }}
            >
              <Icon name="folder" />
            </button>
            <button
              type="button"
              className={side === "notes" ? "on" : ""}
              title="Notes"
              onClick={() => {
                setSide(side === "notes" ? null : "notes");
              }}
            >
              <Icon name="info" />
              {notes.length > 0 ? <b>{notes.length}</b> : null}
            </button>
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
            className={arranged ? "canvas" : "canvas arranging"}
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
                if (node.type !== "frame") pick(node.data.node);
              }}
              onPaneClick={() => {
                setPickedId(null);
              }}
              onNodeDragStop={() => {
                onChange(positioned(template.files, places()));
              }}
              isValidConnection={(wire) =>
                wire.source !== wire.target &&
                kindOfSocket(wire.sourceHandle) === kindOfSocket(wire.targetHandle) &&
                !edges.some(
                  (edge) =>
                    edge.source === wire.source &&
                    edge.target === wire.target &&
                    edge.data?.kind === kindOfSocket(wire.sourceHandle),
                )
              }
              onConnect={(wire) => {
                join(kindOfSocket(wire.sourceHandle), wire.source, wire.target);
              }}
              onConnectEnd={(event, ended) => {
                if (ended.isValid || ended.toNode || !ended.fromHandle) return;
                const at = "changedTouches" in event ? event.changedTouches[0]! : event;
                setPulled({
                  kind: kindOfSocket(ended.fromHandle.id),
                  node: ended.fromNode.id,
                  end: ended.fromHandle.type === "source" ? "out" : "in",
                  at: { x: at.clientX, y: at.clientY },
                });
              }}
              onBeforeDelete={({ nodes: goneNodes, edges: goneEdges }) => {
                const gone = goneNodes.flatMap((node) =>
                  node.type !== "frame" && isMakeable(node.data.node.kind) ? [node.data.node] : [],
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
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
              <Wiring canvas={canvas} />
              {map ? <MiniMap pannable zoomable nodeClassName={(node) => `mini-${node.type ?? ""}`} /> : null}
            </ReactFlow>

            <div className="bar float top left">
              <button
                type="button"
                className="tool"
                title="The side panel"
                onClick={() => {
                  setSide(side === null ? "nodes" : null);
                }}
              >
                <Icon name="panelLeft" />
              </button>
              <Menu
                label={
                  <>
                    <Icon name="graph" />
                    Graph
                  </>
                }
              >
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
                    onChange(positioned(template.files, laidOut(graph, sizesOf(flow.getNodes()))));
                  }}
                >
                  <Icon name="tidy" />
                  Tidy up
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    download(template.about.name, template.files);
                    onExported();
                  }}
                >
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
              <button
                type="button"
                className="tool primary"
                onClick={() => {
                  download(template.about.name, template.files);
                  onExported();
                }}
              >
                <Icon name="download" />
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

            <ZoomTools
              map={map}
              onMap={() => {
                setMap(!map);
              }}
            />

            {refused === null ? null : (
              <div className="toast" role="alert">
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
          {about ? <Properties template={template} picked={picked} open={file} onOpen={setFile} /> : null}
        </div>
      </NotesContext.Provider>

      {pulled ? (
        <PickNode
          at={pulled.at}
          onClose={() => {
            setPulled(null);
          }}
          choices={choicesFor(graph, pulled, {
            join: (other) => {
              setPulled(null);
              const [from, to] = pulled.end === "out" ? [pulled.node, other] : [other, pulled.node];
              join(pulled.kind, from, to);
            },
            make: (kind) => {
              setPulled(null);
              setAsking({ make: kind, at: flow.screenToFlowPosition(pulled.at), wire: pulled });
            },
          })}
        />
      ) : null}
      {asking?.make === "give" ? (
        <AskName
          title={`Which tools of ${asking.server} may ${asking.role} call?`}
          hint="their names, separated by commas"
          onClose={() => {
            setAsking(null);
          }}
          onName={(names) => {
            setAsking(null);
            const tools = names
              .split(",")
              .map((tool) => tool.trim())
              .filter((tool) => tool !== "");
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
    case "question":
    case "moment":
      return removeAsked(node.kind, node.name);
    case "human":
    case "tools":
      return null;
  }
}

/**
 * Marks the canvas with the kind of wire being pulled, so the sockets it cannot go to step back. It is a part of
 * its own because a wire being pulled draws it again on every move, and the canvas it marks must not be.
 */
function Wiring({ canvas }: { canvas: RefObject<HTMLDivElement | null> }) {
  const connection = useConnection();
  const kind = connection.inProgress ? kindOfSocket(connection.fromHandle.id) : null;
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
  act: { readonly join: (other: string) => void; readonly make: (kind: Makeable) => void },
) {
  const other = ENDS[pulled.kind][pulled.end === "out" ? "in" : "out"];
  const joined = new Set(
    graph.wires.flatMap((wire) => {
      if (wire.kind !== pulled.kind) return [];
      if (pulled.end === "out") return wire.from === pulled.node ? [wire.to] : [];
      return wire.to === pulled.node ? [wire.from] : [];
    }),
  );
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
        act.join(node.id);
      },
    }));
  if (!isMakeable(other)) return there;
  return [
    ...there,
    {
      key: "new",
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
}

const sizesOf = (drawn: readonly Drawn[]) =>
  new Map(
    drawn.flatMap((node): [string, Size][] =>
      node.measured?.width && node.measured.height
        ? [[node.id, { width: node.measured.width, height: node.measured.height }]]
        : [],
    ),
  );

/** The graph's nodes as they are drawn: one already there keeps its place and what was measured of it. */
function synced(graph: Graph, drawn: readonly Drawn[], kept: ReadonlyMap<string, Point>): Drawn[] {
  const frames = new Map(drawn.flatMap((node) => (node.type === "frame" ? [[node.id, node.position]] : [])));
  const before = new Map(drawn.flatMap((node) => (node.type === "frame" ? [] : [[node.id, node]])));
  const places = new Map<string, Point>();
  const next = graph.nodes.map((node) => {
    const was = before.get(node.id);
    const frame = was?.parentId === undefined ? { x: 0, y: 0 } : frames.get(was.parentId)!;
    const here = was ? { x: frame.x + was.position.x, y: frame.y + was.position.y } : { x: 0, y: 0 };
    places.set(node.id, kept.get(node.id) ?? here);
    return { ...was, id: node.id, type: node.kind, position: here, data: { node } } as FlowNode;
  });
  return framed(next, places, sizesOf(drawn));
}

/**
 * The nodes at their places, the questions inside a frame of their own that carries them when it is moved: no wire
 * reaches a question, so nothing else says they belong together.
 */
function framed(
  drawn: readonly Drawn[],
  placed: ReadonlyMap<string, Point>,
  sizes: ReadonlyMap<string, Size>,
): Drawn[] {
  const at = drawn.flatMap((node) => {
    if (node.type === "frame") return [];
    const { parentId: _, ...loose } = node;
    return [{ ...loose, position: placed.get(node.id)! }];
  });
  const inside = at.filter((node) => node.type === "question");
  if (inside.length === 0) return at;
  const size = (id: string) => sizes.get(id) ?? UNMEASURED;
  const left = Math.min(...inside.map((node) => node.position.x)) - FRAME.pad;
  const top = Math.min(...inside.map((node) => node.position.y)) - FRAME.pad - FRAME.title;
  const right = Math.max(...inside.map((node) => node.position.x + size(node.id).width)) + FRAME.pad;
  const bottom = Math.max(...inside.map((node) => node.position.y + size(node.id).height)) + FRAME.pad;
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

/**
 * A wire that gives a role only part of a group says how much of it, since the group's node lists it whole; a
 * server's wire says the tools it gives, since nothing else on the graph does.
 */
function edgesOf(graph: Graph): WireEdge[] {
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
    data: { kind: wire.kind },
    ...(wire.kind === "tools" && wire.tools.length < groupSize.get(wire.from)!
      ? { label: `${wire.tools.length} of ${groupSize.get(wire.from)!}` }
      : wire.kind === "server"
        ? { label: wire.tools.join(", ") }
        : {}),
  }));
}
