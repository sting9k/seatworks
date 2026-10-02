import { useEffect, useMemo, useState } from "react";
import { TEMPLATES } from "../gallery/templates.ts";
import { readTemplate, type TemplateFiles } from "../template/read-template.ts";
import { Gallery } from "./gallery.tsx";
import { GraphView } from "./graph-view.tsx";

/** The gallery, or the one template open: its files are what is kept, and everything shown is read from them. */
export function App() {
  const [files, setFiles] = useState<TemplateFiles | null>(null);
  const [exported, setExported] = useState<TemplateFiles | null>(null);
  const read = useMemo(() => (files ? readTemplate(files) : null), [files]);
  const changed = files !== exported;

  // A change lives only in this page until it is exported, so leaving the page with one asks first.
  useEffect(() => {
    if (!changed) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", ask);
    return () => {
      window.removeEventListener("beforeunload", ask);
    };
  }, [changed]);

  const open = (opened: TemplateFiles | null) => {
    setFiles(opened);
    setExported(opened);
  };
  return read?.ok ? (
    <GraphView
      template={read.template}
      changed={changed}
      onChange={setFiles}
      onExported={() => {
        setExported(files);
      }}
      onBack={() => {
        if (!changed || window.confirm("Leave this template? What you changed has not been exported and will be lost."))
          open(null);
      }}
    />
  ) : (
    <Gallery templates={TEMPLATES} onOpen={open} />
  );
}
