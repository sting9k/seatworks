import type { Actor } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";
import { statusText } from "../../shared/views/status.ts";
import type { Bundle } from "../profile/bundle.ts";

/** An agent's standing instructions: its role's prompt, and its skills named with where to read each. */
export function systemPromptFor(bundle: Bundle, actor: Actor): string {
  const prompt = bundle.prompts.get(actor.role) ?? "";
  const skills = bundle.skills.get(actor.role) ?? [];
  if (skills.length === 0) return prompt;
  const list = skills.map((s) => `- \`${s.name}\`: ${s.description} Read ${s.path} when it applies.`).join("\n");
  return `${prompt.trimEnd()}\n\n## Skills\n\n${list}\n`;
}

/** The first words an agent is sent: where it stands on the record, which is also what `status` shows. */
export function firstPrompt(state: State, actor: Actor, reseated: boolean): string {
  const status = statusText(state, actor.scope, actor.id) ?? `Scope ${actor.scope}`;
  const lead = reseated
    ? "You take over this scope from an agent that left it. What it owed and what was sent to it are yours now; its commits are on your branch."
    : "You are seated on this scope.";
  return `${lead} You are ${actor.id}.\n\n${status}`;
}
