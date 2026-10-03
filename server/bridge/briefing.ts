import type { Actor } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";
import { statusText } from "../../shared/views/status.ts";
import type { Bundle } from "../profile/bundle.ts";

/** An agent's standing instructions: its role's prompt, the flow, its skills by path, and the Human's rules. */
export function systemPromptFor(bundle: Bundle, actor: Actor, rules: string | null): string {
  const prompt = (bundle.prompts.get(actor.role) ?? "").trimEnd();
  const skills = bundle.skills.get(actor.role) ?? [];
  const list = skills.map((s) => `- \`${s.name}\`: ${s.description} Read ${s.path} when it applies.`).join("\n");
  const flow = bundle.flow?.trimEnd();
  const parts = [prompt, flow, list && `## Skills\n\n${list}`, rules && `## The Human's rules\n\n${rules}`];
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}

/** How an agent waits, in its first words: a turn kept open by a sleep keeps out the very word it waits for. */
const WAITS =
  "To wait for a hand-back, a check's result or an answer, end your turn: what you wait for begins your next one.";
/** When mail reaches it, by whether its team's template lets any into a turn. */
const ARRIVES = {
  atEnd: "Nothing sent to you arrives while your turn runs.",
  between: "Mail reaches you when your turn ends; what cannot wait reaches you between two of your steps.",
};

/** The first words an agent is sent: where it stands on the record, which is also what `status` shows. */
export function firstPrompt(
  state: State,
  actor: Actor,
  reseated: boolean,
  docs: readonly string[],
  intoTurn: boolean,
): string {
  const status = statusText(state, actor.scope, actor.id) ?? `Scope ${actor.scope}`;
  const lead = reseated
    ? "You take over this scope from an agent that left it. What it owed and what was sent to it are yours now; its commits are on your branch."
    : "You are seated on this scope.";
  const read =
    docs.length > 0
      ? `\n\nThe project's docs in your copy: ${docs.map((d) => `\`${d}\``).join(", ")}. One that is not there holds nothing yet.`
      : "";
  return `${lead} You are ${actor.id}.${read}\n\n${intoTurn ? ARRIVES.between : ARRIVES.atEnd} ${WAITS}\n\n${status}`;
}
