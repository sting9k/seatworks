import { useState } from "react";
import { graphOf } from "../template/graph.ts";
import { unpacked } from "../template/pack.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Cover } from "./cover.tsx";
import { filesOfFolder } from "./files.ts";

/** Every template on offer, and the way in for one of the person's own; one that does not load says why. */
export function Gallery({
  templates,
  onOpen,
}: {
  templates: readonly TemplateFiles[];
  onOpen: (files: TemplateFiles) => void;
}) {
  const [refused, setRefused] = useState<string | null>(null);
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
          {templates.length === 1 ? "1 way of working" : `${templates.length} ways of working`} for a team of agents
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
        {templates.map((files, index) => {
          const read = readTemplate(files);
          if (!read.ok)
            return (
              <li key={index} className="card broken">
                <h2>A template that does not open</h2>
                <p>{read.says}</p>
              </li>
            );
          const { about, profile, skills } = read.template;
          return (
            <li key={index} className="card">
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
