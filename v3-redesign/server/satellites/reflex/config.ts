import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/** A typed question as the profile writes it (REFLEX.md, Questions are data); keys it does not use pass through. */
const QuestionSchema = z
  .object({
    on: z.array(z.string()).optional(),
    when: z.record(z.string(), z.unknown()).optional(),
    state: z.record(z.string(), z.string()).optional(),
    noul: z.string().optional(),
    choice: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    yes: z.string().optional(),
    no: z.string().optional(),
    tell: z.number().min(0).max(1).optional(),
    consider: z.number().min(0).max(1).optional(),
    for: z.object({ wording: z.string(), model: z.string() }).optional(),
    tells: z.string().optional(),
    wakes: z.boolean().optional(),
    watches: z.array(z.string()).optional(),
    reads: z.array(z.string()).optional(),
    by: z.literal("code").optional(),
  })
  .loose();
export type QuestionSpec = z.infer<typeof QuestionSchema>;

const RouteSchema = z.object({
  endpoint: z.url(),
  model: z.string(),
  budget: z.number().int().positive(),
  body: z.record(z.string(), z.unknown()).optional(),
});
export type Route = z.infer<typeof RouteSchema>;

const ReflexFileSchema = z
  .object({
    active: z.array(z.string()).default([]),
    routes: z.record(z.string(), RouteSchema),
    mask: z.array(z.string()).default([]),
    environment: z.array(z.string()).default([]),
    questions: z.record(z.string(), QuestionSchema).default({}),
  })
  .loose();

const WatchFileSchema = z
  .object({
    active: z.array(z.string()).default([]),
    item: z.object({ chars: z.number().int().positive(), everyItems: z.number().int().positive() }).loose(),
    facts: z
      .object({
        repeats: z.number().int().positive(),
        repeatsTold: z.number().int().positive(),
        testPath: z.string().optional(),
      })
      .loose(),
    moments: z.record(z.string(), QuestionSchema).default({}),
  })
  .loose();

export type ReflexConfig = {
  readonly routes: Readonly<Record<string, Route>>;
  readonly mask: readonly RegExp[];
  readonly questions: ReadonlyMap<string, QuestionSpec>;
  readonly moments: ReadonlyMap<string, QuestionSpec>;
  readonly itemChars: number;
  readonly repeats: number;
  readonly repeatsTold: number;
  readonly testPath: RegExp | null;
};

/** The profile's active questions and moments; one not in its file's `active` list is written but not asked. */
export function loadReflex(dir: string): ReflexConfig | null {
  const reflexFile = join(dir, "reflex.yaml");
  if (!existsSync(reflexFile)) return null;
  const reflex = ReflexFileSchema.parse(parse(readFileSync(reflexFile, "utf8")));
  const watchFile = join(dir, "watch.yaml");
  const watch = existsSync(watchFile) ? WatchFileSchema.parse(parse(readFileSync(watchFile, "utf8"))) : null;
  const pick = (all: Record<string, QuestionSpec>, active: readonly string[]) =>
    new Map(active.flatMap((name) => (all[name] ? [[name, all[name]] as const] : [])));
  return {
    routes: reflex.routes,
    mask: reflex.mask.map((p) => new RegExp(p, "g")),
    questions: pick(reflex.questions, reflex.active),
    moments: watch ? pick(watch.moments, watch.active) : new Map(),
    itemChars: watch?.item.chars ?? 1500,
    repeats: watch?.facts.repeats ?? 3,
    repeatsTold: watch?.facts.repeatsTold ?? 5,
    testPath: watch?.facts.testPath ? new RegExp(watch.facts.testPath) : null,
  };
}

/** The hash a threshold is earned for: the question's words and every outcome's description. */
export function wordingOf(q: QuestionSpec): string {
  const words = [q.noul ?? q.choice ?? "", q.yes ?? "", q.no ?? "", JSON.stringify(q.labels ?? {})].join("\n");
  return createHash("sha256").update(words).digest("hex").slice(0, 16);
}
