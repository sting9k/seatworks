import { useState } from "react";
import { unpacked } from "../../shared/contracts/template.ts";
import type { Listed } from "../template/gallery.ts";
import { graphOf } from "../template/graph.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Cover } from "./cover.tsx";
import { filesOfFolder } from "./files.ts";

/** The gallery's templates, or why there are none to show. */
export type Shown = { readonly templates: readonly Listed[] } | { readonly says: string };

/**
 * Every template of the gallery built beside the page, and the way in for one of the person's own. A template that
 * does not load says why on its card, and the page says why when there is no gallery to show.
 */
export function Gallery({
  gallery,
  onOpen,
}: {
  /** Null while the gallery is fetched. */
  gallery: Shown | null;
  onOpen: (files: TemplateFiles) => void;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const listed = gallery && "templates" in gallery ? gallery.templates : [];
  const open = (files: TemplateFiles) => {
    const read = readTemplate(files);
    if (read.ok) onOpen(files);
    else setRefused(read.says);
  };
  return (
    <main className="gallery">
      <header>
        <h1>Templates</h1>
        <p className="lede">
          {gallery === null
            ? "Reading the gallery"
            : "says" in gallery
              ? `The gallery could not be shown: ${gallery.says}.`
              : `${listed.length === 1 ? "1 way of working" : `${listed.length} ways of working`} for a team of agents`}
        </p>
        <div className="ways-in">
          <label className="way-in">
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
          <label className="way-in">
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
        {refused === null ? null : <p className="refused">It did not open: {refused}</p>}
      </header>
      <ul className="cards">
        {listed.map((template) => {
          const read = template.ok ? readTemplate(template.files) : template;
          if (!read.ok)
            return (
              <li key={template.entry.id} className="card broken">
                <h2>{template.entry.name}</h2>
                <p>It does not open: {read.says}</p>
              </li>
            );
          const { about, profile, skills, files } = read.template;
          return (
            <li key={template.entry.id} className="card">
              <div className="picture">
                <Cover graph={graphOf(read.template)} />
                <h2>{about.name}</h2>
              </div>
              <div className="row">
                <span className="facts">
                  {profile.roles.size} roles · {skills.size} skills
                </span>
                <button
                  type="button"
                  className="cta"
                  onClick={() => {
                    onOpen(files);
                  }}
                >
                  Open
                </button>
              </div>
              <p>{about.description}</p>
              <div className="tags">
                {about.tags.map((tag) => (
                  <span key={tag} className="chip">
                    {tag}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
