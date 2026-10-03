import type { EffectBody } from "../../../shared/contracts/effects.ts";
import type { Event } from "../../../shared/contracts/events.ts";
import { HUMAN } from "../../../shared/contracts/ids.ts";
import { standsAbove } from "../../../shared/kernel/authority.ts";
import type { State } from "../../../shared/kernel/state.ts";

type Item = Extract<EffectBody, { kind: "deliver" }>["item"];

/** When a queued item may enter a turn its reader is in: at its next step, once it has waited, or only at the turn's end. */
export type Entry = "now" | "soon" | "end";

/** The events whose note changes what its reader is to do, or answers what the reader raised or asked. */
const NOW: ReadonlySet<Event["type"]> = new Set([
  "sent_back",
  "brief_amended",
  "handed_over",
  "scope_held",
  "scope_resumed",
  "finding_classified",
  "question_answered",
]);

/** When an item may enter, by what it is and where it comes from, never by its words (COMMUNICATION.md, Into a turn). */
export function entryOf(item: Item, to: string, state: State, cause: Event["type"]): Entry {
  const reader = state.actors.get(to);
  // A watch reads digests, and reads them whole at its turn's end.
  if (!reader || state.scopes.get(reader.scope)?.kind === "watch") return "end";
  switch (item.kind) {
    case "note":
      return NOW.has(cause) ? "now" : item.asks ? "soon" : "end";
    case "attention":
      return state.attentions.get(item.id)?.urgency === "now" ? "now" : "end";
    case "candidate":
      return "end";
    case "message": {
      const m = state.messages.get(item.id);
      if (!m) return "end";
      if (m.from === HUMAN || m.directs) return "now";
      if (m.replyTo !== null && state.messages.get(m.replyTo)?.from === to) return "now";
      if (!m.asks && !m.wakes) return "end";
      // A question from above is asked when its reader's turn ends: in the middle of the work it costs more.
      return standsAbove(state, m.from, reader.scope) ? "end" : "soon";
    }
  }
}

/** One of a reader's queued deliveries, as the gate weighs it. */
export type Queued = { readonly key: string; readonly entry: Entry; readonly at: number };

/** The keys that enter the reader's turn now, oldest first; none while nothing is due or the reader rests from the last. */
export function entering(
  queue: readonly Queued[],
  now: number,
  last: number | null,
  rule: { readonly patience: number; readonly rest: number },
): readonly string[] {
  const urgent = queue.some((q) => q.entry === "now");
  const due = queue.some((q) => q.entry === "soon" && now - q.at >= rule.patience * 1000);
  const resting = last !== null && now - last < rule.rest * 1000;
  // A direction does not wait out a rest; what only waited does. Once anything enters, all that would wake goes with it.
  if (!urgent && (!due || resting)) return [];
  return queue.filter((q) => q.entry !== "end").map((q) => q.key);
}
