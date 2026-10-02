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
// A line and what it comes from are the same in every tool, so they are said once, in the tool's own description.
const ref = z.object({ kind: z.enum(["message", "question", "finding", "evidence"]), id });
const via = ref.optional();
const lineInput = z.object({ text, via });
const term = z.string().trim().min(1).max(200);
const check = z.object({
  name: z.string().trim().min(1).max(200).describe("What the check is called."),
  run: z.array(z.string().min(1)).min(1).max(100).describe("The program and its arguments, run with no shell."),
});
const briefLines = z.array(lineInput).max(100);
const briefKind = z.enum(["verification", "discovery"]);
const why = reason.describe("Why.");
/** The finding a change answers, which is how a finding classified `changes` is shown its change (I8). */
const carries = id.nullable().default(null).describe("The finding this change answers, by its id.");
/** The Human's word a change to their line, the goal or the cost rests on (I6). */
const cites = ref
  .nullable()
  .default(null)
  .describe("The Human's message or answer it rests on: needed to change a line of theirs, the goal or the cost.");
const agentProfile = z
  .string()
  .min(1)
  .max(200)
  .nullable()
  .default(null)
  .describe("Which of the role's agent profiles to seat it on; its first when left out.");
const edge = z
  .enum(["after", "mayChange", "mustTell"])
  .describe(
    "after: it waits for the target, a sibling. mayChange: it may change a decision of the target's. mustTell: it must tell the target of what it changes.",
  );

/** One section of a report: lines, and no shape of a profile's choosing, so each keeps its origin (I9). */
export const ReportLines = z.array(text).max(100);

const briefSections = {
  goal: lineInput.describe("What the scope is for."),
  constraints: briefLines.describe("What must really hold; open to question only on evidence that it cannot."),
  choices: briefLines.describe("The design now in use: the way taken so far, which its agent may question."),
  context: briefLines.describe("What its agent needs to know and would not find by itself."),
  kind: briefKind.describe(
    "verification: check an invariant, or build to a contract already settled. discovery: what to build is still open, and the premise may be reopened.",
  ),
};

export const BriefInput = z.object({
  goal: briefSections.goal,
  constraints: briefSections.constraints.default([]),
  choices: briefSections.choices.default([]),
  context: briefSections.context.default([]),
  kind: briefSections.kind,
});

const appetite = z.object({
  line: lineInput.describe("What it may cost, in words."),
  usd: z.number().positive().nullable().default(null).describe("The same as dollars, when it names an amount."),
  hours: z.number().positive().nullable().default(null).describe("The same as hours, when it names a time."),
});

export const PlanInput = z.object({
  goal: lineInput.describe("What the scope is to reach."),
  limits: z
    .array(lineInput)
    .max(100)
    .default([])
    .describe("What must hold: the Human's lines, and those chosen so far."),
  unknowns: z
    .array(
      z.object({
        line: lineInput.describe("What is not yet known."),
        check: text.describe("How it will be found out."),
      }),
    )
    .max(100)
    .default([])
    .describe("What is not yet known, each with how it is checked."),
  appetite: appetite.describe("What it may cost."),
  terms: z
    .array(
      z.object({
        name: term.describe("The word."),
        line: lineInput.describe("What it means here."),
        avoid: z.array(term).max(20).default([]).describe("Words not to use for it."),
      }),
    )
    .max(200)
    .default([])
    .describe("The domain's words as settled."),
});

