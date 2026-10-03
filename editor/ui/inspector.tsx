import { type ReactNode, useState } from "react";
import { RELATIONS, type Relation, type Route, type Server } from "../../shared/contracts/profile.ts";
import {
  addRoute,
  putFile,
  removeRoute,
  renameAsked,
  renameRole,
  renameSection,
  renameSkill,
  setAsked,
  setJob,
  setModels,
  setProperty,
  setRoute,
  setSection,
  setServer,
  setSpeaks,
  setStep,
  setTool,
  wired,
} from "../template/edits.ts";
import { type GraphNode, type Job, JOBS } from "../template/graph.ts";
import type { Template } from "../template/read-template.ts";
import { useEditing, useNotes } from "./editing.ts";
import { FileEditor } from "./file-editor.tsx";
import { JOB_WORDS } from "./nodes.tsx";
import { nameOf } from "./sidebar.tsx";

type RoleNode = Extract<GraphNode, { kind: "role" }>;

const KIND: Readonly<Record<GraphNode["kind"], string>> = {
  role: "Role",
  human: "The Human",
  skill: "Skill",
  tools: "Tool group",
  question: "Reflex question",
  moment: "Watch moment",
  step: "Step",
  server: "Outside server",
  section: "Report section",
  classifier: "Classifier",
};

const EARNED = {
  earned: "earned at a look back, for these words",
  reworded: "earned for other words; reworded since, so not yet earned",
  "not yet": "not yet earned: its answer goes no further than a candidate",
} as const;

/** What each job is, said to someone who has not read the kernel's spec. */
const JOB_SAYS: Readonly<Record<Job, string>> = {
  delegates: "Seats other roles and takes their work in.",
  writes: "Works in a copy of the project and hands back commits.",
  reading: "Reads a commit and says what it finds.",
  watches: "Looks at the others and tells an owner when to look.",
};
/** Whom a role may message, as a person says each relation. */
const SPEAKS: Readonly<Record<Relation, string>> = {
  children: "Those it seats",
  descendants: "Everyone under it",
  human: "You",
  parent: "Whoever seated it",
};

/** The fewest and the most words a role of SLP reads every turn: the mark another's are set beside. */
export type Mark = { readonly name: string; readonly least: number; readonly most: number };

type Props = {
  readonly template: Template;
  readonly mark: Mark | null;
  readonly picked: GraphNode | null;
  readonly open: string | null;
  readonly onOpen: (path: string) => void;
};

