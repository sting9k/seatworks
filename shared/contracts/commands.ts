import { z } from "zod";

/** Every command's arguments (LEDGER.md §5); a tool's input schema is its command's. */

const id = z.string().min(1).max(64);
const text = z.string().trim().min(1).max(20_000);
const reason = z.string().trim().min(1).max(4_000);
const path = z
  .string()
  .max(1_000)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), "a path is relative and stays inside the tree");
const sha = z.string().regex(/^[0-9a-f]{7,64}$/);
const ref = z.object({ kind: z.enum(["message", "question", "finding", "evidence"]), id });
const lineInput = z.object({ text, via: ref.optional() });
const term = z.string().trim().min(1).max(200);
const check = z.object({ name: z.string().trim().min(1).max(200), run: z.array(z.string().min(1)).min(1).max(100) });
const briefLines = z.array(lineInput).max(100);
const briefKind = z.enum(["verification", "discovery"]);

export const BriefInput = z.object({
  goal: lineInput,
  constraints: briefLines.default([]),
  choices: briefLines.default([]),
  context: briefLines.default([]),
  kind: briefKind,
});

export const PlanInput = z.object({
  goal: lineInput,
  limits: z.array(lineInput).max(100).default([]),
  unknowns: z
    .array(z.object({ line: lineInput, check: text }))
    .max(100)
    .default([]),
  appetite: z.object({
    line: lineInput,
    usd: z.number().positive().nullable().default(null),
    hours: z.number().positive().nullable().default(null),
  }),
  terms: z
    .array(z.object({ name: term, line: lineInput, avoid: z.array(term).max(20).default([]) }))
    .max(200)
    .default([]),
});

export const COMMANDS = {
  open_project: z.object({
    base: z.string().min(1).max(250),
    remote: z.string().max(250).nullable().default(null),
    profileHash: id,
    model: z.string().min(1),
  }),
  open_scope: z.object({
    parent: id,
    role: id,
    paths: z.array(path).max(200).default([]),
    after: z.array(id).max(50).default([]),
    brief: BriefInput.nullable().default(null),
    commit: sha.nullable().default(null),
    over: z.union([z.array(id), z.literal("all")]).default([]),
    model: z.string().min(1).max(200).nullable().default(null),
  }),
  amend_brief: z.object({
    scope: id,
    // Not `BriefInput.partial()`: zod 4 still applies its defaults, so a section left out would be emptied.
    set: z.object({
      goal: lineInput.optional(),
      constraints: briefLines.optional(),
      choices: briefLines.optional(),
      context: briefLines.optional(),
      kind: briefKind.optional(),
    }),
    reason,
    carries: id.nullable().default(null),
    cites: ref.nullable().default(null),
  }),
  set_plan: z.object({ scope: id, plan: PlanInput }),
  amend_plan: z.object({
    scope: id,
    remove: z.array(id).max(100).default([]),
    add: z
      .array(
        z
          .object({
            section: z.enum(["limits", "unknowns", "terms"]),
            text,
            check: text.optional(),
            term: term.optional(),
            avoid: z.array(term).max(20).default([]),
            via: ref.optional(),
          })
          .refine((a) => a.section !== "terms" || a.term !== undefined, "a term added names the word it defines"),
      )
      .max(100)
      .default([]),
    goal: lineInput.optional(),
    appetite: PlanInput.shape.appetite.optional(),
    reason,
    carries: id.nullable().default(null),
    cites: ref.nullable().default(null),
  }),
  add_edge: z.object({
    scope: id,
    edge: z.enum(["after", "mayChange", "mustTell"]),
    target: id,
    reason,
    carries: id.nullable().default(null),
  }),
  remove_edge: z.object({
    scope: id,
    edge: z.enum(["after", "mayChange", "mustTell"]),
    target: id,
    reason,
    carries: id.nullable().default(null),
  }),
  handover: z.object({
    from: id,
    to: id,
    paths: z.array(path).min(1).max(200),
    reason,
    carries: id.nullable().default(null),
  }),
  raise_finding: z.object({
    disputes: id.nullable().default(null),
    about: id.nullable().default(null),
    text,
    evidence: z.array(id).max(50).default([]),
    default: text,
  }),
  reopen_finding: z.object({ finding: id, evidence: z.array(id).min(1).max(50), text }),
  classify_finding: z.object({ finding: id, verdict: z.enum(["changes", "alternative", "minor"]), reason }),
  withdraw_finding: z.object({ finding: id, reason }),
  hand_back: z.object({
    commit: sha,
    text,
    behaviours: z
      .array(z.object({ behaviour: text, proof: text }))
      .max(100)
      .default([]),
  }),
  record_verdict: z.object({ ok: z.boolean(), text }),
  run_checks: z.object({ scope: id, commit: sha, steps: z.array(check).max(50).nullable().default(null) }),
  integrate: z.object({ scope: id, evidence: z.array(id).min(1).max(50), reason: reason.nullable().default(null) }),
  send_back: z.object({ scope: id, reason }),
  reseat: z.object({ scope: id, reason, model: z.string().min(1).max(200).nullable().default(null) }),
  drop_scope: z.object({ scope: id, reason }),
  hold_scope: z.object({ scope: id, reason }),
  resume_scope: z.object({ scope: id, reason }),
  release: z.object({ actor: id, reason }),
  report: z.object({
    decided: z.array(text).max(100).default([]),
    assumed: z.array(text).max(100).default([]),
    open: z.array(text).max(100).default([]),
  }),
  send_message: z.object({
    to: id,
    text,
    asks: z.boolean().default(false),
    directs: z.boolean().default(false),
    replyTo: id.nullable().default(null),
  }),
  answer: z.object({ replyTo: id, text }),
  ask_human: z.object({
    text,
    about: ref.nullable().default(null),
    options: z.array(text).max(10).default([]),
    recommend: text.nullable().default(null),
  }),
  answer_question: z.object({ question: id, text }),
  hold_machine: z.object({ hold: z.boolean(), why: reason }),
  answer_permission: z.object({ permission: id, allow: z.boolean(), reason }),
  acknowledge: z.object({ attention: id }),
  mark_noise: z.object({ attention: id }),
  attend: z.object({
    candidate: id.nullable().default(null),
    actor: id,
    moment: z.string().min(1).max(100),
    why: text,
    urgency: z.enum(["now", "later"]),
  }),
  pass: z.object({ candidate: id, reason }),
  set_checks: z.object({ checks: z.array(check).max(50) }),
  publish: z.object({ remote: z.string().min(1).max(250) }),

  record_workspace: z.object({
    scope: id,
    ok: z.boolean(),
    branch: z.string().nullable().default(null),
    why: z.string().nullable().default(null),
  }),
  record_agent: z.object({ actor: id, host: z.string().min(1) }),
  record_turn: z.object({
    actor: id,
    outcome: z.enum(["done", "failed", "cancelled"]),
    why: z.string().nullable().default(null),
    tokensSoFar: z.number().int().nonnegative(),
    usdSoFar: z.number().nonnegative(),
    seen: z.number().int().nonnegative(),
  }),
  record_gone: z.object({ actor: id, why: reason }),
  record_delivery: z.object({ messages: z.array(id).default([]), attentions: z.array(id).default([]) }),
  record_candidate: z.object({
    scope: id,
    commit: sha,
    result: z.union([z.object({ candidate: sha, parentHead: sha }), z.object({ conflict: z.array(z.string()) })]),
  }),
  record_evidence: z.object({
    scope: id,
    subject: sha,
    ok: z.boolean(),
    summary: z.string().max(4_000),
    steps: z.array(
      z.object({
        name: z.string(),
        exit: z.number().int(),
        seconds: z.number(),
        cause: z.enum(["environment", "code"]).nullable(),
      }),
    ),
    heldMachine: z.boolean(),
  }),
  record_integration: z.object({ scope: id, result: z.union([z.object({ sha }), z.object({ refused: z.string() })]) }),
  record_publish: z.object({ result: z.union([z.object({ sha }), z.object({ refused: z.string() })]) }),
  record_permission: z.object({ actor: id, request: z.string().min(1), text }),
  record_permission_settled: z.object({ actor: id, request: z.string().min(1), allow: z.boolean() }),
  record_human_words: z.object({ actor: id, text }),
  record_observation: z.object({
    question: z.string().min(1).max(100),
    actor: id.nullable(),
    scope: id,
    source: z.enum(["reflex", "code"]),
    model: z.string().nullable().default(null),
    answer: z.string().max(4_000),
    level: z.enum(["tell", "consider", "record"]),
    route: z.union([
      z.object({
        kind: z.literal("attention"),
        why: text,
        facts: z.array(z.string()).max(20).default([]),
        urgency: z.enum(["now", "later"]),
      }),
      z.object({
        kind: z.literal("note"),
        to: z.enum(["root", "parent", "self"]),
        text,
        wakes: z.boolean().default(false),
      }),
      z.object({ kind: z.literal("evidence"), commit: sha, ok: z.boolean(), text }),
      z.object({ kind: z.literal("fact"), to: z.enum(["root", "parent", "self", "answerer"]), text }),
    ]),
  }),
} as const;

