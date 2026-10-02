import { useEffect, useMemo, useState } from "react";
import { loadGallery } from "../template/gallery.ts";
import { graphOf } from "../template/graph.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Gallery, type Shown } from "./gallery.tsx";
import { Icon } from "./icons.tsx";
import { Workspace } from "./workspace.tsx";

/** A template open in a tab: its files, and the ones before each change to go back to, until it is exported. */
type Tab = {
  readonly id: number;
  readonly past: readonly TemplateFiles[];
  readonly files: TemplateFiles;
  readonly future: readonly TemplateFiles[];
  readonly exported: TemplateFiles;
  readonly opened: TemplateFiles;
};

const changedIn = (tab: Tab) => tab.files !== tab.exported;

/** The gallery built beside the page, fetched from where the page itself is served. */
const fetched = async (file: string) => {
  const answer = await fetch(new URL(`gallery/${file}`, document.baseURI));
  return answer.ok ? answer.text() : null;
};
/** The shipped template's name in the gallery: the mark another template's always-on words are set beside. */
const MARKED = "slp";

/** The gallery and the templates open beside it, each in a tab. */
export function App() {
  const [tabs, setTabs] = useState<readonly Tab[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [opened, setOpened] = useState(0);
  const [gallery, setGallery] = useState<Shown | null>(null);
  useEffect(() => {
    void loadGallery(fetched).then(
      (read) => {
        setGallery(read.ok ? { templates: read.templates } : { says: read.says });
      },
      (failed: unknown) => {
        setGallery({ says: failed instanceof Error ? failed.message : String(failed) });
      },
    );
  }, []);
  const mark = useMemo(() => {
    const shipped =
      gallery && "templates" in gallery ? gallery.templates.find((listed) => listed.entry.id === MARKED) : undefined;
    const read = shipped?.ok ? readTemplate(shipped.files) : null;
    if (!read?.ok) return null;
    const words = graphOf(read.template).nodes.flatMap((node) => (node.kind === "role" ? [node.alwaysOn] : []));
    return { name: read.template.about.name, least: Math.min(...words), most: Math.max(...words) };
  }, [gallery]);
  const tab = tabs.find((candidate) => candidate.id === active) ?? null;
  const update = (id: number, change: (tab: Tab) => Tab) => {
    setTabs((all) => all.map((other) => (other.id === id ? change(other) : other)));
  };
  const undo = (id: number) => {
    update(id, (was) => {
      const back = was.past.at(-1);
      return back ? { ...was, past: was.past.slice(0, -1), files: back, future: [was.files, ...was.future] } : was;
    });
  };
  const redo = (id: number) => {
    update(id, (was) => {
      const [again, ...rest] = was.future;
      return again ? { ...was, past: [...was.past, was.files], files: again, future: rest } : was;
    });
  };
  const close = (closing: Tab) => {
    if (changedIn(closing) && !window.confirm("Close this template? What you changed has not been exported.")) return;
    setTabs((all) => all.filter((other) => other.id !== closing.id));
    if (active === closing.id) setActive(null);
  };

  // A change lives only in this page until it is exported, so leaving the page with one asks first.
  const anyChanged = tabs.some(changedIn);
  useEffect(() => {
    if (!anyChanged) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", ask);
    return () => {
      window.removeEventListener("beforeunload", ask);
    };
  }, [anyChanged]);

  // Undo and redo by the keys a person expects; in a field they are left to the field.
  useEffect(() => {
    if (active === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (event.shiftKey) redo(active);
      else undo(active);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const read = tab ? readTemplate(tab.files) : null;
  return (
    <div className="app">
      <nav className="tabstrip">
        <button
          type="button"
          className={active === null ? "tab on" : "tab"}
          onClick={() => {
            setActive(null);
          }}
        >
          <Icon name="grid" />
          Templates
        </button>
        {tabs.map((other) => {
          const about = readTemplate(other.files);
          return (
            <span key={other.id} className={other.id === active ? "tab on" : "tab"}>
              <button
                type="button"
                onClick={() => {
                  setActive(other.id);
                }}
              >
                {changedIn(other) ? <i className="unsaved" /> : null}
                {about.ok ? about.template.about.name : "A template"}
              </button>
              <button
                type="button"
                className="close"
                title="Close"
                onClick={() => {
                  close(other);
                }}
              >
                <Icon name="close" />
              </button>
            </span>
          );
        })}
      </nav>
      {tab && read?.ok ? (
        <Workspace
          key={tab.id}
          template={read.template}
          mark={mark}
          opened={tab.opened}
          changed={changedIn(tab)}
          canUndo={tab.past.length > 0}
          canRedo={tab.future.length > 0}
          onChange={(files) => {
            update(tab.id, (was) => ({ ...was, past: [...was.past, was.files], files, future: [] }));
          }}
          onUndo={() => {
            undo(tab.id);
          }}
          onRedo={() => {
            redo(tab.id);
          }}
          onExported={() => {
            update(tab.id, (was) => ({ ...was, exported: was.files }));
          }}
          onClose={() => {
            close(tab);
          }}
        />
      ) : (
        <Gallery
          gallery={gallery}
          onOpen={(files) => {
            setTabs((all) => [...all, { id: opened, past: [], files, future: [], exported: files, opened: files }]);
            setActive(opened);
            setOpened(opened + 1);
          }}
        />
      )}
    </div>
  );
}
