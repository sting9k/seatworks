import { HUMAN, ROOT } from "../contracts/ids.ts";
import type { Line } from "../contracts/ledger.ts";
import type { State } from "../kernel/state.ts";
import type { HumanView } from "../contracts/rpc.ts";

/** What the Human needs to know (KERNEL.md §8, CONCEPT-V2 §9.2), from the state: nothing summarised by a model. */
export function humanView(state: State): HumanView {
  const owed = [...state.obligations.values()].filter((o) => o.owedBy === HUMAN);
  const root = state.scopes.get(ROOT);
  const decisions: HumanView["decisions"] = [];
  const agentLines = (scope: string, lines: readonly Line[]) => {
    for (const l of lines) if (l.origin !== HUMAN) decisions.push({ scope, line: l.id, text: l.text, by: l.origin });
  };
  if (root?.plan)
    agentLines(ROOT, [
      root.plan.goal,
      ...root.plan.limits,
      ...root.plan.unknowns.map((u) => u.line),
      root.plan.appetite.line,
      ...root.plan.terms.map((t) => t.line),
    ]);
  const lanes = [...state.scopes.values()].filter((s) => s.parent === ROOT);
  for (const lane of lanes) if (lane.brief) agentLines(lane.id, lane.brief.choices);
  return {
    questions: [...state.questions.values()].map((q) => ({
      id: q.id,
      from: q.from,
      text: q.text,
      options: [...q.options],
      recommend: q.recommend,
    })),
    permissions: owed
      .filter((o) => o.about.kind === "permission")
      .flatMap((o) => {
        const p = state.permissions.get(o.about.id);
        return p ? [{ id: p.id, actor: p.actor, text: p.text }] : [];
      }),
    claims: owed
      .filter((o) => o.about.kind === "claim")
      .flatMap((o) => {
        const c = state.claims.get(o.about.id);
        return c ? [{ scope: c.scope, by: c.by, text: c.text, commit: c.commit }] : [];
      }),
    remote: state.project?.remote ?? null,
    attentions: [...state.attentions.values()]
      .filter((t) => t.to === HUMAN)
      .map((t) => ({ id: t.id, actor: t.about.actor, scope: t.about.scope, why: t.why, facts: [...t.facts] })),
    disagreements: [...state.findings.values()]
      .filter((f) => f.status === "raised" || f.status === "waiting" || f.status === "kept")
      .map((f) => ({
        id: f.id,
        scope: f.scope,
        raisedBy: f.raisedBy,
        text: f.text,
        status: f.status,
        reason: f.reason,
      })),
    decisions,
    directions: [...state.obligations.values()]
      .filter((o) => o.about.kind === "direction" && o.owedTo === HUMAN)
      .map((o) => {
        const m = state.messages.get(o.about.id);
        return { message: o.about.id, text: m?.text ?? "", to: m?.to ?? "", owedBy: o.owedBy };
      }),
    lanes: lanes.map((s) => ({
      scope: s.id,
      owner: s.owner,
      role: s.role,
      goal: s.brief?.goal.text ?? null,
      status: s.integrating ? "integrating" : s.claim ? "handed back" : s.status,
      held: s.held,
      owes:
        [...state.obligations.values()].filter((o) => s.owner !== null && o.owedBy === s.owner).length +
        [...state.attentions.values()].filter((t) => s.owner !== null && t.to === s.owner).length,
    })),
    spent: {
      usd: root?.spent.usd ?? 0,
      tokens: root?.spent.tokens ?? 0,
      appetiteUsd: root?.plan?.appetite.usd ?? null,
    },
    root: root ? { role: root.role, owner: root.owner } : null,
  };
}
