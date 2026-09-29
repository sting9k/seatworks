import type { CommandBody } from "../../contracts/commands.ts";
import { HUMAN, type ScopeId } from "../../contracts/ids.ts";
import type { Finding } from "../../contracts/ledger.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";
import { briefLines, planLines } from "./lines.ts";
import { answererOf, answeringScope } from "./seats.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

/** Which scope's owner answers a finding on a line (KERNEL.md §4.4), or null when the line is nowhere. */
function lineHome(ctx: Context, line: string): { scope: ScopeId; in: "brief" | "plan" } | null {
  for (const scope of ctx.state.scopes.values()) {
    if (scope.brief && briefLines(scope.brief).some((l) => l.id === line)) return { scope: scope.id, in: "brief" };
    if (scope.plan && planLines(scope.plan).some((l) => l.id === line)) return { scope: scope.id, in: "plan" };
  }
  return null;
}

export function raiseFinding(ctx: Of<"raise_finding">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  const { body } = ctx;
  const own = ctx.state.scopes.get(me.actor.scope);
  if (!own) return refuse("unknown", `no scope ${me.actor.scope}`);
  for (const e of body.evidence) if (!ctx.state.evidence.has(e)) return refuse("unknown", `no evidence ${e}`);
  if (body.about !== null && !ctx.state.scopes.has(body.about)) return refuse("unknown", `no scope ${body.about}`);

  let answeredBy: ScopeId | null = own.parent;
  if (body.disputes !== null) {
    const home = lineHome(ctx, body.disputes);
    if (!home) return refuse("unknown", `no line ${body.disputes} in any brief or plan`);
    if (body.about === null)
      answeredBy = home.in === "plan" ? home.scope : (ctx.state.scopes.get(home.scope)?.parent ?? null);
  }
  if (answeredBy === null)
    return refuse("state", "nobody above you answers a finding: put it to the Human with a question");
  // An empty seat does not refuse the finding: it climbs to the next owner seated above, the Human past the root.
  const answers = answeringScope(ctx, answeredBy);
  if (answers === null) return refuse("unknown", `no scope ${answeredBy}`);
  answeredBy = answers.scope;
  const answerer = answers.answerer;

  const finding: Finding = {
    id: ctx.next("finding"),
    scope: own.id,
    raisedBy: me.actor.id,
    disputes: body.disputes,
    about: body.about,
    text: body.text,
    evidence: body.evidence,
    default: body.default,
    answeredBy,
    status: "raised",
    verdict: null,
    reason: null,
    carriedBy: [],
    question: null,
    raisedAt: ctx.nextSeq,
  };
  ctx.emit({ type: "finding_raised", finding });
  ctx.emit({
    type: "obligation_opened",
    obligation: {
      id: ctx.next("obligation"),
      owedBy: answerer,
      owedTo: me.actor.id,
      about: { kind: "finding", id: finding.id },
      opened: ctx.at,
    },
  });
  return undefined;
}

export function reopenFinding(ctx: Of<"reopen_finding">): Refusal | undefined {
  const finding = ctx.state.findings.get(ctx.body.finding);
  if (!finding) return refuse("unknown", `no finding ${ctx.body.finding}`);
  if (finding.raisedBy !== ctx.party) return refuse("authority", "only its raiser reopens a finding");
  if (finding.status !== "kept") return refuse("state", `finding ${finding.id} is ${finding.status}, not kept`);
  for (const e of ctx.body.evidence) if (!ctx.state.evidence.has(e)) return refuse("unknown", `no evidence ${e}`);
  const answerer = answererOf(ctx, finding.answeredBy);
  if (answerer === null) return refuse("state", `scope ${finding.answeredBy} has nobody seated to answer it`);
  ctx.emit({ type: "finding_reopened", finding: finding.id, evidence: ctx.body.evidence, text: ctx.body.text });
  ctx.emit({
    type: "obligation_opened",
    obligation: {
      id: ctx.next("obligation"),
      owedBy: answerer,
      owedTo: finding.raisedBy,
      about: { kind: "finding", id: finding.id },
      opened: ctx.at,
    },
  });
  return undefined;
}

export function classifyFinding(ctx: Of<"classify_finding">): Refusal | undefined {
  const finding = ctx.state.findings.get(ctx.body.finding);
  if (!finding) return refuse("unknown", `no finding ${ctx.body.finding}`);
  if (answererOf(ctx, finding.answeredBy) !== ctx.party)
    return refuse("authority", `finding ${finding.id} is not yours to answer`);
  if (finding.status !== "raised") return refuse("state", `finding ${finding.id} is ${finding.status}`);
  if (ctx.body.verdict === "changes" && finding.carriedBy.length === 0)
    return refuse("I8", "a finding that changes the decision points to the change: amend with `carries` first");
  ctx.emit({ type: "finding_classified", finding: finding.id, verdict: ctx.body.verdict, reason: ctx.body.reason });
  closeAbout(ctx, "finding", finding.id, ctx.body.verdict === "changes" ? "carried" : "kept");
  return undefined;
}

export function withdrawFinding(ctx: Of<"withdraw_finding">): Refusal | undefined {
  const finding = ctx.state.findings.get(ctx.body.finding);
  if (!finding) return refuse("unknown", `no finding ${ctx.body.finding}`);
  if (finding.raisedBy !== ctx.party) return refuse("authority", "only its raiser withdraws a finding");
  if (finding.status !== "raised" && finding.status !== "waiting")
    return refuse("state", `finding ${finding.id} is ${finding.status}`);
  ctx.emit({ type: "finding_withdrawn", finding: finding.id, reason: ctx.body.reason });
  closeAbout(ctx, "finding", finding.id, "withdrawn");
  return undefined;
}

export function askHuman(ctx: Of<"ask_human">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  if (!me.role.humanDoor) return refuse("I10", "only the role with the door to the Human asks them");
  const { body } = ctx;
  const id = ctx.next("question");
  let waiting: string | null = null;
  if (body.about?.kind === "finding") {
    const finding = ctx.state.findings.get(body.about.id);
    if (!finding) return refuse("unknown", `no finding ${body.about.id}`);
    if (finding.status === "raised") waiting = finding.id;
  }
  ctx.emit({
    type: "question_asked",
    question: {
      id,
      from: me.actor.id,
      text: body.text,
      about: body.about,
      options: body.options,
      recommend: body.recommend,
    },
  });
  ctx.emit({
    type: "obligation_opened",
    obligation: {
      id: ctx.next("obligation"),
      owedBy: HUMAN,
      owedTo: me.actor.id,
      about: { kind: "question", id },
      opened: ctx.at,
    },
  });
  if (waiting !== null) ctx.emit({ type: "finding_waiting", finding: waiting, question: id });
  return undefined;
}

export function answerQuestion(ctx: Of<"answer_question">): Refusal | undefined {
  const question = ctx.state.questions.get(ctx.body.question);
  if (!question) return refuse("unknown", `no open question ${ctx.body.question}`);
  ctx.emit({ type: "question_answered", question: question.id, text: ctx.body.text, asker: question.from });
  closeAbout(ctx, "question", question.id, "answered");
  for (const f of ctx.state.findings.values())
    if (f.status === "waiting" && f.question === question.id) ctx.emit({ type: "finding_resumed", finding: f.id });
  return undefined;
}

/** Closes every open obligation about one thing. */
export function closeAbout(ctx: Context, kind: string, id: string, how: string): void {
  for (const o of ctx.state.obligations.values())
    if (o.about.kind === kind && o.about.id === id) ctx.emit({ type: "obligation_closed", obligation: o.id, how });
}
