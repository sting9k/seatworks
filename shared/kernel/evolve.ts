import type { Event, EventBody } from "../contracts/events.ts";
import { ID_PREFIX, ROOT, type IdKind } from "../contracts/ids.ts";
import type { Actor, Finding, Scope } from "../contracts/ledger.ts";
import { prune } from "./prune.ts";
import { type State, withEntry, without } from "./state.ts";

/** Folds one event into the state. It cannot refuse: the event already happened (CORE.md). */
export function evolve(state: State, event: Event): State {
  return apply({ ...state, seq: event.seq }, event, event.at);
}

/** Folds one command's events, then prunes: nothing is let go between two events of one decision. */
export function foldCommand(state: State, events: readonly Event[]): State {
  return prune(events.reduce(evolve, state));
}

/** Folds events `decide` just made, before the shell stamps them: for the invariant check after a command. */
export function evolveAll(state: State, bodies: readonly EventBody[]): State {
  let next = state;
  for (const body of bodies) next = evolve(next, { ...body, seq: next.seq + 1, at: "", by: "", commandId: "" });
  return prune(next);
}

function apply(s: State, e: Event, at: string): State {
  switch (e.type) {
    case "project_opened":
      return {
        ...s,
        project: { base: e.base, remote: e.remote, profile: e.profile, profileHash: e.profileHash, checks: [] },
      };
    case "profile_taken":
      return s.project ? { ...s, project: { ...s.project, profileHash: e.profileHash } } : s;
    case "scope_opened": {
      const parent = e.scope.parent === null ? undefined : s.scopes.get(e.scope.parent);
      const scopes = parent ? withEntry(s.scopes, parent.id, { ...parent, children: parent.children + 1 }) : s.scopes;
      return { ...s, scopes: withEntry(scopes, e.scope.id, e.scope) };
    }
    case "actor_seated": {
      const actor: Actor = {
        id: e.actor,
        role: e.role,
        scope: e.scope,
        model: e.model,
        host: null,
        tools: false,
        status: "seated",
        turns: 0,
        tokens: 0,
        usd: 0,
        reported: { tokens: 0, usd: 0 },
        seen: 0,
        resent: false,
        startedAt: at,
      };
      return counted({ ...s, actors: withEntry(s.actors, e.actor, actor) }, "actor", e.actor);
    }
    case "workspace_ready":
      return scope(s, e.scope, (x) => ({ ...x, workspace: "ready", branch: e.branch, head: e.head }));
    case "workspace_failed":
      return scope(s, e.scope, (x) => ({ ...x, workspace: "failed" }));
    case "agent_started":
      return actor(s, e.actor, (a) => ({ ...a, host: e.host }));
    case "tools_reached":
      return actor(s, e.actor, (a) => ({ ...a, tools: true }));
    case "brief_issued":
      return linesCounted(
        scope(s, e.scope, (x) => ({ ...x, brief: e.brief })),
        e,
      );
    case "brief_amended":
      return carry(
        linesCounted(
          scope(s, e.scope, (x) => ({ ...x, brief: e.brief })),
          e,
        ),
        e.carries,
        e.seq,
      );
    case "plan_set":
      return linesCounted(
        scope(s, e.scope, (x) => ({ ...x, plan: e.plan })),
        e,
      );
    case "plan_amended":
      return carry(
        linesCounted(
          scope(s, e.scope, (x) => ({ ...x, plan: e.plan })),
          e,
        ),
        e.carries,
        e.seq,
      );
    case "edge_added":
      return carry(
        scope(s, e.scope, (x) => ({ ...x, [e.edge]: [...x[e.edge], e.target] })),
        e.carries,
        e.seq,
      );
    case "edge_removed":
      return carry(
        scope(s, e.scope, (x) => ({ ...x, [e.edge]: x[e.edge].filter((t) => t !== e.target) })),
        e.carries,
        e.seq,
      );
    case "handed_over": {
      const moved = new Set(e.paths);
      const out = scope(s, e.from, (x) => ({ ...x, paths: x.paths.filter((p) => !moved.has(p)) }));
      return carry(
        scope(out, e.to, (x) => ({ ...x, paths: [...x.paths, ...e.paths] })),
        e.carries,
        e.seq,
      );
    }
    case "finding_raised":
      return counted(
        { ...s, findings: withEntry(s.findings, e.finding.id, { ...e.finding, raisedAt: e.seq }) },
        "finding",
        e.finding.id,
      );
    case "finding_classified":
      return finding(s, e.finding, (f) => ({
        ...f,
        status: e.verdict === "changes" ? "carried" : "kept",
        verdict: e.verdict,
        reason: e.reason,
      }));
    case "finding_waiting":
      return finding(s, e.finding, (f) => ({ ...f, status: "waiting", question: e.question }));
    case "finding_resumed":
      return finding(s, e.finding, (f) => ({ ...f, status: "raised" }));
    case "finding_reopened":
      return finding(s, e.finding, (f) => ({
        ...f,
        status: "raised",
        verdict: null,
        reason: null,
        carriedBy: [],
        raisedAt: e.seq,
        evidence: [...f.evidence, ...e.evidence],
      }));
    case "finding_withdrawn":
      return finding(s, e.finding, (f) => ({ ...f, status: "withdrawn", reason: e.reason }));
    case "claim_made": {
      const next = scope({ ...s, claims: withEntry(s.claims, e.claim.id, e.claim) }, e.claim.scope, (x) => ({
        ...x,
        claim: e.claim.id,
        candidate: null,
      }));
      return counted(next, "claim", e.claim.id);
    }
    case "candidate_ready":
      return scope(s, e.scope, (x) => ({
        ...x,
        candidate: { commit: e.commit, candidate: e.candidate, parentHead: e.parentHead },
      }));
    case "candidate_conflict":
      return scope(s, e.scope, (x) => ({ ...x, candidate: null }));
    case "evidence_requested":
      return { ...s, checksAsked: withEntry(s.checksAsked, `${e.scope}:${e.subject}`, e.by) };
    case "evidence_recorded":
      return counted(
        {
          ...s,
          evidence: withEntry(s.evidence, e.evidence.id, e.evidence),
          checksAsked: without(s.checksAsked, `${e.evidence.scope}:${e.evidence.subject}`),
        },
        "evidence",
        e.evidence.id,
      );
    case "integration_started":
      return scope(s, e.scope, (x) => ({ ...x, integrating: true }));
    case "integrated": {
      const done = scope(s, e.scope, (x) => ({ ...x, integrating: false, status: "integrated" }));
      const parent = done.scopes.get(e.scope)?.parent ?? null;
      return parent === null ? done : scope(done, parent, (x) => ({ ...x, head: e.sha }));
    }
    case "integration_refused":
      // Over a parent that moved the candidate is stale; refused for anything else, it is still what would go in.
      return scope(s, e.scope, (x) => ({
        ...x,
        integrating: false,
        candidate: e.why === "moved" ? null : x.candidate,
      }));
    case "sent_back":
      return scope(s, e.scope, (x) => ({ ...x, claim: null, candidate: null }));
    case "reseated": {
      const left =
        e.from === null
          ? s
          : actor(s, e.from, (a) => ({ ...a, status: a.status === "seated" ? "released" : a.status }));
      const attentions = new Map(left.attentions);
      for (const t of left.attentions.values())
        if (e.from !== null && t.to === e.from) attentions.set(t.id, { ...t, to: e.to, delivered: null });
      // A copy that could not be made is asked for again with the new seat: nothing else would ask.
      return scope({ ...left, attentions }, e.scope, (x) => ({
        ...x,
        owner: e.to,
        writer: x.writes ? e.to : null,
        workspace: x.workspace === "failed" ? "pending" : x.workspace,
      }));
    }
    case "scope_dropped": {
      const next = scope(s, e.scope, (x) => ({ ...x, status: "dropped", integrating: false }));
      const asked = new Map(next.checksAsked);
      for (const key of asked.keys()) if (key.startsWith(`${e.scope}:`)) asked.delete(key);
      return { ...next, checksAsked: asked };
    }
    case "scope_held":
      return scope(s, e.scope, (x) => ({ ...x, held: true }));
    case "scope_resumed":
      return scope(s, e.scope, (x) => ({ ...x, held: false }));
    case "report_made":
      return linesCounted(s, e);
    case "message_sent": {
      // Words the Human typed into a chat were delivered by Paseo; words to the Human are read on their surface.
      const m = !e.message.queued || e.message.to === "human" ? { ...e.message, delivered: at } : e.message;
      const humanWords = m.from === "human" ? new Set([...s.humanWords, m.id]) : s.humanWords;
      const messages = m.replyTo === null ? s.messages : answered(s.messages, m.replyTo);
      return counted({ ...s, humanWords, messages: withEntry(messages, m.id, m) }, "message", m.id);
    }
    case "message_delivered":
      return message(s, e.message, (m) => ({ ...m, delivered: e.at }));
    case "message_moved":
      return message(s, e.message, (m) => ({ ...m, to: e.to, delivered: null }));
    case "question_asked":
      return counted({ ...s, questions: withEntry(s.questions, e.question.id, e.question) }, "question", e.question.id);
    case "question_answered":
      return { ...s, questions: without(s.questions, e.question), humanWords: new Set([...s.humanWords, e.question]) };
    case "obligation_opened":
      return counted(
        { ...s, obligations: withEntry(s.obligations, e.obligation.id, e.obligation) },
        "obligation",
        e.obligation.id,
      );
    case "obligation_closed":
      return { ...s, obligations: without(s.obligations, e.obligation) };
    case "obligation_moved": {
      const o = s.obligations.get(e.obligation);
      return o ? { ...s, obligations: withEntry(s.obligations, o.id, { ...o, owedBy: e.to }) } : s;
    }
    case "machine_held":
      return { ...s, machineHeldBy: e.actor };
    case "machine_released":
      return { ...s, machineHeldBy: null };
    case "actor_released":
      return vacate(
        actor(s, e.actor, (a) => ({ ...a, status: "released" })),
        e.actor,
      );
    case "actor_gone":
      return vacate(
        actor(s, e.actor, (a) => ({ ...a, status: "gone" })),
        e.actor,
      );
    case "turn_ended": {
      const next = actor(s, e.actor, (a) => ({
        ...a,
        turns: a.turns + 1,
        tokens: a.tokens + e.tokens,
        usd: a.usd + e.usd,
        reported: { tokens: e.tokensSoFar, usd: e.usdSoFar },
        seen: e.seen,
        resent: e.again !== null,
      }));
      const scopes = new Map(next.scopes);
      for (let at = next.actors.get(e.actor)?.scope ?? null; at !== null; at = scopes.get(at)?.parent ?? null) {
        const x = scopes.get(at);
        if (x) scopes.set(at, { ...x, spent: { usd: x.spent.usd + e.usd, tokens: x.spent.tokens + e.tokens } });
      }
      return { ...next, scopes };
    }
    case "checks_set":
      return s.project ? { ...s, project: { ...s.project, checks: e.checks } } : s;
    case "publish_requested":
      return s.project ? { ...s, project: { ...s.project, remote: e.remote } } : s;
    case "published":
      return scope(s, ROOT, (x) => ({ ...x, head: e.sha }));
    case "publish_refused":
      return e.found === null ? s : scope(s, ROOT, (x) => ({ ...x, head: e.found }));
    case "permission_asked":
      return counted(
        { ...s, permissions: withEntry(s.permissions, e.permission.id, e.permission) },
        "permission",
        e.permission.id,
      );
    case "permission_answered":
    case "permission_settled":
      return { ...s, permissions: without(s.permissions, e.permission) };
    case "observation_made":
      return counted(s, "observation", e.observation.id);
    case "attention_opened":
      return counted(
        { ...s, attentions: withEntry(s.attentions, e.attention.id, e.attention) },
        "attention",
        e.attention.id,
      );
    case "attention_delivered": {
      const t = s.attentions.get(e.attention);
      return t ? { ...s, attentions: withEntry(s.attentions, t.id, { ...t, delivered: e.at }) } : s;
    }
    case "attention_acted":
    case "acknowledged":
      return { ...s, attentions: without(s.attentions, e.attention) };
    case "noise_marked":
      return { ...s, attentions: without(s.attentions, e.attention), noise: new Set([...s.noise, e.key]) };
    case "attention_climbed": {
      // Past the root an attention stops with the Human, whose view shows it until they settle it.
      return counted(
        { ...s, attentions: withEntry(without(s.attentions, e.attention), e.to.id, e.to) },
        "attention",
        e.to.id,
      );
    }
    case "attended":
    case "passed":
      return s;
  }
}

