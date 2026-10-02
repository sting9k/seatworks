import type { ReactNode } from "react";
import type { GraphNode } from "../template/graph.ts";
import type { TemplateFiles } from "../template/read-template.ts";

const KIND: Readonly<Record<GraphNode["kind"], string>> = {
  role: "Role",
  human: "The Human",
  skill: "Skill",
  tools: "Tool group",
  question: "Reflex question",
  moment: "Watch moment",
};

/** What the picked node says of itself, the file it is kept in, and every file of the template. */
export function SidePanel({
  files,
  picked,
  open,
  onOpen,
}: {
  files: TemplateFiles;
  picked: GraphNode | null;
  open: string | null;
  onOpen: (path: string) => void;
}) {
  const paths = [...files.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return (
    <aside className="side">
      {picked ? (
        <section>
          <p className="eyebrow">{KIND[picked.kind]}</p>
          <h2>{picked.kind === "human" ? "The Human" : picked.name}</h2>
          <About node={picked} />
        </section>
      ) : (
        <section>
          <p className="eyebrow">Nothing picked</p>
          <p className="hint">Pick a node on the graph or in the list to read what it is and the file it is kept in.</p>
        </section>
      )}
      {open === null ? null : (
        <section className="file">
          <p className="eyebrow">{open}</p>
          <pre>{files.get(open)}</pre>
        </section>
      )}
      <details className="tree">
        <summary>All files · {paths.length}</summary>
        <ul>
          {paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className={path === open ? "open" : ""}
                onClick={() => {
                  onOpen(path);
                }}
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

function About({ node }: { node: GraphNode }): ReactNode {
  switch (node.kind) {
    case "role":
      return (
        <dl>
          <dt>Is</dt>
          <dd>{node.properties.length > 0 ? node.properties.join(", ") : "seated, with no property"}</dd>
          <dt>Speaks to</dt>
          <dd>{node.speaks.length > 0 ? node.speaks.join(", ") : "nobody"}</dd>
        </dl>
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
  }
}

/** Files at the template's top come before those in its folders. */
const depth = (path: string) => (path.includes("/") ? 1 : 0);
