const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
const box = "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";

const PATHS = {
  team: "M9 3h6v6H9zM3 16h6v5H3zM15 16h6v5h-6zM12 9v4M6 16v-3h12v3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  panelLeft: `${box}M9 4v16`,
  panelRight: `${box}M15 4v16`,
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  search: `${circle(11, 11, 7)}M20 20l-3.6-3.6`,
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  info: `${circle(12, 12, 9)}M12 11v5M12 8h.01`,
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  user: `${circle(12, 8, 4)}M5 21a7 7 0 0 1 14 0`,
  copy: "M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15V6a2 2 0 0 1 2-2h9",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  tidy: "M4 5h7v6H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 13h7v6H4z",
} as const;

/** One line icon of the editor's own, drawn with the colour of the text around it. */
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
