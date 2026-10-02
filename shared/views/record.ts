import type { Event } from "../contracts/events.ts";
import { parentScopeId } from "../contracts/ids.ts";
import { sameCommit } from "../kernel/commits.ts";

/** The chain of change of one finding (CONCEPT-V2 §10.1), read from the log as it streams past. */
export type Chain = {
  finding: string;
  scope: string;
  raisedBy: string;
  text: string;
  disputed: string | null;
  briefWhenGiven: string | null;
  raisedAt: string;
  classifiedAt: string | null;
  verdict: string | null;
  reason: string | null;
  evidence: string[];
  changes: { at: string; by: string; what: string }[];
  integratedAfter: { scope: string; at: string }[];
};

export function chainOf(events: Iterable<Event>, finding: string): Chain | null {
  let chain: Chain | null = null;
  const briefs = new Map<string, string>();
  for (const e of events) {
    if (e.type === "brief_issued" || e.type === "brief_amended")
      briefs.set(e.scope, `v${e.brief.version}: ${e.brief.goal.text}`);
    if (e.type === "finding_raised" && e.finding.id === finding)
      chain = {
        finding,
        scope: e.finding.scope,
        raisedBy: e.finding.raisedBy,
        text: e.finding.text,
        disputed: e.finding.disputes,
        briefWhenGiven: briefs.get(e.finding.scope) ?? null,
        raisedAt: e.at,
        classifiedAt: null,
        verdict: null,
        reason: null,
        evidence: [...e.finding.evidence],
        changes: [],
        integratedAfter: [],
      };
    if (!chain) continue;
    if (e.type === "finding_classified" && e.finding === finding) {
      chain.classifiedAt = e.at;
      chain.verdict = e.verdict;
      chain.reason = e.reason;
    }
    if (e.type === "finding_reopened" && e.finding === finding) {
      // Raised again, as the kernel keeps it: the verdict it had no longer stands.
      chain.evidence.push(...e.evidence);
      chain.classifiedAt = null;
      chain.verdict = null;
      chain.reason = null;
    }
    const carries = "carries" in e ? e.carries : null;
    if (carries === finding) chain.changes.push({ at: e.at, by: e.by, what: e.type.replace(/_/g, " ") });
    if (e.type === "integrated" && chain.classifiedAt !== null)
      chain.integratedAfter.push({ scope: e.scope, at: e.at });
  }
  return chain;
}

/** The five signals of CONCEPT-V2 §10.3, as `count of total` ratios for a reader to weigh; never a rule. */
export type Signals = {
  /** Findings on a line or scope that already had one. */
  repeatedFindings: [number, number];
  /** Questions to the Human after whose answer a plan or brief changed citing it. */
  questionsThatChanged: [number, number];
  /** Verdicts and failing checks followed by a send-back or an amended brief on the scope whose commit they read. */
  reviewsThatChanged: [number, number];
  /** Attentions left by their reader until they climbed. */
  interventionsLate: [number, number];
  /** Messages that asked for an answer and got none. */
  unanswered: [number, number];
};

export function signalsOf(events: Iterable<Event>): Signals {
  const lines = new Map<string, number>();
  let repeated = 0;
  let findings = 0;
  const answered = new Set<string>();
  const cited = new Set<string>();
  let questions = 0;
  /** Reviews waiting to be followed by a change, by the commit they read; the commits each scope handed back. */
  const reviews = new Map<string, number>();
  const commits = new Map<string, Set<string>>();
  const changed = (scope: string) => {
    for (const c of commits.get(scope) ?? [])
      for (const [subject, count] of reviews)
        if (sameCommit(subject, c)) {
          changedReviews += count;
          reviews.delete(subject);
        }
  };
  let reviewCount = 0;
  let changedReviews = 0;
  let attentions = 0;
  let climbed = 0;
  const asked = new Set<string>();
  const replied = new Set<string>();
  for (const e of events) {
    switch (e.type) {
      case "finding_raised": {
        findings += 1;
        const key = e.finding.disputes ?? `scope:${e.finding.about ?? e.finding.scope}`;
        const seen = lines.get(key) ?? 0;
        if (seen > 0) repeated += 1;
        lines.set(key, seen + 1);
        break;
      }
      case "question_asked":
        questions += 1;
        break;
      case "question_answered":
        answered.add(e.question);
        break;
      case "plan_amended":
      case "brief_amended": {
        const all =
          e.type === "plan_amended"
            ? [e.plan.goal, ...e.plan.limits, e.plan.appetite.line]
            : [e.brief.goal, ...e.brief.constraints, ...e.brief.choices];
        for (const l of all) if (l.via?.kind === "question" && answered.has(l.via.id)) cited.add(l.via.id);
        if (e.type === "brief_amended") changed(e.scope);
        break;
      }
      case "claim_made":
        commits.set(e.claim.scope, (commits.get(e.claim.scope) ?? new Set()).add(e.claim.commit));
        break;
      case "candidate_ready":
        commits.set(e.scope, (commits.get(e.scope) ?? new Set()).add(e.candidate));
        break;
      case "evidence_recorded":
        if (e.evidence.kind === "verdict" || (e.evidence.kind === "check" && !e.evidence.ok)) {
          reviewCount += 1;
          reviews.set(e.evidence.subject, (reviews.get(e.evidence.subject) ?? 0) + 1);
        }
        break;
      case "sent_back":
        changed(e.scope);
        break;
      case "attention_opened":
        attentions += 1;
        break;
      case "attention_climbed":
        climbed += 1;
        break;
      case "message_sent":
        if (e.message.asks) asked.add(e.message.id);
        if (e.message.replyTo !== null) replied.add(e.message.replyTo);
        break;
      default:
        break;
    }
  }
  return {
    repeatedFindings: [repeated, findings],
    questionsThatChanged: [cited.size, questions],
    reviewsThatChanged: [changedReviews, reviewCount],
    interventionsLate: [climbed, attentions],
    unanswered: [[...asked].filter((m) => !replied.has(m)).length, asked.size],
  };
}

