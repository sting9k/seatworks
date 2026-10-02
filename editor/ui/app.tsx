import { useState } from "react";
import { TEMPLATES } from "../gallery/templates.ts";
import type { Template } from "../template/read-template.ts";
import { Gallery } from "./gallery.tsx";
import { GraphView } from "./graph-view.tsx";

/** The gallery, or the one template picked from it. */
export function App() {
  const [opened, setOpened] = useState<Template | null>(null);
  return opened ? (
    <GraphView
      template={opened}
      onBack={() => {
        setOpened(null);
      }}
    />
  ) : (
    <Gallery templates={TEMPLATES} onOpen={setOpened} />
  );
}