export const COMMANDS = {
  open_project: z.object({
    base: z.string().min(1).max(250),
    remote: z.string().max(250).nullable().default(null),
    /** The profile the project runs, by its name, and the hash of its files when the project opened. */
    profile: id,
    profileHash: id,
    model: z.string().min(1),
  }),
  open_scope: z.object({
    parent: id.describe("The scope it opens under: one you own."),
    role: id.describe("The role of the agent seated in it: one your role may seat."),
    paths: z
      .array(path)
      .max(200)
      .default([])
      .describe(
        "The paths it owns, each inside its parent's, relative to the repository. None for a role that reads or watches.",
      ),
    after: z
      .array(id)
      .max(50)
      .default([])
      .describe("Sibling scopes it waits for: it gets its copy and its agent once each is integrated."),
    brief: BriefInput.nullable().default(null).describe("What you ask of it."),
    commit: sha.nullable().default(null).describe("For a role that reads: the commit it is seated on."),
    over: z
      .union([z.array(id), z.literal("all")])
      .default([])
      .describe("For a role that watches: the scopes it watches over, or `all`."),
    model: agentProfile,
  }),
  amend_brief: z.object({
    scope: id.describe("The child scope whose brief changes."),
    // Not `BriefInput.partial()`: zod 4 still applies its defaults, so a section left out would be emptied.
    set: z
      .object({
        goal: briefSections.goal.optional(),
        constraints: briefSections.constraints.optional(),
        choices: briefSections.choices.optional(),
        context: briefSections.context.optional(),
        kind: briefSections.kind.optional(),
      })
      .describe("Only the sections that change, each whole; one left out stays as it is."),
    reason: why,
    carries,
    cites,
  }),
  set_plan: z.object({
    scope: id.describe("The scope the plan is of: one you own."),
    plan: PlanInput.describe("The plan."),
  }),
  amend_plan: z.object({
    scope: id.describe("The scope whose plan changes: one you own."),
    remove: z.array(id).max(100).default([]).describe("Lines to take out, by their ids."),
    add: z
      .array(
        z
          .object({
            section: z.enum(["limits", "unknowns", "terms"]).describe("The section it joins."),
            text: text.describe("The line."),
            check: text.optional().describe("For an unknown: how it will be found out."),
            term: term.optional().describe("For a term: the word it defines; one the plan holds is replaced."),
            avoid: z.array(term).max(20).default([]).describe("For a term: words not to use for it."),
            via: via.describe("What the line comes from, as `{ kind, id }`."),
          })
          .refine((a) => a.section !== "terms" || a.term !== undefined, "a term added names the word it defines"),
      )
      .max(100)
      .default([])
      .describe("Lines to add."),
    goal: lineInput.optional().describe("A new goal, in place of the old."),
    appetite: appetite.optional().describe("A new appetite, in place of the old."),
    reason: why,
    carries,
    cites,
  }),
  add_edge: z.object({
    scope: id.describe("The scope the edge sits in: a child of yours for `after`, your own for the others."),
    edge,
    target: id.describe("The scope it points at."),
    reason: why,
    carries,
  }),
  remove_edge: z.object({
    scope: id.describe("The scope the edge sits in: a child of yours for `after`, your own for the others."),
    edge,
    target: id.describe("The scope it points at."),
    reason: why,
    carries,
  }),
  handover: z.object({
    from: id.describe("The child scope that gives the paths up."),
    to: id.describe("Its sibling that takes them."),
    paths: z.array(path).min(1).max(200).describe("The paths that move."),
    reason: why,
    carries,
  }),
  raise_finding: z.object({
    disputes: id.nullable().default(null).describe("The line it disputes, by its id in a brief or a plan."),
    about: id.nullable().default(null).describe("The scope it is about, when not your own."),
    text: text.describe("What does not fit, and what the evidence shows."),
    evidence: z
      .array(id)
      .max(50)
      .default([])
      .describe("Evidence on the record that shows it, by id: a check's result, a verdict."),
    default: text.describe("What you do meanwhile, until it is answered."),
  }),
  reopen_finding: z.object({
    finding: id.describe("The finding, by its id."),
    evidence: z.array(id).min(1).max(50).describe("New evidence on the record, by id."),
    text: text.describe("What the new evidence shows."),
  }),
  classify_finding: z.object({
    finding: id.describe("The finding, by its id."),
    verdict: z
      .enum(["changes", "alternative", "minor"])
      .describe(
        "changes: the plan or a brief changed for it, by a change that carries it. alternative: another sound way, and the plan is kept. minor: not worth stopping for.",
      ),
    reason: reason.describe("Why, in words the one who raised it can argue with."),
  }),
  withdraw_finding: z.object({ finding: id.describe("Your finding, by its id."), reason: why }),
  hand_back: z.object({
    commit: sha.describe("The commit handed back: the head of your work."),
    text: text.describe("What it does."),
    behaviours: z
      .array(z.object({ behaviour: text.describe("A behaviour asked for."), proof: text.describe("What proves it.") }))
      .max(100)
      .default([])
      .describe("Each behaviour asked for, beside what proves it."),
  }),
  record_verdict: z.object({
    ok: z.boolean().describe("Whether the commit stands."),
    text: text.describe("What you found, and where."),
  }),
  run_checks: z.object({
    scope: id.describe("The scope the commit is of."),
    commit: sha.describe("The commit to check."),
    steps: z
      .array(check)
      .max(50)
      .nullable()
      .default(null)
      .describe("Commands of your own, in place of the project's checks."),
  }),
  integrate: z.object({
    scope: id.describe("The child scope to take in."),
    evidence: z.array(id).min(1).max(50).describe("Evidence on the very commit handed back, by id."),
    reason: reason
      .nullable()
      .default(null)
      .describe("Needed when a result cited is failing: why it is taken in all the same."),
  }),
  send_back: z.object({ scope: id.describe("The child scope whose hand-back goes back."), reason: why }),
  reseat: z.object({ scope: id.describe("The scope that gets a fresh agent."), reason: why, model: agentProfile }),
  drop_scope: z.object({ scope: id.describe("The scope to close."), reason: why }),
  hold_scope: z.object({ scope: id.describe("The scope to hold."), reason: why }),
  resume_scope: z.object({ scope: id.describe("The scope to resume."), reason: why }),
  release: z.object({ actor: id.describe("The agent whose seat ends, by its actor id."), reason: why }),
  // An agent names its sections side by side; the kernel reads them as one map, apart from a command's own fields.
  report: z.record(z.string().max(64), ReportLines).transform((sections) => ({ sections })),
  send_message: z.object({
    to: id.describe("An actor's id, or `human`."),
    text: text.describe("What you say."),
    asks: z.boolean().default(false).describe("It needs an answer, and is owed one until answered."),
    directs: z.boolean().default(false).describe("It changes what the reader is to do."),
    replyTo: id.nullable().default(null).describe("The message it follows, by its id."),
  }),
  answer: z.object({
    replyTo: id.describe("The message you answer, by its id."),
    text: text.describe("Your answer."),
  }),
  ask_human: z.object({
    text: text.describe("The question."),
    about: ref.nullable().default(null).describe("What it is about, such as a finding that waits on the Human."),
    options: z.array(text).max(10).default([]).describe("Answers to pick from."),
    recommend: text.nullable().default(null).describe("The one you would pick, and why."),
  }),
  answer_question: z.object({ question: id, text }),
  hold_machine: z.object({
    hold: z.boolean().describe("true to hold it, false to let it go."),
    why: reason.describe("What you measure."),
  }),
  answer_permission: z.object({
    permission: id.describe("The permission asked, by its id."),
    allow: z.boolean().describe("Whether it may."),
    reason: why,
  }),
  acknowledge: z.object({ attention: id.describe("The attention, by its id.") }),
  mark_noise: z.object({ attention: id.describe("The attention, by its id.") }),
  attend: z.object({
    candidate: id.nullable().default(null).describe("The candidate you were sent, when this answers one."),
    actor: id.describe("The agent it is about, by its actor id."),
    moment: z.string().min(1).max(100).describe("The moment's name."),
    why: text.describe("One sentence quoting the words that decided it."),
    urgency: z
      .enum(["now", "later"])
      .describe("now: its reader is woken. later: it waits for their next message that asks."),
  }),
  pass: z.object({ candidate: id.describe("The candidate, by its id."), reason: why }),
  set_checks: z.object({
    checks: z.array(check).max(50).describe("The project's checks, in place of those set before."),
  }),
  publish: z.object({ remote: z.string().min(1).max(250).describe("The remote's name, such as origin.") }),

  record_workspace: z.object({
    scope: id,
    ok: z.boolean(),
    branch: z.string().nullable().default(null),
    head: z.string().nullable().default(null),
    why: z.string().nullable().default(null),
  }),
  record_agent: z.object({ actor: id, host: z.string().min(1) }),
  record_tools: z.object({ actor: id }),
  record_turn: z.object({
    actor: id,
    outcome: z.enum(["done", "failed", "cancelled"]),
    why: z.string().nullable().default(null),
    /** The plugin's own words that began the turn, if its words began it. */
    began: z.string().nullable().default(null),
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
  record_profile: z.object({ profileHash: z.string().min(1).max(100) }),
  record_publish: z.object({
    result: z.union([z.object({ sha }), z.object({ refused: z.string(), at: sha.nullable().default(null) })]),
  }),
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
  "record_tools",
  "record_turn",
  "record_gone",
  "record_delivery",
  "record_candidate",
  "record_evidence",
  "record_integration",
  "record_profile",
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
  "acknowledge",
  "mark_noise",
  "set_checks",
  "publish",
  "send_back",
  "reseat",
  "release",
  "hold_machine",
  "classify_finding",
]);

/** Commands the Human alone sends, which no role is given. */
export const HUMAN_ONLY: ReadonlySet<CommandType> = new Set<CommandType>(["open_project", "answer_question"]);

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
