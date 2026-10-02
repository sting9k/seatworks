import { type ReactNode, useState } from "react";
import { TEMPLATES } from "../gallery/templates.ts";
import { putFile, renameAsked, renameRole, renameSkill, setAsked, setModels, setStep } from "../template/edits.ts";
import { type GraphNode, graphOf } from "../template/graph.ts";
import { readTemplate, type Template } from "../template/read-template.ts";
import { useEditing, useNotes } from "./editing.ts";
import { FileEditor } from "./file-editor.tsx";
import { nameOf } from "./sidebar.tsx";

const KIND: Readonly<Record<GraphNode["kind"], string>> = {
  role: "Role",
  human: "The Human",
  skill: "Skill",
  tools: "Tool group",
  question: "Reflex question",
  moment: "Watch moment",
  step: "Step",
};

const EARNED = {
  earned: "earned at a look back, for these words",
  reworded: "earned for other words; reworded since, so not yet earned",
  "not yet": "not yet earned: its answer goes no further than a candidate",
} as const;

/** The fewest and the most words a role of the shipped template reads every turn: the mark another's are set beside. */
const MARK = (() => {
  const shipped = TEMPLATES[0] && readTemplate(TEMPLATES[0]);
  if (!shipped?.ok) return null;
  const words = graphOf(shipped.template).nodes.flatMap((node) => (node.kind === "role" ? [node.alwaysOn] : []));
  return { name: shipped.template.about.name, least: Math.min(...words), most: Math.max(...words) };
})();

/** What the picked node says of itself and lets be set, above the file that is open. */
export function Properties({
  template,
  picked,
  open,
  onOpen,
}: {
  template: Template;
  picked: GraphNode | null;
  open: string | null;
  onOpen: (path: string) => void;
}) {
  const { change } = useEditing();
  const text = open === null ? undefined : template.files.get(open);
  return (
    <aside className="panel properties">
      {picked ? (
        <section>
          <p className="section">{KIND[picked.kind]}</p>
          <h2>{nameOf(picked)}</h2>
          <About key={picked.id} node={picked} template={template} onOpen={onOpen} />
          <Notes id={picked.id} />
        </section>
      ) : (
        <section>
          <p className="section">Nothing picked</p>
          <p className="hint">Pick a node on the graph or in the list to read what it is and the file it is kept in.</p>
        </section>
      )}
      {open === null || text === undefined ? null : (
        <FileEditor
          key={open}
          path={open}
          text={text}
          onSet={(written) => {
            change(putFile(open, written));
          }}
        />
      )}
    </aside>
  );
}

function Notes({ id }: { id: string }) {
  const notes = useNotes(id);
  return notes.length === 0 ? null : (
    <ul className="notes">
      {notes.map((note) => (
        <li key={note.says}>{note.says}</li>
      ))}
    </ul>
  );
}

/** A line of text that is set when the person leaves it or presses Enter, and not on each key. */
function Line({ label, value, onSet }: { label: string; value: string; onSet: (value: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <label className="line">
      <span>{label}</span>
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={() => {
          if (text.trim() !== value) onSet(text.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function About({
  node,
  template,
  onOpen,
}: {
  node: GraphNode;
  template: Template;
  onOpen: (path: string) => void;
}): ReactNode {
  const { change } = useEditing();
  switch (node.kind) {
    case "role":
      return (
        <>
          <Line
            label="Name"
            value={node.name}
            onSet={(name) => {
              change(renameRole(node.name, name));
            }}
          />
          <Line
            label="Models"
            value={node.models.join(", ")}
            onSet={(models) => {
              change(
                setModels(
                  node.name,
                  models
                    .split(",")
                    .map((model) => model.trim())
                    .filter((model) => model !== ""),
                ),
              );
            }}
          />
          <p className="hint">
            Each model names an agent profile of the Human&apos;s in Paseo; the first is the default.
          </p>
          <dl>
            <dt>Reads every turn</dt>
            <dd>
              {node.alwaysOn.toLocaleString("en")} words
              {MARK ? (
                <span className="hint">
                  {" "}
                  · {MARK.name}&apos;s roles read {MARK.least.toLocaleString("en")} to {MARK.most.toLocaleString("en")}
                </span>
              ) : null}
            </dd>
          </dl>
        </>
      );
    case "human":
      return <p>Asked and told by the roles wired to it.</p>;
    case "skill": {
      const folder = `skills/${node.name}/`;
      const beside = [...template.files.keys()].filter((path) => path.startsWith(folder)).sort();
      return (
        <>
          <Line
            label="Name"
            value={node.name}
            onSet={(name) => {
              change(renameSkill(node.name, name));
            }}
          />
          <p>{node.description}</p>
          <p className="section">In its folder</p>
          <ul className="rows mono">
            {beside.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(path);
                  }}
                >
                  {path.slice(folder.length)}
                </button>
              </li>
            ))}
          </ul>
          <div
            className="drop"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              for (const file of event.dataTransfer.files)
                void file.text().then((text) => {
                  change(putFile(folder + file.name, text));
                });
            }}
          >
            Drop a file here to keep it beside the skill
          </div>
        </>
      );
    }
    case "tools":
      return <p className="mono">{node.tools.join(", ")}</p>;
    case "question":
    case "moment": {
      const counted = node.kind === "moment" && node.countedInCode;
      return (
        <>
          <Line
            label="Name"
            value={node.name}
            onSet={(name) => {
              change(renameAsked(node.kind, node.name, name));
            }}
          />
          <p>{counted ? "Counted in code; no model is asked." : node.asks}</p>
          {counted ? null : (
            <dl>
              <dt>Threshold</dt>
              <dd>{EARNED[node.earned]}</dd>
            </dl>
          )}
          {node.kind === "question" ? (
            <dl>
              <dt>Asked on</dt>
              <dd>{node.on.join(", ")}</dd>
              <dt>Tells</dt>
              <dd>{node.tells ?? "the record only"}</dd>
            </dl>
          ) : null}
          <label className="check">
            <input
              type="checkbox"
              checked={node.active}
              onChange={() => {
                change(setAsked(node.kind, node.name, !node.active));
              }}
            />
            {node.kind === "question" ? "Asked" : "Watched"}: written is not enough, it is in its file&apos;s active
            list
          </label>
        </>
      );
    }
    case "step":
      return <StepFields node={node} />;
  }
}

function StepFields({ node }: { node: Extract<GraphNode, { kind: "step" }> }) {
  const { change } = useEditing();
  const [text, setText] = useState(node.text);
  const id = node.id.slice("step:".length);
  return (
    <>
      <Line
        label="Name"
        value={node.name}
        onSet={(name) => {
          if (name !== "") change(setStep(id, { name }));
        }}
      />
      <label className="line tall">
        <span>What happens in it</span>
        <textarea
          value={text}
          rows={5}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onBlur={() => {
            if (text !== node.text) change(setStep(id, { text }));
          }}
        />
      </label>
    </>
  );
}
