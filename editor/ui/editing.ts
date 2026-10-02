import { createContext, useContext } from "react";
import type { Edit } from "../template/edits.ts";
import type { Note } from "../template/checks.ts";
import type { GraphNode } from "../template/graph.ts";

/** What a node on the canvas may ask of the template it is drawn from. */
export type Editing = {
  /** Makes a change, or says why it was not made. */
  readonly change: (edit: Edit) => void;
  /** Takes a node away, when it is of a kind a person may take away. */
  readonly remove: (node: GraphNode) => void;
  readonly duplicate: (node: GraphNode) => void;
  readonly showAbout: (node: GraphNode) => void;
};

export const EditingContext = createContext<Editing | null>(null);

export function useEditing(): Editing {
  const editing = useContext(EditingContext);
  if (!editing) throw new Error("a node was drawn outside a template being edited");
  return editing;
}

/** The notes on the template being edited, for a node to show how many are about it. */
export const NotesContext = createContext<readonly Note[]>([]);
export const useNotes = (node: string) => useContext(NotesContext).filter((note) => note.node === node);

/** The kinds of node a person adds and takes away; the others are fixed parts of every template. */
export const MAKEABLE = ["role", "skill", "step", "question", "moment"] as const;
export type Makeable = (typeof MAKEABLE)[number];
export const isMakeable = (kind: string): kind is Makeable => (MAKEABLE as readonly string[]).includes(kind);
