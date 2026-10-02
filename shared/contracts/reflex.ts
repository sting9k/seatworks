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
    /** A hand-back question asked hunk by hunk, of the test files or of the rest. */
    hunks: z.enum(["test", "product"]).optional(),
    /** The labels of a choice whose summed probability is weighed against the thresholds; the first by default. */
    matters: z.array(z.string()).optional(),
    /** A choice weighed on every label but the one the record already gives, such as the brief's kind. */
    against: z.string().optional(),
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

/** `reflex.yaml`: the questions asked of the record's events, and the routes they are sent by. */
export const ReflexFileSchema = z
  .object({
    active: z.array(z.string()).default([]),
    routes: z.record(z.string(), RouteSchema),
    mask: z.array(z.string()).default([]),
    environment: z.array(z.string()).default([]),
    questions: z.record(z.string(), QuestionSchema).default({}),
  })
  .loose();

/** `watch.yaml`: the moments, and what the eye counts in code. */
export const WatchFileSchema = z
  .object({
    active: z.array(z.string()).default([]),
    item: z.object({ chars: z.number().int().positive(), everyItems: z.number().int().positive() }).loose(),
    sweep: z
      .object({ everyChars: z.number().int().positive(), digestChars: z.number().int().positive().max(19_000) })
      .optional(),
    facts: z
      .object({
        repeats: z.number().int().positive(),
        repeatsTold: z.number().int().positive(),
        silentTurns: z.number().int().positive(),
        testPath: z.string().optional(),
      })
      .loose(),
    moments: z.record(z.string(), QuestionSchema).default({}),
  })
  .loose();
