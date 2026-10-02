import type { TemplateFiles } from "../template/read-template.ts";

/** The template's files, and the text of the one that is open. */
export function FilePanel({
  files,
  open,
  onOpen,
}: {
  files: TemplateFiles;
  open: string | null;
  onOpen: (path: string) => void;
}) {
  const paths = [...files.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return (
    <aside className="files">
      <h2>Files</h2>
      <ul className="tree">
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
      {open === null ? (
        <p className="hint">Pick a node or a file to read it.</p>
      ) : (
        <>
          <h3>{open}</h3>
          <pre>{files.get(open)}</pre>
        </>
      )}
    </aside>
  );
}

/** Files at the template's top come before those in its folders. */
const depth = (path: string) => (path.includes("/") ? 1 : 0);
