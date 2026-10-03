import { type ReactNode, useState } from "react";
import { Icon } from "./icons.tsx";

/** Asks for one line of text, in the middle of the page, and hands it on or is closed. */
export function AskName({
  title,
  hint,
  start = "",
  onName,
  onClose,
}: {
  title: string;
  hint: string;
  start?: string;
  onName: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(start);
  return (
    <div className="veil" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== "") onName(name.trim());
        }}
      >
        <h2>{title}</h2>
        <input
          autoFocus
          value={name}
          placeholder={hint}
          onChange={(event) => {
            setName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        />
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Done
          </button>
        </footer>
      </form>
    </div>
  );
}

type PickToolsProps = {
  readonly title: string;
  /** The tools the template knows of the server. */
  readonly known: readonly string[];
  /** Those the role may call now. */
  readonly given: readonly string[];
  readonly onTools: (tools: string[]) => void;
  readonly onClose: () => void;
};

/** Asks which of an outside server's tools a role may call: those the template knows to tick, and a name to add. */
export function PickTools({ title, known, given, onTools, onClose }: PickToolsProps) {
  const [names, setNames] = useState(known);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set(given));
  const [adding, setAdding] = useState("");
  const typed = adding.trim();
  /** What is ticked, with a name typed and not yet added: a person who typed one means it. */
  const picked = [
    ...names.filter((name) => ticked.has(name)),
    ...(typed === "" || names.includes(typed) ? [] : [typed]),
  ];
  const add = () => {
    if (!names.includes(typed)) setNames([...names, typed]);
    setTicked(new Set([...ticked, typed]));
    setAdding("");
  };
  return (
    <div className="veil" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          onTools(picked);
        }}
      >
        <h2>{title}</h2>
        {names.length > 0 ? (
          <div className="ticks">
            {names.map((name) => (
              <label key={name} className={ticked.has(name) ? "check mono" : "check mono unticked"}>
                <input
                  type="checkbox"
                  checked={ticked.has(name)}
                  onChange={() => {
                    const next = new Set(ticked);
                    if (!next.delete(name)) next.add(name);
                    setTicked(next);
                  }}
                />
                {name}
              </label>
            ))}
          </div>
        ) : (
          <p className="hint">The template names no tool of it yet. Name the first as the server calls it.</p>
        )}
        <div className="adding">
          <input
            autoFocus
            value={adding}
            placeholder="A tool, by the name the server gives it"
            spellCheck={false}
            onChange={(event) => {
              setAdding(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key !== "Enter" || typed === "") return;
              event.preventDefault();
              add();
            }}
          />
          <button type="button" disabled={typed === ""} onClick={add}>
            Add
          </button>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {picked.length === 0 ? "Give none" : `Give ${picked.length}`}
          </button>
        </footer>
      </form>
    </div>
  );
}

type Choice = { readonly key: string; readonly label: ReactNode; readonly pick: () => void };

/** What a wire let go over empty canvas may go to: the nodes that take it, found by name, and a new one. */
export function PickNode({
  at,
  choices,
  onClose,
}: {
  at: { readonly x: number; readonly y: number };
  choices: readonly (Choice & { readonly name: string })[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const found = choices.filter((choice) => choice.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="veil clear" onMouseDown={onClose}>
      <div
        className="menu search-menu"
        style={{ left: at.x, top: at.y }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <label className="search">
          <Icon name="search" />
          <input
            autoFocus
            placeholder="Search…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter") found[0]?.pick();
            }}
          />
        </label>
        <ul>
          {found.map((choice) => (
            <li key={choice.key}>
              <button type="button" onClick={choice.pick}>
                {choice.label}
              </button>
            </li>
          ))}
          {found.length === 0 ? <li className="hint">Nothing takes this wire.</li> : null}
        </ul>
      </div>
    </div>
  );
}
