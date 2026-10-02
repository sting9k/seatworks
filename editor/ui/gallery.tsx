import { readTemplate, type Template, type TemplateFiles } from "../template/read-template.ts";

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
      <h1>Templates</h1>
      <p className="lede">A way of working for a team of agents. Open one to see how it is put together.</p>
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
              <h2>{about.name}</h2>
              <p>{about.description}</p>
              <p className="facts">
                {profile.roles.size} roles · {skills.size} skills
              </p>
              <footer>
                <span>
                  {about.tags.map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(read.template);
                  }}
                >
                  Open
                </button>
              </footer>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
