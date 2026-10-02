import { graphOf } from "../template/graph.ts";
import { readTemplate, type Template, type TemplateFiles } from "../template/read-template.ts";
import { Cover } from "./cover.tsx";

/** Every template on offer; one that does not load says why in place of its card's words. */
export function Gallery({
  templates,
  onOpen,
}: {
  templates: readonly TemplateFiles[];
  onOpen: (template: Template) => void;
}) {
  return (
    <main className="gallery">
      <header>
        <p className="eyebrow">Seatworks</p>
        <h1>Templates</h1>
        <p className="lede">
          {templates.length === 1 ? "1 way of working" : `${templates.length} ways of working`} for a team of agents
        </p>
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
                    onOpen(read.template);
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