/** The scopes whose record an event is read in; the lookups give those a finding and an attention are about. */
export function recordedIn(
  e: Event,
  ofFinding: (finding: string) => readonly string[],
  ofAttention: (attention: string) => readonly string[],
): readonly string[] {
  const carried = "carries" in e && e.carries !== null ? ofFinding(e.carries) : [];
  switch (e.type) {
    case "handed_over":
      return [e.from, e.to, ...carried];
    case "brief_issued":
    case "brief_amended":
    case "scope_held":
    case "scope_resumed":
    case "reseated":
    case "sent_back":
    case "report_made":
      return [e.scope, ...carried];
    // A scope's record keeps each scope opened under it and what came of it, which outlasts the child in memory.
    case "scope_opened":
      return e.scope.parent === null ? [] : [e.scope.parent];
    case "integrated":
    case "scope_dropped": {
      const parent = parentScopeId(e.scope);
      return parent === null ? [e.scope] : [e.scope, parent];
    }
    case "claim_made":
      return [e.claim.scope];
    case "finding_raised":
      return e.finding.about === null ? [e.finding.scope] : [e.finding.scope, e.finding.about];
    case "finding_classified":
    case "finding_withdrawn":
    case "finding_reopened":
      return ofFinding(e.finding);
    case "attention_opened":
      return [e.attention.about.scope];
    case "attention_climbed":
      return [e.to.about.scope];
    case "attention_acted":
    case "acknowledged":
    case "noise_marked":
      return ofAttention(e.attention);
    default:
      return carried;
  }
}

/** What came of an attention: its reader acted, said it needs nothing or marked its kind noise, or left it to climb. */
function cameOf(e: Event): { attention: string; says: string } | null {
  switch (e.type) {
    case "attention_acted":
      return { attention: e.attention, says: `acted on by ${e.by}` };
    case "acknowledged":
      return { attention: e.attention, says: `acknowledged by ${e.by}` };
    case "noise_marked":
      return { attention: e.attention, says: `its kind marked noise by ${e.by}` };
    case "attention_climbed":
      return { attention: e.attention, says: `not acted on, and climbed to ${e.to.to} as ${e.to.id}` };
    default:
      return null;
  }
}

/** Each attention about an actor in these events, oldest first, with what came of it, to weigh a new one against. */
export function attentionsAbout(events: Iterable<Event>, actor: string): string[] {
  const told = new Map<string, string[]>();
  const lines: string[][] = [];
  for (const e of events) {
    if (e.type === "attention_opened" && e.attention.about.actor === actor) {
      const line = [`${e.attention.id} (${e.attention.moment}) to ${e.attention.to}`];
      told.set(e.attention.id, line);
      lines.push(line);
    }
    const came = cameOf(e);
    const line = came ? told.get(came.attention) : undefined;
    if (!came || !line) continue;
    line.push(came.says);
    // A climb goes on as the same attention under a new id.
    if (e.type === "attention_climbed") told.set(e.to.id, line);
  }
  return lines.map(([head, ...came]) => `${head}: ${came.length > 0 ? came.join("; ") : "not yet acted on"}`);
}

/** What a look back reads of one question or moment (REFLEX.md, Measured by the record). */
export type Yield = {
  readonly name: string;
  /** Answers on the record, and of those that are probabilities how many fell under 0.25, between, and over 0.7. */
  readonly asked: number;
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  /** Answers past its threshold, and the candidates among them its watcher attended and passed. */
  readonly past: number;
  readonly attended: number;
  readonly passed: number;
  /** Attentions opened under its name, and what came of them. */
  readonly attentions: number;
  readonly acted: number;
  readonly acknowledged: number;
  readonly noise: number;
  readonly climbed: number;
};

