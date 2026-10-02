import { z } from "zod";
import type { TemplateFiles } from "./read-template.ts";

const PATH = "template.json";

/** A step of the team's flow: what happens in it, the role that does it, and the steps the work goes to next. */
const StepSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    text: z.string(),
    role: z.string().nullable(),
    then: z.array(z.string()),
  })
  .strict();
export type Step = z.infer<typeof StepSchema>;

/** `template.json`: what the gallery shows of a template, and what the editor alone keeps of it (TEMPLATE.md). */
export const AboutSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    editor: z
      .object({
        positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() }).strict()).default({}),
        steps: z.array(StepSchema).default([]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type About = z.infer<typeof AboutSchema>;

export type Point = { readonly x: number; readonly y: number };

/** The template with `template.json` changed; no other file of it changes. */
export function withAbout(files: TemplateFiles, change: (about: About) => About): TemplateFiles {
  const next = change(AboutSchema.parse(JSON.parse(files.get(PATH)!)));
  return new Map(files).set(PATH, `${JSON.stringify(next, null, 2)}\n`);
}

/** The template with what the editor alone keeps of it changed. */
export const withEditor = (
  files: TemplateFiles,
  change: (kept: NonNullable<About["editor"]>) => NonNullable<About["editor"]>,
): TemplateFiles =>
  withAbout(files, (about) => ({ ...about, editor: change(about.editor ?? { positions: {}, steps: [] }) }));

/** The template with each node kept where it was put. */
export function positioned(files: TemplateFiles, positions: ReadonlyMap<string, Point>): TemplateFiles {
  const kept = Object.fromEntries(
    [...positions]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, at]) => [id, { x: Math.round(at.x), y: Math.round(at.y) }]),
  );
  return withEditor(files, (editor) => ({ ...editor, positions: kept }));
}
