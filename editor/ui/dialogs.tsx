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
