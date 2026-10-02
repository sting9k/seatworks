import { z } from "zod";
import type { TemplateFiles } from "./read-template.ts";

const PATH = "template.json";

/** `template.json`: what the gallery shows of a template, and what the editor alone keeps of it (TEMPLATE.md). */
export const AboutSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    editor: z
      .object({ positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() }).strict()) })
      .strict()
      .optional(),
  })
  .strict();
export type About = z.infer<typeof AboutSchema>;

export type Point = { readonly x: number; readonly y: number };

/** The template with each node kept where it was put; no other file of it changes. */
export function positioned(files: TemplateFiles, about: About, positions: ReadonlyMap<string, Point>): TemplateFiles {
  const kept = Object.fromEntries(
    [...positions]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, at]) => [id, { x: Math.round(at.x), y: Math.round(at.y) }]),
  );
  const next: About = { ...about, editor: { positions: kept } };
  return new Map(files).set(PATH, `${JSON.stringify(next, null, 2)}\n`);
}
