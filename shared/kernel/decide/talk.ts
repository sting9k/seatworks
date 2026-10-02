import type { CommandBody } from "../../contracts/commands.ts";
import { BRIDGE, HUMAN, ID_PREFIX, type Party } from "../../contracts/ids.ts";
import type { Message } from "../../contracts/ledger.ts";
import { fromOutside, maySpeak, ownerOfParent } from "../authority.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";
import { askerNow } from "./seats.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

export function sendMessage(ctx: Of<"send_message">): Refusal | undefined {
  const { body } = ctx;
  if (ctx.party !== HUMAN) {
    const me = ctx.agent();
    if (isRefusal(me)) return me;
    if (!maySpeak(ctx.state, ctx.profile, me.actor, body.to))
      return refuse("I10", `a ${me.actor.role} does not speak to ${body.to}`);
  } else if (body.to !== HUMAN && ctx.state.actors.get(body.to)?.status !== "seated")
    return refuse("unknown", `${body.to} is not seated`);
  if (body.replyTo !== null && !wasSent(ctx, body.replyTo)) return refuse("unknown", `no message ${body.replyTo}`);
  post(ctx, {
    to: body.to,
    text: body.text,
    asks: body.asks,
    directs: body.directs,
    replyTo: body.replyTo,
    queued: true,
  });
  return undefined;
}

/** Whether a message of that id was ever sent: one read and settled is out of memory, and may be followed all the same. */
function wasSent(ctx: Context, id: string): boolean {
  const n = Number(id.slice(ID_PREFIX.message.length));
  return id.startsWith(ID_PREFIX.message) && Number.isInteger(n) && n >= 1 && n <= ctx.state.counters.message;
}

export function answer(ctx: Of<"answer">): Refusal | undefined {
  const asked = ctx.state.messages.get(ctx.body.replyTo);
  if (!asked)
    return refuse(
      "unknown",
      wasSent(ctx, ctx.body.replyTo)
        ? `message ${ctx.body.replyTo} asked no answer, or has one: what follows it is a message of your own`
        : `no message ${ctx.body.replyTo}`,
    );
  // Answering the copy of a direction answers the direction it copies.
  const about = asked.copyOf ?? asked.id;
  const owed = [...ctx.state.obligations.values()].filter(
    (o) =>
      o.owedBy === ctx.party && (o.about.kind === "message" || o.about.kind === "direction") && o.about.id === about,
  );
  if (asked.to !== ctx.party && owed.length === 0) return refuse("authority", `message ${asked.id} was not to you`);
  if (asked.from === BRIDGE)
    return refuse("state", `message ${asked.id} is a note of the record's own: nobody reads an answer to it`);
  // An answer goes back to whoever asked, whatever the edges: I10 governs who may start a conversation.
  post(ctx, {
    to: askerNow(ctx, asked.from),
    text: ctx.body.text,
    asks: false,
    directs: false,
    replyTo: asked.id,
    queued: true,
  });
  for (const o of owed) ctx.emit({ type: "obligation_closed", obligation: o.id, how: "answered" });
  return undefined;
}

export function humanWords(ctx: Of<"record_human_words">): Refusal | undefined {
  const reader = ctx.state.actors.get(ctx.body.actor);
  if (!reader) return refuse("unknown", `no actor ${ctx.body.actor}`);
  post(ctx, { to: reader.id, text: ctx.body.text, asks: false, directs: true, replyTo: null, queued: false }, HUMAN);
  return undefined;
}

type Draft = Pick<Message, "to" | "text" | "asks" | "directs" | "replyTo" | "queued">;

/** Records a message, its copy to the reader's parent owner when it comes from outside (I7), and what it opens. */
function post(ctx: Context, draft: Draft, from: Party = ctx.party): void {
  const message: Message = {
    id: ctx.next("message"),
    from,
    copyOf: null,
    delivered: null,
    answered: false,
    wakes: false,
    ...draft,
  };
  ctx.emit({ type: "message_sent", message });
  if (message.asks && message.to !== HUMAN)
    ctx.emit({
      type: "obligation_opened",
      obligation: {
        id: ctx.next("obligation"),
        owedBy: message.to,
        owedTo: from,
        about: { kind: "message", id: message.id },
        opened: ctx.at,
      },
    });
  const reader = ctx.state.actors.get(message.to);
  if (!reader || !fromOutside(ctx.state, from, reader)) return;
  const scope = ctx.state.scopes.get(reader.scope);
  const owner = scope ? ownerOfParent(ctx.state, scope) : null;
  if (owner === null || owner === from) return;
  const copy: Message = {
    ...message,
    id: ctx.next("message"),
    to: owner,
    asks: false,
    copyOf: message.id,
    queued: owner !== HUMAN,
  };
  ctx.emit({ type: "message_sent", message: copy });
  if (message.directs)
    ctx.emit({
      type: "obligation_opened",
      obligation: {
        id: ctx.next("obligation"),
        owedBy: owner,
        owedTo: from,
        about: { kind: "direction", id: message.id },
        opened: ctx.at,
      },
    });
}

/** What a reader was sent is delivered while it is still that reader's: what moved on meanwhile waits for its new one. */
export function delivery(ctx: Of<"record_delivery">): Refusal | undefined {
  const { to } = ctx.body;
  for (const id of ctx.body.messages) {
    const m = ctx.state.messages.get(id);
    if (m?.delivered === null && m.to === to) ctx.emit({ type: "message_delivered", message: id, at: ctx.at });
  }
  for (const id of ctx.body.attentions) {
    const t = ctx.state.attentions.get(id);
    if (t?.delivered === null && t.to === to) ctx.emit({ type: "attention_delivered", attention: id, at: ctx.at });
  }
  return undefined;
}
