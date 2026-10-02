import { z } from "zod";
import type { EventType } from "./events.ts";

/** The events a question may be asked on; `turn_ended` is asked of a turn's last words, when it called no tool. */
export const ASKED_ON = [
  "brief_issued",
  "brief_amended",
  "plan_amended",
  "finding_raised",
  "finding_classified",
  "report_made",
  "claim_made",
  "evidence_recorded",
  "permission_asked",
  "message_sent",
  "turn_ended",
] as const satisfies readonly EventType[];
export type AskedOn = (typeof ASKED_ON)[number];

/** Where a field of a question's `state` is read from; `names.unsettled` is given to the minted-names moment alone. */
export const STATE_PATHS = [
  "item",
  "hunk",
  "turn.lastSaid",
  "plan.goal",
  "plan.appetite",
  "plan.lines",
  "scope.brief.goal",
  "brief.goal",
  "brief.constraints",
  "brief.choices",
  "brief.context",
  "brief.kind",
  "brief.text",
  "step.logTail",
  "finding.evidence",
  "finding.reason",
  "report.lines",
  "handback.text",
  "permission.text",
  "message.text",
  "event.text",
  "names.unsettled",
] as const;
export type StatePath = (typeof STATE_PATHS)[number];

/** Whom a question's answer is for, as its `tells` names them; with none, it is an attention for the owner above. */
export const TELLS = ["root", "parent", "self", "answerer", "evidence"] as const;

/** The moments counted in code, by the names a profile switches each on with; they ask no model. */
export const CODE_MOMENTS = [
  "going-in-circles",
  "check-made-to-pass",
  "silent-without-progress",
  "findings-waiting",
  "past-appetite",
] as const;
export type CodeMoment = (typeof CODE_MOMENTS)[number];

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

/** The routes the reflex asks by, the plugin's own (`harness/jev.json`): a profile never says where the key is sent. */
export const RoutesFileSchema = z.object({ routes: z.record(z.string(), RouteSchema) }).strict();

/** One named under `active` that the file does not write would never be asked, with nobody told. */
const written =
  (kind: "questions" | "moments") =>
  (file: { active: string[] } & Record<string, unknown>, ctx: z.RefinementCtx): void => {
    const all = file[kind] as Record<string, unknown>;
    for (const name of file.active)
      if (!Object.hasOwn(all, name))
        ctx.addIssue({ code: "custom", path: ["active"], message: `${name} is named but not written under ${kind}` });
  };

/** The questions a profile asks of the record's events, in the file its `reflex` names. */
export const ReflexFileSchema = z
  .object({
    active: z.array(z.string()).default([]),
    environment: z.array(z.string()).default([]),
    questions: z.record(z.string(), QuestionSchema).default({}),
  })
  .loose()
  .superRefine(written("questions"));

/** The moments a profile watches for, and what the eye counts in code, in the file its `watch` names. */
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
  .loose()
  .superRefine(written("moments"));
