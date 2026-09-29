import { type ActorId, HUMAN, type Party } from "../../contracts/ids.ts";
import type { Attention } from "../../contracts/ledger.ts";
import { ownerAbove } from "../authority.ts";
import { type Context, type Refusal, refuse } from "./context.ts";

/** A finding a change event says it carries: open, and answered by the caller (I8). */
export function carriedFinding(ctx: Context, id: string | null): Refusal | null {
  if (id === null) return null;
  const finding = ctx.state.findings.get(id);
  if (!finding) return refuse("unknown", `no finding ${id}`);
  if (finding.status !== "raised") return refuse("state", `finding ${id} is ${finding.status}`);
  if (answererOf(ctx, finding.answeredBy) !== ctx.party) return refuse("I8", `finding ${id} is not yours to answer`);
  return null;
}

/** Who answers what was addressed to a scope: its seated owner, the nearest owner seated above it, or the Human past an empty root (§4.4). */
export function answererOf(ctx: Context, scope: string): Party | null {
  return answeringScope(ctx, scope)?.answerer ?? null;
}

/** The scope whose owner answers, climbed past empty seats, with the answerer; the root answers through the Human when its seat is empty. */
export function answeringScope(ctx: Context, scope: string): { scope: string; answerer: Party } | null {
  for (let at: string | null = scope; at !== null; at = ctx.state.scopes.get(at)?.parent ?? null) {
    const s = ctx.state.scopes.get(at);
    if (!s) return null;
    if (s.owner !== null) return { scope: at, answerer: s.owner };
    if (s.parent === null) return { scope: at, answerer: HUMAN };
  }
  return null;
}

/** Ends a seat (announced as released unless `reason` is null, as for an agent gone): what the actor owed moves to `heir`, what waited for it too, and attentions it was sent climb. */
export function releaseSeat(
  ctx: Context,
  actor: ActorId,
  heir: Party,
  closing: ReadonlySet<string>,
  reason: string | null,
): void {
  if (reason !== null) ctx.emit({ type: "actor_released", actor, reason });
  closeAskedPermissions(ctx, actor);
  const closed = new Set(ctx.events.flatMap((e) => (e.type === "obligation_closed" ? [e.obligation] : [])));
  for (const o of ctx.state.obligations.values()) {
    if (o.owedBy !== actor || closed.has(o.id)) continue;
    if (o.about.kind === "candidate")
      ctx.emit({ type: "obligation_closed", obligation: o.id, how: "the agent it was offered to left" });
    else ctx.emit({ type: "obligation_moved", obligation: o.id, to: heir });
  }
  for (const m of ctx.state.messages.values())
    if (m.to === actor && m.delivered === null && (m.asks || m.directs))
      ctx.emit({ type: "message_moved", message: m.id, from: actor, to: heir });
  const gone = ctx.state.actors.get(actor);
  for (const t of ctx.state.attentions.values())
    if (t.to === actor && !closing.has(t.about.scope)) climb(ctx, t, gone ? ownerAbove(ctx.state, gone) : HUMAN);
}

/** What an actor asked leave for closes when it leaves its seat: the prompt that waited on the answer leaves with it. */
export function closeAskedPermissions(ctx: Context, actor: ActorId): void {
  for (const o of ctx.state.obligations.values())
    if (o.about.kind === "permission" && o.owedTo === actor)
      ctx.emit({ type: "obligation_closed", obligation: o.id, how: "its asker left" });
}

/** An attention left by its reader goes up one owner; past the root it stays in the Human's view (LEDGER.md §7). */
export function climb(ctx: Context, attention: Attention, to: Party | null): void {
  const next: Attention = {
    ...attention,
    id: ctx.next("attention"),
    to: to ?? HUMAN,
    delivered: null,
    climbedFrom: attention.id,
    facts: [...attention.facts, `${attention.to} did not act on it`],
  };
  ctx.emit({ type: "attention_climbed", attention: attention.id, to: next });
}
