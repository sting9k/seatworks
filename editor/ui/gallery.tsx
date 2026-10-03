import { useState } from "react";
import { unpacked } from "../../shared/contracts/template.ts";
import { blankTemplate } from "../template/blank.ts";
import type { Listed } from "../template/gallery.ts";
import { graphOf } from "../template/graph.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Cover } from "./cover.tsx";
import { AskName } from "./dialogs.tsx";
import { filesOfFolder } from "./files.ts";
import { Icon } from "./icons.tsx";
import { plural } from "./words.ts";

/** The gallery's templates, or why there are none to show. */
export type Shown = { readonly templates: readonly Listed[] } | { readonly says: string };

/** A template open in the page that is the person's own: opened from a file or a folder, or started new. */
export type Mine = { readonly id: number; readonly files: TemplateFiles };

/** Where a template is from: the gallery says of its own, and what the person has open is theirs. */
type Source = Listed["entry"]["source"] | "yours";
const SOURCES: readonly { readonly id: Source; readonly all: string; readonly one: string }[] = [
  { id: "seatworks", all: "Comes with Seatworks", one: "comes with Seatworks" },
  { id: "shared", all: "Shared", one: "shared" },
  { id: "yours", all: "Yours", one: "yours" },
];

type Card = {
  readonly key: string;
  readonly name: string;
  readonly source: Source;
  readonly read: ReturnType<typeof readTemplate>;
  readonly open: () => void;
};

type Props = {
  /** Null while the gallery is fetched. */
  readonly gallery: Shown | null;
  readonly mine: readonly Mine[];
  /** Opens a template in a tab: the gallery's, the person's own, or one just started and never exported. */
  readonly onOpen: (files: TemplateFiles, from: "gallery" | "own" | "new") => void;
  /** Goes to the tab one of the person's own is open in. */
  readonly onShow: (id: number) => void;
};

/** Every template of the gallery beside the page and the person's own, found by their words, and the ways in. */
export function Gallery({ gallery, mine, onOpen, onShow }: Props) {
  const [refused, setRefused] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [naming, setNaming] = useState(false);
  const listed = gallery && "templates" in gallery ? gallery.templates : [];
  const open = (files: TemplateFiles) => {
    const read = readTemplate(files);
    if (read.ok) onOpen(files, "own");
    else setRefused(`It did not open: ${read.says}`);
  };
  const cards: readonly Card[] = [
    ...listed.map((template): Card => ({
      key: template.entry.id,
      name: template.entry.name,
      source: template.entry.source,
      read: template.ok ? readTemplate(template.files) : template,
      open: () => {
        if (template.ok) onOpen(template.files, "gallery");
      },
    })),
    ...mine.map(({ id, files }): Card => ({
      key: `yours:${id}`,
      name: "A template of yours",
      source: "yours",
      read: readTemplate(files),
      open: () => {
        onShow(id);
      },
    })),
  ];
  const tags = [...new Set(cards.flatMap(({ read }) => (read.ok ? read.template.about.tags : [])))].sort();
  const sources = SOURCES.filter(({ id }) => cards.some((card) => card.source === id));
  const wanted = query.trim().toLowerCase();
  const found = cards.filter((card) => {
    if (source !== null && card.source !== source) return false;
    if (!card.read.ok) return wanted === "" && tag === null;
    const { about, profile } = card.read.template;
    if (tag !== null && !about.tags.includes(tag)) return false;
    return [card.name, about.name, about.description, ...about.tags, ...profile.roles.keys()].some((word) =>
      word.toLowerCase().includes(wanted),
    );
  });
  /** Starting anew is offered where nothing is being looked for, and among one's own. */
  const starting = wanted === "" && tag === null && (source === null || source === "yours");
  return (
    <main className="gallery">
      <header>
        <div>
          <h1>Templates</h1>
          <p className="lede">
            {gallery === null
              ? "Reading the gallery"
              : "says" in gallery
                ? `The gallery could not be shown: ${gallery.says}.`
                : "A template is a way of working for a team of agents. Open one to see it as a graph, change it, and take it away as one file."}
          </p>
        </div>
        <div className="ways-in">
          <label className="pill-button">
            Open a file
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const opened = unpacked(text);
                  if (opened.ok) open(opened.files);
                  else setRefused(`It did not open: ${opened.says}`);
                });
              }}
            />
          </label>
          <label className="pill-button">
            Open a folder
            <input
              type="file"
              // A folder is picked through an attribute React's types do not carry.
              {...{ webkitdirectory: "" }}
              onChange={(event) => {
                if (event.target.files) void filesOfFolder(event.target.files).then(open);
              }}
            />
          </label>
          <button
            type="button"
            className="pill-button signal"
            onClick={() => {
              setNaming(true);
            }}
          >
            <Icon name="plus" />
            New template
          </button>
        </div>
      </header>
      {refused === null ? null : <p className="refused">{refused}</p>}
      <label className="search big">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search templates, roles, tags"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      <div className="filters">
        {sources.length > 1 ? (
          <div className="segments">
            <button
              type="button"
              className={source === null ? "on" : ""}
              onClick={() => {
                setSource(null);
              }}
            >
              All · {cards.length}
            </button>
            {sources.map(({ id, all }) => (
              <button
                key={id}
                type="button"
                className={source === id ? "on" : ""}
                onClick={() => {
                  setSource(id);
                }}
              >
                {all} · {cards.filter((card) => card.source === id).length}
              </button>
            ))}
          </div>
        ) : null}
        <div className="tags">
          {tags.map((name) => (
            <button
              key={name}
              type="button"
              className={tag === name ? "tag on" : "tag"}
              aria-pressed={tag === name}
              onClick={() => {
                setTag(tag === name ? null : name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <ul className="cards">
        {found.map((card) => {
          if (!card.read.ok)
            return (
              <li key={card.key} className="card broken">
                <h2>{card.name}</h2>
                <p>It does not open: {card.read.says}</p>
              </li>
            );
          const { about, profile, skills, questions, moments } = card.read.template;
          return (
            <li key={card.key} className="card">
              <div className="picture">
                <span className="from">{SOURCES.find(({ id }) => id === card.source)!.one}</span>
                <Cover graph={graphOf(card.read.template)} />
              </div>
              <div className="words">
                <h2>{about.name}</h2>
                <p>{about.description}</p>
                <p className="facts">
                  {plural(profile.roles.size, "role")} · {plural(skills.size, "skill")} ·{" "}
                  {plural(questions.length, "question")} · {plural(moments.length, "moment")}
                </p>
                <div className="row">
                  <div className="tags">
                    {about.tags.map((name) => (
                      <span key={name} className="tag">
                        {name}
                      </span>
                    ))}
                  </div>
                  <button type="button" className="signal" onClick={card.open}>
                    Open
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {starting ? (
          <li>
            <button
              type="button"
              className="card start"
              onClick={() => {
                setNaming(true);
              }}
            >
              <i>
                <Icon name="plus" />
              </i>
              <b>Start from nothing</b>
              <span>One role, the Human, and nothing else. Add to it as you go.</span>
            </button>
          </li>
        ) : null}
      </ul>
      {gallery !== null && found.length === 0 && !starting ? <p className="lede">No template matches.</p> : null}
      {naming ? (
        <AskName
          title="Name the new template"
          hint="its name in the gallery"
          onClose={() => {
            setNaming(false);
          }}
          onName={(name) => {
            setNaming(false);
            const made = blankTemplate(name);
            if (made.ok) onOpen(made.files, "new");
            else setRefused(`It was not started: ${made.says}`);
          }}
        />
      ) : null}
    </main>
  );
}
