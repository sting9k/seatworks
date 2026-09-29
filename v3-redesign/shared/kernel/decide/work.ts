import type { CommandBody } from "../../contracts/commands.ts";
import { BRIDGE, HUMAN, ROOT } from "../../contracts/ids.ts";
import type { Evidence, Scope } from "../../contracts/ledger.ts";
import { descendants, ownerOfParent } from "../authority.ts";
import { releaseSeat } from "./seats.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";
import { closeAbout } from "./findings.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

function scopeNamed(ctx: Context, id: string): Scope | Refusal {
  return ctx.state.scopes.get(id) ?? refuse("unknown", `no scope ${id}`);
}

export function handBack(ctx: Of<"hand_back">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  const scope = scopeNamed(ctx, me.actor.scope);
  if (isRefusal(scope)) return scope;
  const delegates = ctx.profile.roles.get(scope.role)?.delegates === true;
  if (scope.writer !== me.actor.id && !(delegates && scope.owner === me.actor.id))
    return refuse("I5", "only a scope's writer, or the owner of a scope that delegates, hands its work back");
  if (scope.status !== "open") return refuse("state", `scope ${scope.id} is ${scope.status}`);
  if (scope.integrating) return refuse("state", `scope ${scope.id} is being integrated`);
  const integrator = ownerOfParent(ctx.state, scope);
  if (integrator === null) return refuse("state", `nobody owns scope ${scope.id}'s parent to integrate it`);
  if (scope.claim !== null) closeAbout(ctx, "claim", scope.claim, "a newer claim");
  const id = ctx.next("claim");
  ctx.emit({
    type: "claim_made",
    claim: {
      id,
      scope: scope.id,
      by: me.actor.id,
      commit: ctx.body.commit,
      text: ctx.body.text,
      behaviours: ctx.body.behaviours,
    },
  });
  ctx.emit({
    type: "obligation_opened",
    obligation: {
      id: ctx.next("obligation"),
      owedBy: integrator,
      owedTo: me.actor.id,
      about: { kind: "claim", id },
      opened: ctx.at,
    },
  });
  return undefined;
}

export function recordVerdict(ctx: Of<"record_verdict">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  const scope = scopeNamed(ctx, me.actor.scope);
  if (isRefusal(scope)) return scope;
  if (scope.kind !== "reading" || scope.commit === null)
    return refuse("authority", "only a reading scope records a verdict");
  addEvidence(ctx, {
    scope: scope.id,
    kind: "verdict",
    subject: scope.commit,
    ok: ctx.body.ok,
    by: me.actor.id,
    summary: ctx.body.text,
    steps: [],
    heldMachine: false,
  });
  return undefined;
}

