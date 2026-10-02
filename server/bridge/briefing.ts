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

/** The first words an agent is sent: where it stands on the record, which is also what `status` shows. */
export function firstPrompt(state: State, actor: Actor, reseated: boolean, docs: readonly string[]): string {
  const status = statusText(state, actor.scope, actor.id) ?? `Scope ${actor.scope}`;
  const lead = reseated
    ? "You take over this scope from an agent that left it. What it owed and what was sent to it are yours now; its commits are on your branch."
    : "You are seated on this scope.";
  // The plugin's own commits on the base are said, so nobody meets one at a publish and takes it for a stranger's.
  const read =
    docs.length > 0
      ? `\n\nThe project's docs in your copy: ${docs.map((d) => `\`${d}\``).join(", ")}. One that is not there holds nothing yet. The ledger commits what it keeps of them on the base itself, and its note to every agent there: those commits are its own, and a publish carries them.`
      : "";
  return `${lead} You are ${actor.id}.${read}\n\n${status}`;
}
