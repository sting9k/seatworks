import type { EffectBody } from "../../../shared/contracts/effects.ts";
import type { State } from "../../../shared/kernel/state.ts";

type Item = Extract<EffectBody, { kind: "deliver" }>["item"];
export type Rendered = { text: string; asks: boolean; messages: string[]; attentions: string[] };

/**
 * One delivery: everything queued for a reader, numbered, oldest first, each with who it is from and what it asks
 * (COMMUNICATION.md, The mailbox). Facts only: nothing here ranks, merges or advises.
 */
export function renderBatch(items: readonly Item[], state: State): Rendered | null {
  const parts: { text: string; asks: boolean; message?: string; attention?: string }[] = [];
  for (const item of items) {
    const part = renderItem(item, state);
    if (part) parts.push(part);
  }
  if (parts.length === 0) return null;
  const n = parts.length;
  const text = parts.map((p, i) => (n === 1 ? p.text : `${i + 1} of ${n} · ${p.text}`)).join("\n\n");
  return {
    text,
    asks: parts.some((p) => p.asks),
    messages: parts.flatMap((p) => (p.message ? [p.message] : [])),
    attentions: parts.flatMap((p) => (p.attention ? [p.attention] : [])),
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
