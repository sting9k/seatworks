import type { CommandBody } from "../../contracts/commands.ts";
import { HUMAN } from "../../contracts/ids.ts";
import { ownerAbove, ownerOfParent } from "../authority.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";
import { climb, releaseSeat } from "./seats.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

export function agentFact(ctx: Of<"record_agent">): Refusal | undefined {
  const actor = ctx.state.actors.get(ctx.body.actor);
  if (actor?.status === "seated" && actor.host === null)
    ctx.emit({ type: "agent_started", actor: actor.id, host: ctx.body.host });
  return undefined;
}

/** A turn's end: what it spent, and every attention its reader was sent and left, which climbs (LEDGER.md §7). */
export function turnFact(ctx: Of<"record_turn">): Refusal | undefined {
  const actor = ctx.state.actors.get(ctx.body.actor);
  if (actor?.status !== "seated") return undefined;
  const b = ctx.body;
  ctx.emit({ type: "turn_ended", actor: actor.id, outcome: b.outcome, why: b.why, tokens: b.tokens, usd: b.usd });
  for (const t of ctx.state.attentions.values())
    if (t.to === actor.id && t.delivered !== null) climb(ctx, t, ownerAbove(ctx.state, actor));
  return undefined;
}

export function goneFact(ctx: Of<"record_gone">): Refusal | undefined {
  const actor = ctx.state.actors.get(ctx.body.actor);
  if (actor?.status !== "seated") return undefined;
  const scope = ctx.state.scopes.get(actor.scope);
  const heir = scope ? ownerOfParent(ctx.state, scope) : null;
  ctx.emit({ type: "actor_gone", actor: actor.id, why: ctx.body.why });
  releaseSeat(ctx, actor.id, heir ?? HUMAN, new Set(), null);
  return undefined;
}

export function permissionFact(ctx: Of<"record_permission">): Refusal | undefined {
  const actor = ctx.state.actors.get(ctx.body.actor);
  if (actor?.status !== "seated") return undefined;
  const answerer = ownerAbove(ctx.state, actor) ?? HUMAN;
  const id = ctx.next("permission");
  ctx.emit({
    type: "permission_asked",
    permission: { id, actor: actor.id, request: ctx.body.request, text: ctx.body.text },
  });
  ctx.emit({
    type: "obligation_opened",
    obligation: {
      id: ctx.next("obligation"),
      owedBy: answerer,
      owedTo: actor.id,
      about: { kind: "permission", id },
      opened: ctx.at,
    },
  });
  return undefined;
}

export function answerPermission(ctx: Of<"answer_permission">): Refusal | undefined {
  const permission = ctx.state.permissions.get(ctx.body.permission);
  if (!permission) return refuse("unknown", `no open permission ${ctx.body.permission}`);
  const asker = ctx.state.actors.get(permission.actor);
  const answerer = asker ? ownerAbove(ctx.state, asker) : null;
  if (ctx.party !== HUMAN && ctx.party !== answerer)
    return refuse(
      "authority",
      `only ${answerer ?? "the owner above"} or the Human answers ${permission.actor}'s permission`,
    );
  ctx.emit({
    type: "permission_answered",
    permission: permission.id,
    actor: permission.actor,
    request: permission.request,
    allow: ctx.body.allow,
    reason: ctx.body.reason,
  });
  for (const o of ctx.state.obligations.values())
    if (o.about.kind === "permission" && o.about.id === permission.id)
      ctx.emit({ type: "obligation_closed", obligation: o.id, how: "answered" });
  return undefined;
}

export function holdMachine(ctx: Of<"hold_machine">): Refusal | undefined {
  const held = ctx.state.machineHeldBy;
  if (ctx.body.hold) {
    const me = ctx.agent();
    if (isRefusal(me)) return me;
    if (held !== null) return refuse("state", `the machine is held by ${held}`);
    ctx.emit({ type: "machine_held", actor: me.actor.id, why: ctx.body.why });
    return undefined;
  }
  if (held === null) return refuse("state", "the machine is not held");
  if (held !== ctx.party && ctx.party !== HUMAN)
    return refuse("authority", `the machine is held by ${held}; only it or the Human releases it`);
  ctx.emit({ type: "machine_released", actor: held, why: ctx.body.why });
  return undefined;
}
