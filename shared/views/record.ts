import type { Event } from "../contracts/events.ts";

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
    for (const c of commits.get(scope) ?? []) {
      changedReviews += reviews.get(c) ?? 0;
      reviews.delete(c);
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

/** The scopes whose record an event is read in; `ofFinding` gives those a finding was raised in and about. */
export function recordedIn(e: Event, ofFinding: (finding: string) => readonly string[]): readonly string[] {
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
    case "integrated":
    case "scope_dropped":
    case "report_made":
      return [e.scope, ...carried];
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
    default:
      return carried;
  }
}

/** A scope's history for the `record` read: its briefs, what was done to it, its hand-backs, findings and reports. */
export function scopeRecordText(events: Iterable<Event>, scope: string): string {
  const out: string[] = [];
  const findings = new Map<string, string[]>();
  const mine = (finding: string) => (findings.has(finding) ? [scope] : []);
  for (const e of events) {
    if (!recordedIn(e, mine).includes(scope)) continue;
    const done = doneTo(e, scope);
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
    if (e.type === "attention_opened" && e.attention.about.scope === scope)
      out.push(`${e.at} attention ${e.attention.id} (${e.attention.moment}) to ${e.attention.to}`);
  }
  for (const lines of findings.values()) out.push(lines.join("\n"));
  return out.length > 0 ? out.join("\n") : `Nothing on the record for scope ${scope}.`;
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