function scope(s: State, id: string, change: (scope: Scope) => Scope): State {
  const found = s.scopes.get(id);
  return found ? { ...s, scopes: withEntry(s.scopes, id, change(found)) } : s;
}

function actor(s: State, id: string, change: (actor: Actor) => Actor): State {
  const found = s.actors.get(id);
  return found ? { ...s, actors: withEntry(s.actors, id, change(found)) } : s;
}

function finding(s: State, id: string, change: (finding: Finding) => Finding): State {
  const found = s.findings.get(id);
  return found ? { ...s, findings: withEntry(s.findings, id, change(found)) } : s;
}

function message(
  s: State,
  id: string,
  change: (m: NonNullable<ReturnType<State["messages"]["get"]>>) => NonNullable<ReturnType<State["messages"]["get"]>>,
): State {
  const found = s.messages.get(id);
  return found ? { ...s, messages: withEntry(s.messages, id, change(found)) } : s;
}

function answered(messages: State["messages"], id: string): State["messages"] {
  const m = messages.get(id);
  return m ? withEntry(messages, id, { ...m, answered: true }) : messages;
}

/** A released or gone actor leaves its scope with no owner until a reseat. */
function vacate(s: State, actorId: string): State {
  const a = s.actors.get(actorId);
  if (!a) return s;
  return scope(s, a.scope, (x) => (x.owner === actorId ? { ...x, owner: null, writer: null } : x));
}

/** A change event that carries a finding is recorded on it, for I8. */
function carry(s: State, findingId: string | null, seq: number): State {
  return findingId === null ? s : finding(s, findingId, (f) => ({ ...f, carriedBy: [...f.carriedBy, seq] }));
}

/** Advances a counter past an id seen in an event, so the fold hands out the same ids `decide` did. */
function counted(s: State, kind: IdKind, id: string): State {
  const n = Number(id.slice(ID_PREFIX[kind].length));
  return Number.isInteger(n) && n > s.counters[kind] ? { ...s, counters: { ...s.counters, [kind]: n } } : s;
}

function linesCounted(s: State, e: Event): State {
  let top = s.counters.line;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.origin === "string") top = Math.max(top, Number(o.id.slice(1)) || 0);
      Object.values(o).forEach(visit);
    }
  };
  visit(e);
  return top > s.counters.line ? { ...s, counters: { ...s.counters, line: top } } : s;
}
