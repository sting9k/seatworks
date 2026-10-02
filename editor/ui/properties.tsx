import { type ReactNode, useState } from "react";
import { renameRole, setStep } from "../template/edits.ts";
import type { GraphNode } from "../template/graph.ts";
import type { TemplateFiles } from "../template/read-template.ts";
import { useEditing } from "./editing.ts";
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

/** What the picked node says of itself and lets be set, above the file that is open. */
export function Properties({
  files,
  picked,
  open,
}: {
  files: TemplateFiles;
  picked: GraphNode | null;
  open: string | null;
}) {
  return (
    <aside className="panel properties">
      {picked ? (
        <section>
          <p className="section">{KIND[picked.kind]}</p>
          <h2>{nameOf(picked)}</h2>
          <About key={picked.id} node={picked} />
        </section>
      ) : (
        <section>
          <p className="section">Nothing picked</p>
          <p className="hint">Pick a node on the graph or in the list to read what it is and the file it is kept in.</p>
        </section>
      )}
      {open === null ? null : (
        <section className="file">
          <p className="section">{open}</p>
          <pre>{files.get(open)}</pre>
        </section>
      )}
    </aside>
  );
}

/** A line of text that is set when the person leaves it or presses Enter, and not on each key. */
function Line({ label, value, onSet }: { label: string; value: string; onSet: (value: string) => void }) {
  const [text, setText] = useState(value);
  const set = () => {
    if (text.trim() !== "" && text !== value) onSet(text.trim());
    else setText(value);
  };
  return (
    <label className="line">
      <span>{label}</span>
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={set}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function About({ node }: { node: GraphNode }): ReactNode {
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
          <dl>
            <dt>Is</dt>
            <dd>{node.properties.length > 0 ? node.properties.join(", ") : "seated, with no property"}</dd>
            <dt>Speaks to</dt>
            <dd>{node.speaks.length > 0 ? node.speaks.join(", ") : "nobody"}</dd>
          </dl>
        </>
      );
    case "human":
      return <p>Asked and told by the roles wired to it.</p>;
    case "skill":
      return <p>{node.description}</p>;
    case "tools":
      return <p className="mono">{node.tools.join(", ")}</p>;
    case "question":
      return (
        <>
          <p>{node.asks}</p>
          <dl>
            <dt>Asked on</dt>
            <dd>{node.on.join(", ")}</dd>
            <dt>Tells</dt>
            <dd>{node.tells ?? "the record only"}</dd>
            <dt>State</dt>
            <dd>{node.active ? "asked" : "written, not asked"}</dd>
          </dl>
        </>
      );
    case "moment":
      return (
        <>
          <p>{node.countedInCode ? "Counted in code; no model is asked." : node.asks}</p>
          <dl>
            <dt>State</dt>
            <dd>{node.active ? "watched" : "written, not watched"}</dd>
          </dl>
        </>
      );
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
          change(setStep(id, { name }));
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
