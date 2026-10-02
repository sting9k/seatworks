import type { Event } from "../contracts/events.ts";

/** One line an event, for the Human's view of what happened; bookkeeping events say nothing (WATCH.md, While away). */
export function activityLine(e: Event): string | null {
  const who = e.by === "human" ? "the Human" : e.by === "bridge" ? "the ledger" : e.by;
  const at = e.at.slice(11, 16);
  const line = (text: string) => `${at} ${text}`;
  switch (e.type) {
    case "scope_opened":
      return line(
        `${who} opened scope ${e.scope.id} (${e.scope.role})${e.scope.paths.length ? ` on ${e.scope.paths.join(", ")}` : ""}`,
      );
    case "profile_taken":
      return line(`the project took its template's files anew (${e.profileHash})`);
    case "brief_amended":
      return line(`${who} amended scope ${e.scope}'s brief to v${e.brief.version}: ${e.reason}`);
    case "plan_amended":
      return line(`${who} amended scope ${e.scope}'s plan: ${e.reason}`);
    case "finding_raised":
      return line(`${who} raised ${e.finding.id} in scope ${e.finding.scope}: ${e.finding.text}`);
    case "finding_classified":
      return line(`${who} classified ${e.finding} as ${e.verdict}: ${e.reason}`);
    case "finding_withdrawn":
      return line(`${who} withdrew ${e.finding}: ${e.reason}`);
    case "claim_made":
      return line(`${who} handed back scope ${e.claim.scope} at ${e.claim.commit.slice(0, 8)}: ${e.claim.text}`);
    case "evidence_recorded":
      return line(
        `${e.evidence.kind} on ${e.evidence.subject.slice(0, 8)} for scope ${e.evidence.scope}: ${e.evidence.ok ? "ok" : "failing"}`,
      );
    case "integrated":
      return line(`scope ${e.scope} was integrated at ${e.sha.slice(0, 8)}`);
    case "integration_refused":
      return line(`scope ${e.scope} was not integrated: ${e.why}`);
    case "sent_back":
      return line(`${who} sent scope ${e.scope} back: ${e.reason}`);
    case "reseated":
      return line(`${who} reseated scope ${e.scope}: ${e.reason}`);
    case "scope_dropped":
      return line(`${who} dropped scope ${e.scope}: ${e.reason}`);
    case "scope_held":
    case "scope_resumed":
      return line(`${who} ${e.type === "scope_held" ? "held" : "resumed"} scope ${e.scope}: ${e.reason}`);
    case "report_made":
      return line(
        `${who} reported on scope ${e.scope}: ${e.decided.length} decided, ${e.assumed.length} assumed, ${e.open.length} open`,
      );
    case "question_asked":
      return line(`${who} asked you: ${e.question.text}`);
    case "question_answered":
      return line(`you answered ${e.question}`);
    case "actor_gone":
      return line(`${e.actor} is gone: ${e.why}`);
    case "turn_ended":
      return e.outcome === "failed" ? line(`${e.actor}'s turn failed: ${e.why ?? "no reason given"}`) : null;
    case "attention_climbed":
      return e.to.to === "human"
        ? line(`an attention about ${e.to.about.actor} (${e.to.moment}) reached you, not acted on above: ${e.to.why}`)
        : null;
    case "published":
    case "publish_refused":
      return line(
        e.type === "published"
          ? `published ${e.branch} to ${e.remote}`
          : `publishing ${e.branch} was refused: ${e.why}`,
      );
    case "machine_held":
      return line(`${e.actor} holds the machine: ${e.why}`);
    default:
      return null;
  }
}