export function runChecks(ctx: Of<"run_checks">): Refusal | undefined {
  const scope = scopeNamed(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (ownerOfParent(ctx.state, scope) !== ctx.party && scope.writer !== ctx.party)
    return refuse("authority", `only scope ${scope.id}'s writer or its parent's owner runs checks on it`);
  const steps = ctx.body.steps ?? ctx.state.project?.checks ?? [];
  if (steps.length === 0) return refuse("state", "the project has no checks set, and none were named");
  ctx.emit({ type: "evidence_requested", scope: scope.id, subject: ctx.body.commit, steps });
  return undefined;
}

export function integrate(ctx: Of<"integrate">): Refusal | undefined {
  const scope = scopeNamed(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (ownerOfParent(ctx.state, scope) !== ctx.party || scope.parent === null)
    return refuse("authority", `only the owner of scope ${scope.id}'s parent integrates it`);
  if (scope.status !== "open") return refuse("state", `scope ${scope.id} is ${scope.status}`);
  if (scope.held) return refuse("state", `scope ${scope.id} is held: nothing is integrated from it`);
  if (scope.integrating) return refuse("state", `scope ${scope.id} is being integrated`);
  const open = [...ctx.state.scopes.values()]
    .filter((c) => c.parent === scope.id && c.status === "open")
    .map((c) => c.id);
  if (open.length > 0)
    return refuse("state", `scope ${scope.id} has open children (${open.join(", ")}): integrate or drop them first`);
  const candidate = scope.candidate;
  if (candidate === null) return refuse("I4", `scope ${scope.id} has no candidate commit: its writer hands back first`);
  const cited: Evidence[] = [];
  for (const id of ctx.body.evidence) {
    const e = ctx.state.evidence.get(id);
    if (!e) return refuse("unknown", `no evidence ${id}`);
    if (e.subject !== candidate.candidate)
      return refuse(
        "I4",
        `evidence ${id} is on ${e.subject}, not on ${candidate.candidate}, the commit being integrated`,
      );
    cited.push(e);
  }
  if (cited.some((e) => !e.ok) && ctx.body.reason === null)
    return refuse("I4", "a failing result is integrated only with a reason");
  ctx.emit({
    type: "integration_started",
    scope: scope.id,
    candidate: candidate.candidate,
    parentHead: candidate.parentHead,
    evidence: ctx.body.evidence,
    reason: ctx.body.reason,
  });
  return undefined;
}

export function sendBack(ctx: Of<"send_back">): Refusal | undefined {
  const scope = scopeNamed(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (ownerOfParent(ctx.state, scope) !== ctx.party)
    return refuse("authority", `only the owner of scope ${scope.id}'s parent sends it back`);
  if (scope.claim === null) return refuse("state", `scope ${scope.id} has handed nothing back`);
  ctx.emit({ type: "sent_back", scope: scope.id, reason: ctx.body.reason });
  closeAbout(ctx, "claim", scope.claim, "sent back");
  return undefined;
}

export function setChecks(ctx: Of<"set_checks">): Refusal | undefined {
  const root = ctx.state.scopes.get(ROOT);
  if (ctx.party !== HUMAN && root?.owner !== ctx.party)
    return refuse("authority", "only the root's owner or the Human sets the checks");
  ctx.emit({ type: "checks_set", checks: ctx.body.checks });
  return undefined;
}

export function publish(ctx: Of<"publish">): Refusal | undefined {
  const root = ctx.state.scopes.get(ROOT);
  if (!root?.branch) return refuse("state", "the project is not open");
  if (ctx.party !== HUMAN && root.owner !== ctx.party)
    return refuse("authority", "only the root's owner or the Human publishes");
  ctx.emit({ type: "publish_requested", remote: ctx.body.remote, branch: root.branch });
  return undefined;
}

export function candidateFact(ctx: Of<"record_candidate">): Refusal | undefined {
  const scope = scopeNamed(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  const claim = scope.claim === null ? undefined : ctx.state.claims.get(scope.claim);
  if (!claim || claim.commit !== ctx.body.commit || scope.status !== "open") return undefined;
  const r = ctx.body.result;
  if ("conflict" in r)
    ctx.emit({ type: "candidate_conflict", scope: scope.id, commit: ctx.body.commit, paths: r.conflict });
  else
    ctx.emit({
      type: "candidate_ready",
      scope: scope.id,
      commit: ctx.body.commit,
      candidate: r.candidate,
      parentHead: r.parentHead,
    });
  return undefined;
}

export function evidenceFact(ctx: Of<"record_evidence">): Refusal | undefined {
  if (!ctx.state.scopes.has(ctx.body.scope)) return undefined;
  const b = ctx.body;
  addEvidence(ctx, {
    scope: b.scope,
    kind: "check",
    subject: b.subject,
    ok: b.ok,
    by: BRIDGE,
    summary: b.summary,
    steps: b.steps,
    heldMachine: b.heldMachine,
  });
  return undefined;
}

export function integrationFact(ctx: Of<"record_integration">): Refusal | undefined {
  const scope = ctx.state.scopes.get(ctx.body.scope);
  if (!scope?.integrating) return undefined;
  const r = ctx.body.result;
  if ("refused" in r) {
    ctx.emit({ type: "integration_refused", scope: scope.id, why: r.refused });
    return undefined;
  }
  ctx.emit({ type: "integrated", scope: scope.id, sha: r.sha });
  if (scope.claim !== null) closeAbout(ctx, "claim", scope.claim, "integrated");
  const heir = ownerOfParent(ctx.state, scope) ?? HUMAN;
  for (const s of [scope, ...descendants(ctx.state, scope.id)])
    if (s.owner !== null && ctx.state.actors.get(s.owner)?.status === "seated")
      releaseSeat(ctx, s.owner, heir, new Set(), `scope ${scope.id} integrated`);
  return undefined;
}

export function publishFact(ctx: Of<"record_publish">): Refusal | undefined {
  const root = ctx.state.scopes.get(ROOT);
  const remote = ctx.state.project?.remote ?? "";
  const branch = root?.branch ?? "";
  const r = ctx.body.result;
  if ("refused" in r) ctx.emit({ type: "publish_refused", remote, branch, why: r.refused });
  else ctx.emit({ type: "published", remote, branch, sha: r.sha });
  return undefined;
}

export function workspaceFact(ctx: Of<"record_workspace">): Refusal | undefined {
  const scope = ctx.state.scopes.get(ctx.body.scope);
  if (scope?.workspace !== "pending") return undefined;
  if (ctx.body.ok)
    ctx.emit({ type: "workspace_ready", scope: scope.id, branch: ctx.body.branch ?? scope.branch ?? "" });
  else ctx.emit({ type: "workspace_failed", scope: scope.id, why: ctx.body.why ?? "unknown" });
  return undefined;
}

function addEvidence(ctx: Context, e: Omit<Evidence, "id">): void {
  ctx.emit({ type: "evidence_recorded", evidence: { id: ctx.next("evidence"), ...e } });
}
