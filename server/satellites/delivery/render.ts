import type { EffectBody } from "../../../shared/contracts/effects.ts";
import type { State } from "../../../shared/kernel/state.ts";

type Item = Extract<EffectBody, { kind: "deliver" }>["item"];
/** `taken` is how many of the items, oldest first, the delivery holds or had nothing left to say of. */
export type Rendered = { text: string; asks: boolean; messages: string[]; attentions: string[]; taken: number };

/** What one delivery holds: past it the rest waits for its reader's next turn's end, so a long queue fills no context. */
const DELIVERY_CHARS = 60_000;
/** Room kept for a part's number and for the line that says how many wait. */
const NUMBER_CHARS = 20;
const WAITING_CHARS = 80;

/** One delivery: what is queued for a reader, numbered, oldest first, each whole; nothing here ranks, merges or advises. */
export function renderBatch(items: readonly Item[], state: State): Rendered | null {
  const parts = items.map((item) => renderItem(item, state));
  const queued = parts.filter((part) => part !== null);
  if (queued.length === 0) return null;
  const held: typeof queued = [];
  let size = WAITING_CHARS;
  let taken = 0;
  for (const part of parts) {
    if (part !== null) {
      // The oldest always goes, however long: a part is never cut.
      if (held.length > 0 && size + part.text.length + NUMBER_CHARS > DELIVERY_CHARS) break;
      held.push(part);
      size += part.text.length + NUMBER_CHARS;
    }
    taken += 1;
  }
  const n = held.length;
  const waiting = queued.length - n;
  const text = held.map((p, i) => (n === 1 ? p.text : `${i + 1} of ${n} · ${p.text}`)).join("\n\n");
  return {
    text: waiting === 0 ? text : `${text}\n\n${waiting} more wait, and are sent when this turn ends.`,
    // Whatever in the queue asks wakes its reader for the oldest of it: the queue is read in order.
    asks: queued.some((p) => p.asks),
    messages: held.flatMap((p) => (p.message ? [p.message] : [])),
    attentions: held.flatMap((p) => (p.attention ? [p.attention] : [])),
    taken,
  };
}

function renderItem(
  item: Item,
  state: State,
): { text: string; asks: boolean; message?: string; attention?: string } | null {
  if (item.kind === "note") return { text: item.text, asks: item.asks };
  if (item.kind === "message") {
    const m = state.messages.get(item.id);
    if (!m || m.delivered !== null) return null;
    const head = [`${m.id} from ${who(m.from, state)}`];
    if (m.copyOf !== null) head.push(`a copy of ${m.copyOf} to ${who(state.messages.get(m.copyOf)?.to ?? "", state)}`);
    if (m.replyTo !== null) head.push(`answering ${m.replyTo}`);
    if (m.directs) head.push("it directs");
    if (m.asks) head.push(`it asks an answer: \`answer\` with replyTo ${m.id}`);
    return {
      text: `${head.join(" · ")}\n${m.text}`,
      asks: m.asks || m.directs || m.replyTo !== null || m.wakes,
      message: m.id,
    };
  }
  const t = state.attentions.get(item.id);
  if (!t || t.delivered !== null) return null;
  const lines = [
    `ATTENTION ${t.id} · ${who(t.about.actor, state)} · ${t.moment} · ${t.source} · ${t.urgency}`,
    `why: ${t.why}`,
    ...(t.facts.length > 0 ? [`facts: ${t.facts.join("; ")}`] : []),
    `\`look\` for more; \`acknowledge\` ${t.id} if it needs nothing now`,
  ];
  return { text: lines.join("\n"), asks: t.urgency === "now", attention: t.id };
}

function who(party: string, state: State): string {
  if (party === "human") return "the Human";
  if (party === "bridge") return "the ledger";
  const a = state.actors.get(party);
  return a ? `${a.id} (${a.role}, scope ${a.scope})` : party;
}
