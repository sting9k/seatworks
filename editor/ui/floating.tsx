import { useReactFlow, useViewport } from "@xyflow/react";
import { type ReactNode, useState } from "react";
import { Icon } from "./icons.tsx";

/** How a graph is fitted to the canvas: clear of the bars that float over it, and never larger than it is drawn. */
export const FITTED = { padding: { x: "32px", y: "76px" }, maxZoom: 1 } as const;

/** A button that opens a list of things to do under it, and closes when one is done or the page is clicked. */
export function Menu({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-root">
      <button
        type="button"
        className={open ? "tool on" : "tool"}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {label}
        <Icon name="chevronDown" />
      </button>
      {open ? (
        <>
          <div
            className="veil clear"
            onMouseDown={() => {
              setOpen(false);
            }}
          />
          <div
            className="menu"
            onClick={() => {
              setOpen(false);
            }}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** How much of the graph is in view, and the ways to see more or less of it. */
export function ZoomTools({ map, onMap }: { map: boolean; onMap: () => void }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="bar float bottom right">
      <button
        type="button"
        className="tool"
        title="Fit the graph"
        onClick={() => {
          void flow.fitView({ ...FITTED, duration: 250 });
        }}
      >
        <Icon name="fit" />
      </button>
      <Menu label={`${Math.round(zoom * 100)}%`}>
        <button
          type="button"
          onClick={() => {
            void flow.zoomIn({ duration: 150 });
          }}
        >
          Zoom in
        </button>
        <button
          type="button"
          onClick={() => {
            void flow.zoomOut({ duration: 150 });
          }}
        >
          Zoom out
        </button>
        <button
          type="button"
          onClick={() => {
            void flow.zoomTo(1, { duration: 150 });
          }}
        >
          100%
        </button>
      </Menu>
      <button type="button" className={map ? "tool on" : "tool"} title="The small map" onClick={onMap}>
        <Icon name="map" />
      </button>
    </div>
  );
}
