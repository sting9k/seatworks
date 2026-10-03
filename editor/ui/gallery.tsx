import { useState } from "react";
import { unpacked } from "../../shared/contracts/template.ts";
import type { Listed } from "../template/gallery.ts";
import { graphOf } from "../template/graph.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Cover } from "./cover.tsx";
import { filesOfFolder } from "./files.ts";
import { Icon } from "./icons.tsx";
import { plural } from "./words.ts";

/** The gallery's templates, or why there are none to show. */
export type Shown = { readonly templates: readonly Listed[] } | { readonly says: string };

type Props = {
  /** Null while the gallery is fetched. */
  readonly gallery: Shown | null;
  readonly onOpen: (files: TemplateFiles) => void;
};

/** Every template of the gallery beside the page, found by its words, and the way in for one's own. */
export function Gallery({ gallery, onOpen }: Props) {
  const [refused, setRefused] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const listed = gallery && "templates" in gallery ? gallery.templates : [];
  const open = (files: TemplateFiles) => {
    const read = readTemplate(files);
    if (read.ok) onOpen(files);
    else setRefused(read.says);
  };
  const cards = listed.map((template) => ({
    template,
    read: template.ok ? readTemplate(template.files) : template,
  }));
  const tags = [...new Set(cards.flatMap(({ read }) => (read.ok ? read.template.about.tags : [])))].sort();
  const wanted = query.trim().toLowerCase();
  const found = cards.filter(({ template, read }) => {
    if (!read.ok) return wanted === "" && tag === null;
    const { about, profile } = read.template;
    if (tag !== null && !about.tags.includes(tag)) return false;
    const words = [template.entry.name, about.name, about.description, ...about.tags, ...profile.roles.keys()];
    return words.some((word) => word.toLowerCase().includes(wanted));
  });
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
                  else setRefused(opened.says);
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
        </div>
      </header>
      {refused === null ? null : <p className="refused">It did not open: {refused}</p>}
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
      {tags.length > 0 ? (
        <div className="filters">
          <button
            type="button"
            className={tag === null ? "segment on" : "segment"}
            onClick={() => {
              setTag(null);
            }}
          >
            All · {listed.length}
          </button>
          {tags.map((name) => (
            <button
              key={name}
              type="button"
              className={tag === name ? "segment on" : "segment"}
              onClick={() => {
                setTag(tag === name ? null : name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="cards">
        {found.map(({ template, read }) => {
          if (!read.ok)
            return (
              <li key={template.entry.id} className="card broken">
                <h2>{template.entry.name}</h2>
                <p>It does not open: {read.says}</p>
              </li>
            );
          const { about, profile, skills, questions, moments, files } = read.template;
          return (
            <li key={template.entry.id} className="card">
              <div className="picture">
                <Cover graph={graphOf(read.template)} />
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
                  <button
                    type="button"
                    className="signal"
                    onClick={() => {
                      onOpen(files);
                    }}
                  >
                    Open
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {gallery !== null && found.length === 0 ? <p className="lede">No template matches.</p> : null}
    </main>
  );
}
