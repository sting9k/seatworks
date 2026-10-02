import type { z } from "zod";
import type { BriefInput, PlanInput } from "../../contracts/commands.ts";
import { HUMAN, ID_PREFIX } from "../../contracts/ids.ts";
import type { Brief, Line, Plan, Ref } from "../../contracts/ledger.ts";
import { type Context, type Refusal, refuse, saidByHuman } from "./context.ts";

type LineInput = { text: string; via?: Ref | undefined };

export function lineFrom(ctx: Context, input: LineInput): Line {
  return ctx.line(input.text, input.via ?? null);
}

export function briefFrom(ctx: Context, input: z.output<typeof BriefInput>, version: number): Brief {
  return {
    version,
    goal: lineFrom(ctx, input.goal),
    constraints: input.constraints.map((l) => lineFrom(ctx, l)),
    choices: input.choices.map((l) => lineFrom(ctx, l)),
    context: input.context.map((l) => lineFrom(ctx, l)),
    kind: input.kind,
  };
}

export function planFrom(ctx: Context, input: z.output<typeof PlanInput>): Plan {
  return {
    goal: lineFrom(ctx, input.goal),
    limits: input.limits.map((l) => lineFrom(ctx, l)),
    unknowns: input.unknowns.map((u) => ({ line: lineFrom(ctx, u.line), check: u.check })),
    appetite: { line: lineFrom(ctx, input.appetite.line), usd: input.appetite.usd, hours: input.appetite.hours },
    terms: input.terms.map((t) => ({ name: t.name, line: lineFrom(ctx, t.line), avoid: t.avoid })),
  };
}

/** Whether something of that kind and id was ever made: ids are counted, so one that was is below its kind's count. */
export function wasMade(ctx: Context, kind: Ref["kind"], id: string): boolean {
  const n = Number(id.slice(ID_PREFIX[kind].length));
  return id.startsWith(ID_PREFIX[kind]) && Number.isInteger(n) && n >= 1 && n <= ctx.state.counters[kind];
}

/** A line comes from something on the record: a `via` that names nothing that was made is refused, saying which. */
export function strayVia(ctx: Context, lines: readonly (LineInput | undefined)[]): Refusal | null {
  for (const line of lines) {
    const via = line?.via;
    if (via && !wasMade(ctx, via.kind, via.id))
      return refuse(
        "unknown",
        `no ${via.kind} ${via.id}: a line's \`via\` names a message, a question, a finding or evidence by its id`,
      );
  }
  return null;
}

/** I6: a change that touches the Human's lines, or the goal and cost they approved, rests on their word. */
export function humanWordFor(
  ctx: Context,
  touched: readonly Line[],
  approved: boolean,
  cites: Ref | null,
): Refusal | null {
  if (ctx.party === HUMAN) return null;
  const theirs = touched.filter((l) => l.origin === HUMAN);
  if (theirs.length === 0 && !approved) return null;
  if (cites !== null && saidByHuman(ctx.state, cites)) return null;
  const what =
    theirs.length > 0
      ? `the Human's line ${theirs.map((l) => l.id).join(", ")}`
      : "the goal or the cost the Human approved";
  return refuse("I6", `a change to ${what} cites the Human's answer or message: ask them first`);
}

export function briefLines(brief: Brief): Line[] {
  return [brief.goal, ...brief.constraints, ...brief.choices, ...brief.context];
}

export function planLines(plan: Plan): Line[] {
  return [
    plan.goal,
    ...plan.limits,
    ...plan.unknowns.map((u) => u.line),
    plan.appetite.line,
    ...plan.terms.map((t) => t.line),
  ];
}