/** Each question and moment the log holds an answer or an attention of, in the order first seen: counts, no rule. */
export function yieldsOf(events: Iterable<Event>): Yield[] {
  type Row = { -readonly [K in keyof Yield]: Yield[K] };
  const rows = new Map<string, Row>();
  const row = (name: string): Row => {
    const found = rows.get(name);
    if (found) return found;
    const made = { name, asked: 0, low: 0, mid: 0, high: 0, past: 0, attended: 0, passed: 0 };
    const fresh: Row = { ...made, attentions: 0, acted: 0, acknowledged: 0, noise: 0, climbed: 0 };
    rows.set(name, fresh);
    return fresh;
  };
  /** Open candidates and attentions by id, each with the name it is counted under. */
  const candidates = new Map<string, string>();
  const attentions = new Map<string, string>();
  const settled = (attention: string): Row | undefined => {
    const name = attentions.get(attention);
    attentions.delete(attention);
    return name === undefined ? undefined : row(name);
  };
  for (const e of events) {
    switch (e.type) {
      case "observation_made": {
        const r = row(e.observation.question);
        r.asked += 1;
        if (e.observation.level !== "record") r.past += 1;
        const p = e.observation.source === "reflex" ? probabilityIn(e.observation.answer) : null;
        if (p !== null) r[p < 0.25 ? "low" : p > 0.7 ? "high" : "mid"] += 1;
        break;
      }
      case "obligation_opened":
        if (e.obligation.seen) candidates.set(e.obligation.about.id, e.obligation.seen.moment);
        break;
      case "attended":
      case "passed": {
        const name = e.candidate === null ? undefined : candidates.get(e.candidate);
        if (e.candidate !== null) candidates.delete(e.candidate);
        if (name !== undefined) row(name)[e.type] += 1;
        break;
      }
      case "attention_opened":
        attentions.set(e.attention.id, e.attention.moment);
        row(e.attention.moment).attentions += 1;
        break;
      case "attention_acted": {
        const r = settled(e.attention);
        if (r) r.acted += 1;
        break;
      }
      case "acknowledged": {
        const r = settled(e.attention);
        if (r) r.acknowledged += 1;
        break;
      }
      case "noise_marked": {
        const r = settled(e.attention);
        if (r) r.noise += 1;
        break;
      }
      case "attention_climbed": {
        // A climb goes on as the same attention under a new id: counted as left once, and opened once.
        const r = settled(e.attention);
        if (r) {
          r.climbed += 1;
          attentions.set(e.to.id, r.name);
        }
        break;
      }
      default:
        break;
    }
  }
  return [...rows.values()];
}

/** The probability an answer of the reflex states: alone, or in brackets after the label chosen. */
function probabilityIn(answer: string): number | null {
  const found = /(?:^|\()([01](?:\.\d+)?)\)?$/.exec(answer)?.[1];
  return found === undefined ? null : Number(found);
}

/** What a look back reads off the whole log: the five signals, and each question's and moment's yield. */
export function lookBackText(read: () => Iterable<Event>): string {
  const s = signalsOf(read());
  const ratio = ([count, total]: readonly [number, number]) => `${count} of ${total}`;
  const yields = yieldsOf(read()).map((y) => {
    const sizes = y.low + y.mid + y.high > 0 ? ` (${y.low} under 0.25, ${y.mid} between, ${y.high} over 0.7)` : "";
    const came = `acted on ${y.acted}, acknowledged ${y.acknowledged}, marked noise ${y.noise}, climbed ${y.climbed}`;
    return [
      `- ${y.name}: asked ${y.asked}${sizes}`,
      `past its threshold ${y.past}`,
      `attended ${y.attended}, passed ${y.passed}`,
      `attentions ${y.attentions}: ${came}`,
    ].join(" · ");
  });
  return [
    "The five signals, each a count of a total:",
    `- findings on a line or scope that already had one: ${ratio(s.repeatedFindings)}`,
    `- questions to the Human whose answer changed a plan or a brief: ${ratio(s.questionsThatChanged)}`,
    `- verdicts and failing checks followed by a send-back or an amended brief: ${ratio(s.reviewsThatChanged)}`,
    `- attentions left until they climbed: ${ratio(s.interventionsLate)}`,
    `- messages that asked for an answer and got none: ${ratio(s.unanswered)}`,
    "",
    "Each question and moment, by its answers and what came of them:",
    ...(yields.length > 0 ? yields : ["- none has an answer or an attention on the record"]),
  ].join("\n");
}

/** Who reads a scope's record: an owner above the work or one that watches it, or anyone else. */
export type RecordReader = "above" | "other";