export type CommandType = keyof typeof COMMANDS;
export type Args<T extends CommandType> = z.output<(typeof COMMANDS)[T]>;
export type CommandBody = { [T in CommandType]: { type: T } & Args<T> }[CommandType];

/** Commands only the bridge sends, carrying a satellite's or the agent host's fact. */
export const FACTS: ReadonlySet<CommandType> = new Set<CommandType>([
  "record_workspace",
  "record_agent",
  "record_turn",
  "record_gone",
  "record_delivery",
  "record_candidate",
  "record_evidence",
  "record_integration",
  "record_publish",
  "record_permission",
  "record_permission_settled",
  "record_human_words",
  "record_observation",
]);

/** Commands the Human may send from the surface; the root's parent may also do what any parent's owner does. */
export const HUMAN_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  "open_project",
  "send_message",
  "answer_question",
  "hold_scope",
  "resume_scope",
  "amend_plan",
  "answer_permission",
  "set_checks",
  "publish",
  "reseat",
  "release",
  "hold_machine",
]);

export type Caller =
  { readonly kind: "agent"; readonly actor: string } | { readonly kind: "human" } | { readonly kind: "bridge" };

export type Command = {
  readonly id: string;
  readonly at: string;
  readonly caller: Caller;
  readonly body: CommandBody;
};

/** Parses a command's arguments at the boundary: a tool call, an RPC, a fact. */
export function parseBody(type: string, args: unknown): { ok: true; body: CommandBody } | { ok: false; says: string } {
  if (!Object.hasOwn(COMMANDS, type)) return { ok: false, says: `no command ${type}` };
  const schema = COMMANDS[type as CommandType];
  const parsed = schema.safeParse(args);
  if (!parsed.success) return { ok: false, says: z.prettifyError(parsed.error) };
  return { ok: true, body: { type, ...parsed.data } as CommandBody };
}
