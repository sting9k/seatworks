import { useState } from "react";
import type { Graph, GraphNode } from "../template/graph.ts";
import type { TemplateFiles } from "../template/read-template.ts";
import type { Note } from "../template/checks.ts";
import { MAKEABLE, type Makeable } from "./editing.ts";
import { Icon } from "./icons.tsx";

const FAMILIES: readonly { readonly name: string; readonly kinds: readonly GraphNode["kind"][] }[] = [
  { name: "Team", kinds: ["role", "human"] },
  { name: "Equipment", kinds: ["skill", "tools", "server"] },
  { name: "Attention", kinds: ["moment", "question"] },
  { name: "Flow", kinds: ["step"] },
  { name: "Report", kinds: ["section"] },
];
const MAKES: Readonly<Record<Makeable, { readonly label: string; readonly says: string }>> = {
  role: { label: "Role", says: "A seat in the team: what it may do and what it reads" },
  skill: { label: "Skill", says: "A craft a role opens when its moment comes" },
  server: { label: "Outside server", says: "Tools from an MCP server that is not the team's" },
  step: { label: "Step", says: "A step of the team's flow, and what comes after it" },
  question: { label: "Reflex question", says: "One condition asked of an event of the record" },
  moment: { label: "Watch moment", says: "One condition asked of what a watched role says and does" },
  section: { label: "Report section", says: "A heading the team's reports are written and read under" },
};
/** What a dragged node carries its kind under, for the canvas it is dropped on. */
export const DRAGGED = "application/x-seatworks-node";

export const nameOf = (node: GraphNode) => (node.kind === "human" ? "The Human" : node.name);

/** The nodes of this template to find one by, and the kinds of node to add to it. */
export function NodesPanel({
  graph,
  picked,
  onPick,
  onMake,
}: {
  graph: Graph;
  picked: string | null;
  onPick: (node: GraphNode) => void;
  onMake: (kind: Makeable) => void;
}) {
  const [tab, setTab] = useState<"here" | "add">("here");
  const [query, setQuery] = useState("");
  const wanted = query.trim().toLowerCase();
  return (
    <nav className="panel">
      <h2>Nodes</h2>
      <div className="tabs">
        <button
          type="button"
          className={tab === "here" ? "on" : ""}
          onClick={() => {
            setTab("here");
          }}
        >
          In this template
        </button>
        <button
          type="button"
          className={tab === "add" ? "on" : ""}
          onClick={() => {
            setTab("add");
          }}
        >
          Add
        </button>
      </div>
      {tab === "add" ? (
        <>
          <p className="section">Drag onto the graph</p>
          <ul className="rows">
            {MAKEABLE.map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  draggable
                  title={MAKES[kind].says}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAGGED, kind);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    onMake(kind);
                  }}
                >
                  <i className={`dot kind-${kind}`} />
                  <span>
                    {MAKES[kind].label}
                    <small>{MAKES[kind].says}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </label>
          {FAMILIES.map((family) => {
            const members = graph.nodes.filter(
              (node) => family.kinds.includes(node.kind) && nameOf(node).toLowerCase().includes(wanted),
            );
            if (members.length === 0) return null;
            return (
              <details
                key={`${family.name}:${wanted === "" ? "all" : "found"}`}
                open={wanted !== "" || members.length < 12}
              >
                <summary className="section">
                  <Icon name="chevronRight" />
                  {family.name}
                  <span className="count">{members.length}</span>
                </summary>
                <ul className="rows">
                  {members.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        className={node.id === picked ? "on" : ""}
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
        </>
      )}
    </nav>
  );
}

/** What a machine saw in the template, each note on the node it is about (EDITOR.md, Checks). */
export function NotesPanel({
  graph,
  notes,
  onPick,
}: {
  graph: Graph;
  notes: readonly Note[];
  onPick: (node: GraphNode) => void;
}) {
  const noted = graph.nodes.filter((node) => notes.some((note) => note.node === node.id));
  return (
    <nav className="panel">
      <h2>Notes</h2>
      <p className="hint">
        What a machine can see. A note stops nothing: whether a template makes a team work well is known only by running
        it.
      </p>
      {noted.length === 0 ? <p className="section">Nothing to look at</p> : null}
      {noted.map((node) => (
        <div key={node.id} className="noted">
          <button
            type="button"
            onClick={() => {
              onPick(node);
            }}
          >
            <i className={`dot kind-${node.kind}`} />
            {nameOf(node)}
          </button>
          <ul>
            {notes
              .filter((note) => note.node === node.id)
              .map((note) => (
                <li key={note.says}>{note.says}</li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Every file of the template, by folder. */
export function FilesPanel({
  files,
  open,
  onOpen,
}: {
  files: TemplateFiles;
  open: string | null;
  onOpen: (path: string) => void;
}) {
  const paths = [...files.keys()].sort();
  const folders = [
    ...new Set(paths.map((path) => (path.includes("/") ? path.slice(0, path.indexOf("/")) : ""))),
  ].sort();
  return (
    <nav className="panel">
      <h2>Files</h2>
      {folders.map((folder) => {
        const inside = paths.filter((path) => (folder === "" ? !path.includes("/") : path.startsWith(`${folder}/`)));
        const rows = (
          <ul className="rows mono">
            {inside.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className={path === open ? "on" : ""}
                  onClick={() => {
                    onOpen(path);
                  }}
                >
                  <Icon name="file" />
                  {folder === "" ? path : path.slice(folder.length + 1)}
                </button>
              </li>
            ))}
          </ul>
        );
        return folder === "" ? (
          <div key="">{rows}</div>
        ) : (
          <details key={folder}>
            <summary className="section">
              <Icon name="chevronRight" />
              <Icon name="folder" />
              {folder}
              <span className="count">{inside.length}</span>
            </summary>
            {rows}
          </details>
        );
      })}
    </nav>
  );
}