/** A scope's history for the `record` read; what the watch told of the work is shown only to a reader above it. */
export function scopeRecordText(events: Iterable<Event>, scope: string, reader: RecordReader): string {
  const out: string[] = [];
  const findings = new Map<string, string[]>();
  const attentions = new Set<string>();
  const mine = (finding: string) => (findings.has(finding) ? [scope] : []);
  const told: string[] = [];
  const mineToo = (attention: string) => (attentions.has(attention) ? [scope] : []);
  for (const e of events) {
    if (!recordedIn(e, mine, mineToo).includes(scope)) continue;
    const done = doneTo(e, scope) ?? doneUnder(e, scope);
    if (done !== null) out.push(`${e.at} ${done}`);
    if ((e.type === "brief_issued" || e.type === "brief_amended") && e.scope === scope)
      out.push(
        `${e.at} brief v${e.brief.version}${e.type === "brief_amended" ? ` (${e.reason})` : ""}: ${e.brief.goal.text}`,
      );
    if (e.type === "finding_raised" && (e.finding.scope === scope || e.finding.about === scope))
      findings.set(e.finding.id, [`${e.finding.id} from ${e.finding.raisedBy}: ${e.finding.text}`]);
    if (e.type === "finding_classified") findings.get(e.finding)?.push(`  classified ${e.verdict}: ${e.reason}`);
    if (e.type === "finding_withdrawn") findings.get(e.finding)?.push(`  withdrawn: ${e.reason}`);
    if (e.type === "finding_reopened")
      findings.get(e.finding)?.push(`  reopened: ${e.text} (${e.evidence.join(", ")})`);
    if ("carries" in e && e.carries !== null)
      findings.get(e.carries)?.push(`  carried by ${e.type.replace(/_/g, " ")} (${e.by})`);
    if (e.type === "report_made" && e.scope === scope)
      out.push(
        [
          `${e.at} report:${e.sections.length > 0 ? "" : " nothing"}`,
          ...e.sections.map((s) => `  ${s.name}: ${s.lines.map((l) => l.text).join("; ")}`),
        ].join("\n"),
      );
    if (e.type === "attention_opened" && e.attention.about.scope === scope) {
      attentions.add(e.attention.id);
      told.push(`${e.at} attention ${e.attention.id} (${e.attention.moment}) to ${e.attention.to}`);
    }
    const came = cameOf(e);
    if (came && attentions.has(came.attention)) told.push(`${e.at} attention ${came.attention}: ${came.says}`);
    if (e.type === "attention_climbed" && e.to.about.scope === scope) attentions.add(e.to.id);
  }
  // The watched never learn they are watched (WATCH.md, Decided 6): what was told of the work is for those above it.
  if (reader === "above") out.push(...told);
  for (const lines of findings.values()) out.push(lines.join("\n"));
  return out.length > 0 ? out.join("\n") : `Nothing on the record for scope ${scope}.`;
}

/** What became of a scope opened under this one, as one line of this one's record. */
function doneUnder(e: Event, scope: string): string | null {
  switch (e.type) {
    case "scope_opened":
      return e.scope.parent === scope
        ? `scope ${e.scope.id} opened under it: a ${e.scope.role}${e.scope.paths.length > 0 ? ` on ${e.scope.paths.join(", ")}` : ""}`
        : null;
    case "integrated":
      return parentScopeId(e.scope) === scope ? `scope ${e.scope} integrated into it at ${e.sha}` : null;
    case "scope_dropped":
      return parentScopeId(e.scope) === scope ? `scope ${e.scope} dropped: ${e.reason}` : null;
    default:
      return null;
  }
}

/** What an event did to a scope, as one line of its record; null for an event that is not about it that way. */
function doneTo(e: Event, scope: string): string | null {
  switch (e.type) {
    case "handed_over":
      return e.from === scope || e.to === scope
        ? `${e.paths.join(", ")} moved from scope ${e.from} to scope ${e.to}: ${e.reason}`
        : null;
    case "scope_held":
    case "scope_resumed":
      return e.scope === scope ? `${e.type === "scope_held" ? "held" : "resumed"}: ${e.reason}` : null;
    case "reseated":
      return e.scope === scope ? `reseated, ${e.from ?? "nobody"} to ${e.to}: ${e.reason}` : null;
    case "claim_made":
      return e.claim.scope === scope ? `handed back ${e.claim.commit}: ${e.claim.text}` : null;
    case "sent_back":
      return e.scope === scope ? `sent back: ${e.reason}` : null;
    case "integrated":
      return e.scope === scope ? `integrated at ${e.sha}` : null;
    case "scope_dropped":
      return e.scope === scope ? `dropped: ${e.reason}` : null;
    default:
      return null;
  }
}
