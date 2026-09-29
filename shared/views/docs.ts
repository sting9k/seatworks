import type { Event } from "../contracts/events.ts";
import { HUMAN, ROOT } from "../contracts/ids.ts";
import type { Line, Plan } from "../contracts/ledger.ts";
import type { State } from "../kernel/state.ts";

/**
 * The project's docs as the record holds them, written into its repository so they go with it: every agent reads them
 * before it plans, and they stay when the team is gone. Each is an index of what was settled, never a second store.
 */

const by = (l: Line) => (l.origin === HUMAN ? "the Human" : l.origin);

/** The words of the project's domain as they were settled, in the glossary's form; none until one is. */
export function glossaryText(plan: Plan | null): string | null {
  if (!plan || plan.terms.length === 0) return null;
  const terms = [...plan.terms].sort((a, b) => a.name.localeCompare(b.name));
  return [
    "## Settled with the team",
    "",
    ...terms.flatMap((t) => [
      `**${t.name}**:`,
      `${t.line.text} (${by(t.line)})`,
      ...(t.avoid.length > 0 ? [`_Avoid_: ${t.avoid.join(", ")}`] : []),
      "",
    ]),
  ]
    .join("\n")
    .trimEnd();
}

type Weighed = { id: string; text: string; by: string; verdict: string | null; reason: string | null };

type Landed = {
  scope: string;
  goal: string;
  sha: string;
  at: string;
  decided: string[];
  assumed: string[];
  open: string[];
  weighed: Weighed[];
};

/** How the owner above weighed a finding, in words a reader outside the team follows. */
const VERDICT: Record<string, string> = {
  changes: "changed the plan",
  alternative: "another sound option; the plan was kept",
  minor: "not worth stopping for",
};

/**
 * The project's map: where it is going, what the Human made must hold apart from what the team chose so far, what is
 * not yet known, each lane landed with its owner's report beside every finding raised in it and how it was weighed,
 * and what is still in dispute. A choice is listed as one, open to question on evidence, so no later lane takes it for
 * a requirement. None until the root has a plan.
 */
export function mapText(events: Iterable<Event>, state: State): string | null {
  const plan = state.scopes.get(ROOT)?.plan;
  if (!plan) return null;
  const goals = new Map<string, string>();
  const parents = new Map<string, string | null>();
  const reports = new Map<string, { decided: string[]; assumed: string[]; open: string[] }>();
  const findings = new Map<string, Weighed & { scope: string }>();
  const landed: Landed[] = [];
  const laneOf = (scope: string): string | null => {
    for (let at: string | null = scope; at !== null; at = parents.get(at) ?? null)
      if (parents.get(at) === ROOT) return at;
    return null;
  };
  for (const e of events) {
    if (e.type === "scope_opened") parents.set(e.scope.id, e.scope.parent);
    if (e.type === "brief_issued" || e.type === "brief_amended") goals.set(e.scope, e.brief.goal.text);
    if (e.type === "report_made")
      reports.set(e.scope, {
        decided: e.decided.map((l) => l.text),
        assumed: e.assumed.map((l) => l.text),
        open: e.open.map((l) => l.text),
      });
    if (e.type === "finding_raised")
      findings.set(e.finding.id, {
        id: e.finding.id,
        scope: e.finding.scope,
        text: e.finding.text,
        by: e.finding.raisedBy,
        verdict: null,
        reason: null,
      });
    if (e.type === "finding_classified") {
      const f = findings.get(e.finding);
      if (f) findings.set(e.finding, { ...f, verdict: VERDICT[e.verdict] ?? e.verdict, reason: e.reason });
    }
    if (e.type === "finding_reopened") {
      const f = findings.get(e.finding);
      if (f) findings.set(e.finding, { ...f, verdict: null, reason: null });
    }
    if (e.type === "finding_withdrawn") {
      const f = findings.get(e.finding);
      if (f) findings.set(e.finding, { ...f, verdict: "withdrawn by whoever raised it", reason: e.reason });
    }
    if (e.type === "integrated" && parents.get(e.scope) === ROOT)
      landed.push({
        scope: e.scope,
        goal: goals.get(e.scope) ?? "",
        sha: e.sha.slice(0, 12),
        at: e.at.slice(0, 10),
        ...(reports.get(e.scope) ?? { decided: [], assumed: [], open: [] }),
        weighed: [...findings.values()].filter((f) => laneOf(f.scope) === e.scope),
      });
  }
  const disputed = [...state.findings.values()].filter((f) => f.status === "raised" || f.status === "waiting");
  const list = (items: readonly string[]) => items.map((i) => `- ${i}`);
  const humans = plan.limits.filter((l) => l.origin === HUMAN);
  const chosen = plan.limits.filter((l) => l.origin !== HUMAN);
  return [
    "## Destination",
    "",
    `${plan.goal.text} (${by(plan.goal)})`,
    "",
    "## Must hold, as the Human set it",
    "",
    ...list(humans.map((l) => l.text)),
    `- Appetite: ${plan.appetite.line.text} (${by(plan.appetite.line)})`,
    "",
    "## Chosen so far, open to question on evidence",
    "",
    ...(chosen.length > 0 ? list(chosen.map((l) => `${l.text} (${by(l)})`)) : ["Nothing yet."]),
    "",
    "## Not yet known",
    "",
    ...(plan.unknowns.length > 0
      ? list(plan.unknowns.map((u) => `${u.line.text}; checked by ${u.check}`))
      : ["Nothing open."]),
    "",
    "## Lanes landed",
    "",
    ...(landed.length > 0
      ? landed.flatMap((l) => [
          `### ${l.scope}: ${l.goal}`,
          "",
          `Landed ${l.sha} on ${l.at}.`,
          ...(l.decided.length > 0
            ? ["", "Decided by its owner, open to question on evidence:", ...list(l.decided)]
            : []),
          ...(l.assumed.length > 0 ? ["", "Assumed, not yet checked:", ...list(l.assumed)] : []),
          ...(l.open.length > 0 ? ["", "Left open:", ...list(l.open)] : []),
          ...(l.weighed.length > 0
            ? [
                "",
                "Findings raised in it:",
                ...list(
                  l.weighed.map(
                    (f) =>
                      `${f.id} by ${f.by}: ${f.text} → ${f.verdict ?? "not weighed"}${f.reason ? `: ${f.reason}` : ""}`,
                  ),
                ),
              ]
            : []),
          "",
        ])
      : ["No lane has landed yet.", ""]),
    "## Still in dispute",
    "",
    ...(disputed.length > 0
      ? list(disputed.map((f) => `${f.id} in ${f.scope}: ${f.text} (${f.status})`))
      : ["Nothing."]),
  ]
    .join("\n")
    .trimEnd();
}
