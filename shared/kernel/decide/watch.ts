import type { CommandBody } from "../../contracts/commands.ts";
import { type ActorId, HUMAN, type Party, ROOT, type ScopeId } from "../../contracts/ids.ts";
import type { Attention, AttentionSource, Urgency } from "../../contracts/ledger.ts";
import { isWithin, ownerAbove, ownerOfParent, seatedIn } from "../authority.ts";
import { noiseKey } from "../state.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

type Seen = {
  actor: ActorId;
  scope: ScopeId;
  moment: string;
  why: string;
  facts: readonly string[];
  source: AttentionSource;
  urgency: Urgency;
};

/** Opens an attention to the owner above the work, unless its reader marked the moment noise for this actor. */
function attentionTo(ctx: Context, seen: Seen): string | null {
  const actor = ctx.state.actors.get(seen.actor);
  if (!actor) return null;
  const to = ownerAbove(ctx.state, actor);
  if (to === null || ctx.state.noise.has(noiseKey(seen.moment, seen.actor, seen.scope))) return null;
  const attention: Attention = {
    id: ctx.next("attention"),
    about: { actor: seen.actor, scope: seen.scope },
    moment: seen.moment,
    why: seen.why,
    facts: seen.facts,
    source: seen.source,
    urgency: seen.urgency,
    to,
    delivered: null,
    climbedFrom: null,
  };
  ctx.emit({ type: "attention_opened", attention });
  return attention.id;
}

/** The seated actor that watches over a scope, if any. */
function watcherOver(ctx: Context, scope: ScopeId): ActorId | null {
  for (const s of ctx.state.scopes.values()) {
    if (s.kind !== "watch" || s.status !== "open") continue;
    const reaches = s.over === "all" || s.over.some((o) => isWithin(ctx.state, scope, o));
    const seated = seatedIn(ctx.state, s.id);
    if (reaches && seated !== null) return seated;
  }
  return null;
}

/** Where a note or fact goes, resolved from the graph; never anywhere else (I12). */
function relation(
  ctx: Context,
  to: "root" | "parent" | "self" | "answerer",
  actor: ActorId | null,
  scope: ScopeId,
): Party | null {
  if (to === "root") return ctx.state.scopes.get(ROOT)?.owner ?? null;
  if (to === "self") return actor;
  const s = ctx.state.scopes.get(scope);
  return s ? ownerOfParent(ctx.state, s) : null;
}

export function observation(ctx: Of<"record_observation">): Refusal | undefined {
  const b = ctx.body;
  if (!ctx.state.scopes.has(b.scope)) return undefined;
  if (b.actor !== null && !ctx.state.actors.has(b.actor)) return undefined;
  const id = ctx.next("observation");
  ctx.emit({
    type: "observation_made",
    observation: {
      id,
      question: b.question,
      subject: { actor: b.actor, scope: b.scope },
      source: b.source,
      model: b.model,
      answer: b.answer,
      level: b.level,
    },
  });
  const route = b.route;
  if (b.level === "record") return undefined;
  if (route.kind === "evidence") {
    if (b.level === "tell")
      ctx.emit({
        type: "evidence_recorded",
        evidence: {
          id: ctx.next("evidence"),
          scope: b.scope,
          kind: "judgement",
          subject: route.commit,
          ok: route.ok,
          by: "bridge",
          summary: route.text,
          steps: [],
          heldMachine: false,
        },
        wake: [],
      });
    return undefined;
  }
  if (b.level === "consider") {
    // Between thresholds, or past one not yet earned: a candidate for the actor that watches over the scope.
    const watcher = watcherOver(ctx, b.scope);
    const actor = b.actor === null ? undefined : ctx.state.actors.get(b.actor);
    const above = actor ? ownerAbove(ctx.state, actor) : null;
    if (watcher !== null && above !== null)
      ctx.emit({
        type: "obligation_opened",
        obligation: {
          id: ctx.next("obligation"),
          owedBy: watcher,
          owedTo: above,
          about: { kind: "candidate", id },
          opened: ctx.at,
          summary: `${b.question} · ${b.answer} · ${actor?.id ?? "?"} (${actor?.role ?? "?"}, scope ${b.scope}) · ${route.kind === "attention" ? route.why : route.text}`,
        },
      });
    return undefined;
  }
  if (route.kind === "attention") {
    if (b.actor === null) return refuse("I12", "an attention is about an actor");
    attentionTo(ctx, {
      actor: b.actor,
      scope: b.scope,
      moment: b.question,
      why: route.why,
      facts: route.facts,
      source: b.source,
      urgency: route.urgency,
    });
    return undefined;
  }
  const to = relation(ctx, route.to, b.actor, b.scope);
  if (to === null || to === HUMAN) return undefined;
  ctx.emit({
    type: "message_sent",
    message: {
      id: ctx.next("message"),
      from: "bridge",
      to,
      text: route.text,
      asks: false,
      directs: false,
      replyTo: null,
      copyOf: null,
      queued: true,
      delivered: null,
      answered: false,
      wakes: route.kind === "note" && route.wakes,
    },
  });
  return undefined;
}