/** The panel on the right: what the picked node is, what of it is set off the canvas, and the file it is kept in. */
export function Inspector({ template, mark, picked, open, onOpen }: Props) {
  const { change } = useEditing();
  const text = open === null ? undefined : template.files.get(open);
  const file =
    open === null || text === undefined ? null : (
      <FileEditor
        key={open}
        path={open}
        text={text}
        onSet={(written) => {
          change(putFile(open, written));
        }}
      />
    );
  if (!picked)
    return (
      <aside className="panel inspector">
        <p className="empty">Pick a node to read what it is and set the rest of it.</p>
        {file}
      </aside>
    );
  return (
    <aside className="panel inspector">
      <header>
        <i className={`dot kind-${picked.kind}`} />
        <span className="kind">{KIND[picked.kind]}</span>
      </header>
      <h2>{nameOf(picked)}</h2>
      {picked.kind === "role" ? (
        <RolePanel key={picked.id} node={picked} template={template} mark={mark} file={file} />
      ) : (
        <>
          <section className="about">
            <About key={picked.id} node={picked} template={template} onOpen={onOpen} />
            <Notes id={picked.id} />
          </section>
          {file}
        </>
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

/** A part of a node's settings under its name, with a few words at its right. */
function Part({ title, says, children }: { title: string; says?: string; children: ReactNode }) {
  return (
    <section className="part">
      <h3>
        {title}
        {says ? <small>{says}</small> : null}
      </h3>
      {children}
    </section>
  );
}

/** A name on a pill, taken away by its cross. */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip">
      {label}
      <button type="button" title={`Take ${label} away`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

type RolePanelProps = {
  readonly node: RoleNode;
  readonly template: Template;
  readonly mark: Mark | null;
  readonly file: ReactNode;
};

/** A role's panel: what is set of it, its prompt, and what a machine noted about it, a tab each. */
function RolePanel({ node, template, mark, file }: RolePanelProps) {
  const notes = useNotes(node.id);
  const [tab, setTab] = useState<"settings" | "prompt" | "notes">("settings");
  const tabs = [
    ["settings", "Settings"],
    ["prompt", "Prompt"],
    ["notes", notes.length > 0 ? `Notes · ${notes.length}` : "Notes"],
  ] as const;
  return (
    <>
      <div className="segments" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : ""}
            onClick={() => {
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "settings" ? <RoleSettings node={node} template={template} mark={mark} /> : null}
      {tab === "prompt" ? (file ?? <p className="empty">This role has no prompt.</p>) : null}
      {tab === "notes" ? (
        notes.length > 0 ? (
          <Notes id={node.id} />
        ) : (
          <p className="empty">Nothing to look at.</p>
        )
      ) : null}
    </>
  );
}

function RoleSettings({ node, template, mark }: { node: RoleNode; template: Template; mark: Mark | null }) {
  const { change } = useEditing();
  const [adding, setAdding] = useState("");
  const others = [...template.profile.roles.keys()].filter((name) => name !== node.name && !node.seats.includes(name));
  return (
    <div className="settings">
      <Line
        label="Name"
        value={node.name}
        onSet={(name) => {
          change(renameRole(node.name, name));
        }}
      />
      <Part title="Its job" says="At most one">
        <div role="radiogroup" className="choices">
          {[...JOBS, null].map((job) => (
            <button
              key={job ?? "none"}
              type="button"
              role="radio"
              aria-checked={node.job === job}
              className={node.job === job ? "choice on" : "choice"}
              onClick={() => {
                if (node.job !== job) change(setJob(node.name, job));
              }}
            >
              <i />
              <span>
                <b>{job ? JOB_WORDS[job] : "None of these"}</b>
                <small>{job ? JOB_SAYS[job] : "Only talks and reports. It seats nobody and writes nothing."}</small>
              </span>
            </button>
          ))}
        </div>
      </Part>
      <Part title="With the Human">
        {(
          [
            ["root", "Leads the team", "The one role the Human works with. A template has one."],
            ["humanDoor", "May ask you", "Its questions reach the Human."],
          ] as const
        ).map(([property, label, says]) => {
          const on = node.properties.includes(property);
          return (
            <button
              key={property}
              type="button"
              role="switch"
              aria-checked={on}
              className={on ? "toggle on" : "toggle"}
              onClick={() => {
                change(setProperty(node.name, property, !on));
              }}
            >
              <span>
                <b>{label}</b>
                <small>{says}</small>
              </span>
              <i />
            </button>
          );
        })}
      </Part>
      <Part title="Runs as">
        <div className="chips">
          {node.models.map((model) => (
            <Chip
              key={model}
              label={model}
              onRemove={() => {
                change(
                  setModels(
                    node.name,
                    node.models.filter((other) => other !== model),
                  ),
                );
              }}
            />
          ))}
          <input
            className="add"
            value={adding}
            placeholder="+ Add"
            onChange={(event) => {
              setAdding(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || adding.trim() === "") return;
              change(setModels(node.name, [...node.models, adding.trim()]));
              setAdding("");
            }}
          />
        </div>
        <p className="hint">An agent profile of yours in Paseo. The first is tried first.</p>
      </Part>
      <Part title="May seat">
        <div className="chips">
          {node.seats.map((seated) => (
            <Chip
              key={seated}
              label={seated}
              onRemove={() => {
                change(wired("spawns", node.id, `role:${seated}`, false));
              }}
            />
          ))}
          {others.length > 0 ? (
            <select
              className="add"
              value=""
              onChange={(event) => {
                change(wired("spawns", node.id, `role:${event.target.value}`, true));
              }}
            >
              <option value="">+ Add</option>
              {others.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </Part>
      <Part title="Talks to">
        <div className="checks">
          {RELATIONS.map((relation) => {
            const on = node.speaks.includes(relation);
            return (
              <label key={relation} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    change(
                      relation === "human"
                        ? wired("human", node.id, "human", !on)
                        : setSpeaks(node.name, relation, !on),
                    );
                  }}
                />
                {SPEAKS[relation]}
              </label>
            );
          })}
        </div>
      </Part>
      <Part title="Tools" says={`${node.shown} shown to it`}>
        {node.groups.map((group) => (
          <details key={group.id} className="group">
            <summary>
              {group.name}
              <small>
                {group.tools.filter((tool) => tool.ticked).length} of {group.tools.length}
              </small>
            </summary>
            <div className="checks">
              {group.tools.map((tool) => (
                <label key={tool.name} className={tool.ticked ? "check mono" : "check mono unticked"}>
                  <input
                    type="checkbox"
                    checked={tool.ticked}
                    onChange={() => {
                      change(setTool(node.name, tool.name, !tool.ticked));
                    }}
                  />
                  {tool.name}
                </label>
              ))}
            </div>
          </details>
        ))}
      </Part>
      <Part title="Reads every turn">
        <p>
          {node.alwaysOn.toLocaleString("en")} words
          {mark ? (
            <span className="hint">
              {" "}
              · {mark.name}&apos;s roles read {mark.least.toLocaleString("en")} to {mark.most.toLocaleString("en")}
            </span>
          ) : null}
        </p>
      </Part>
    </div>
  );
}

function About({
  node,
  template,
  onOpen,
}: {
  node: Exclude<GraphNode, RoleNode>;
  template: Template;
  onOpen: (path: string) => void;
}): ReactNode {
  const { change, give } = useEditing();
  switch (node.kind) {
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
    case "section":
      return (
        <>
          <Line
            label="Name"
            value={node.name}
            onSet={(name) => {
              change(renameSection(node.name, name));
            }}
          />
          <Line
            label="Holds"
            value={node.holds}
            onSet={(holds) => {
              change(setSection(node.name, holds));
            }}
          />
          <p className="hint">
            Every role shown the report tool is given this section with these words, and its lines are read under the
            section&apos;s name. No section is required of a report.
          </p>
        </>
      );
    case "classifier":
      return (
        <>
          <p className="hint">
            The model the questions and the moments are asked of. Whoever runs the team sets a key for one of these
            hosts, and the key goes to no other. Taken away, the template asks no model.
          </p>
          {Object.entries(template.file.classifier ?? {}).map(([name, route]) => (
            <RouteFields
              key={`${name}:${JSON.stringify(route)}`}
              name={name}
              route={route}
              alone={node.routes.length === 1}
            />
          ))}
          <Line
            key={node.routes.length}
            label="Another route, by name"
            value=""
            onSet={(name) => {
              if (name !== "") change(addRoute(name));
            }}
          />
        </>
      );
    case "server": {
      const server = template.file.servers[node.name]!;
      const given = Object.entries(template.file.roles).flatMap(([role, spec]) =>
        spec.servers?.[node.name] ? [{ role, tools: spec.servers[node.name]! }] : [],
      );
      return (
        <>
          <ServerFields
            key={JSON.stringify(server)}
            server={server}
            onSet={(next) => {
              change(setServer(node.name, next));
            }}
          />
          <p className="hint">
            A secret is never written here: name a variable as $NAME and keep the secret on the machine.
            {node.variables.length > 0 ? ` It reads ${node.variables.map((name) => `$${name}`).join(", ")}.` : ""}
          </p>
          {given.length > 0 ? (
            <Part title="Given to">
              {given.map(({ role, tools }) => (
                <div key={role} className="given">
                  <i className="dot kind-role" />
                  <span>
                    <b>{role}</b>
                    <small className="mono">{tools.join(" · ")}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      give(node.name, role);
                    }}
                  >
                    Change
                  </button>
                </div>
              ))}
            </Part>
          ) : null}
        </>
      );
    }
  }
}

/** One place a classifier is served: where a call goes, the model as it is called there, and what fits in one. */
function RouteFields({ name, route, alone }: { name: string; route: Route; alone: boolean }) {
  const { change } = useEditing();
  const set = (next: Partial<Route>) => {
    change(setRoute(name, { ...route, ...next }));
  };
  return (
    <>
      <p className="section">{name}</p>
      <Line
        label="Endpoint"
        value={route.endpoint}
        onSet={(endpoint) => {
          if (endpoint !== "") set({ endpoint });
        }}
      />
      <Line
        label="Model"
        value={route.model}
        onSet={(model) => {
          if (model !== "") set({ model });
        }}
      />
      <Line
        label="Budget, in tokens"
        value={String(route.budget)}
        onSet={(budget) => {
          if (/^[1-9][0-9]*$/.test(budget)) set({ budget: Number(budget) });
        }}
      />
      {alone ? null : (
        <button
          type="button"
          onClick={() => {
            change(removeRoute(name));
          }}
        >
          Take this route away
        </button>
      )}
    </>
  );
}

const listOf = (text: string, by: string | RegExp) =>
  text
    .split(by)
    .map((part) => part.trim())
    .filter((part) => part !== "");
/** `KEY=VALUE` lines as the map they write, and back. */
const pairsOf = (text: string) =>
  Object.fromEntries(
    listOf(text, "\n").flatMap((line) =>
      line.includes("=") ? [[line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]] : [],
    ),
  );
const linesOf = (pairs: Readonly<Record<string, string>>) =>
  Object.entries(pairs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

/** How a server is started or reached, set when the person leaves a field. */
function ServerFields({ server, onSet }: { server: Server; onSet: (server: Server) => void }) {
  const [pairs, setPairs] = useState(linesOf(server.type === "stdio" ? server.env : server.headers));
  const kept = pairsOf(pairs);
  return (
    <>
      <div className="segments">
        {(["stdio", "http", "sse"] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={server.type === type ? "on" : ""}
            onClick={() => {
              if (type === server.type) return;
              onSet(
                type === "stdio"
                  ? { type, command: "_the-command-that-starts-it_", args: [], env: {} }
                  : { type, url: server.type === "stdio" ? "_its-address_" : server.url, headers: kept },
              );
            }}
          >
            {type}
          </button>
        ))}
      </div>
      {server.type === "stdio" ? (
        <Line
          label="Command"
          value={[server.command, ...server.args].join(" ")}
          onSet={(text) => {
            const [command, ...args] = listOf(text, /\s+/);
            if (command !== undefined) onSet({ ...server, command, args });
          }}
        />
      ) : (
        <Line
          label="Address"
          value={server.url}
          onSet={(url) => {
            if (url !== "") onSet({ ...server, url });
          }}
        />
      )}
      <label className="line tall">
        <span>{server.type === "stdio" ? "Environment" : "Headers"}, a line each as NAME=value</span>
        <textarea
          value={pairs}
          rows={3}
          spellCheck={false}
          onChange={(event) => {
            setPairs(event.target.value);
          }}
          onBlur={() => {
            if (pairs === linesOf(server.type === "stdio" ? server.env : server.headers)) return;
            onSet(server.type === "stdio" ? { ...server, env: kept } : { ...server, headers: kept });
          }}
        />
      </label>
    </>
  );
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