export function attend(ctx: Of<"attend">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  if (!me.role.watches) return refuse("authority", "only a role that watches attends");
  const watched = ctx.state.actors.get(ctx.body.actor);
  if (!watched || watched.status !== "seated") return refuse("unknown", `${ctx.body.actor} is not seated`);
  const own = ctx.state.scopes.get(me.actor.scope);
  const reaches =
    own !== undefined && (own.over === "all" || own.over.some((o) => isWithin(ctx.state, watched.scope, o)));
  if (!reaches) return refuse("authority", `${watched.id} is not in the scopes you watch`);
  const candidate = ctx.body.candidate;
  const owed = candidate === null ? undefined : candidateOwed(ctx, candidate, me.actor.id);
  if (candidate !== null && !owed) return refuse("unknown", `no candidate ${candidate} waiting on you`);
  const attention = attentionTo(ctx, {
    actor: watched.id,
    scope: watched.scope,
    moment: ctx.body.moment,
    why: ctx.body.why,
    facts: [],
    source: "attend",
    urgency: ctx.body.urgency,
  });
  ctx.emit({ type: "attended", candidate, attention });
  if (owed) ctx.emit({ type: "obligation_closed", obligation: owed, how: "attended" });
  return undefined;
}

export function pass(ctx: Of<"pass">): Refusal | undefined {
  const owed = candidateOwed(ctx, ctx.body.candidate, ctx.party);
  if (!owed) return refuse("unknown", `no candidate ${ctx.body.candidate} waiting on you`);
  ctx.emit({ type: "passed", candidate: ctx.body.candidate, reason: ctx.body.reason });
  ctx.emit({ type: "obligation_closed", obligation: owed, how: "passed" });
  return undefined;
}

function candidateOwed(ctx: Context, candidate: string, by: Party): string | undefined {
  for (const o of ctx.state.obligations.values())
    if (o.about.kind === "candidate" && o.about.id === candidate && o.owedBy === by) return o.id;
  return undefined;
}

export function settle(ctx: Of<"acknowledge"> | Of<"mark_noise">): Refusal | undefined {
  const attention = ctx.state.attentions.get(ctx.body.attention);
  if (!attention) return refuse("unknown", `no open attention ${ctx.body.attention}`);
  if (attention.to !== ctx.party) return refuse("authority", `attention ${attention.id} was not sent to you`);
  if (ctx.body.type === "acknowledge") ctx.emit({ type: "acknowledged", attention: attention.id });
  else
    ctx.emit({
      type: "noise_marked",
      attention: attention.id,
      key: noiseKey(attention.moment, attention.about.actor, attention.about.scope),
    });
  return undefined;
}
