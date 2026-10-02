import type { Step } from "./about.ts";

/** `flow.md`: the team's flow as every role is given it, a line a step in the order they were set down (TEMPLATE.md). */
export function flowText(steps: readonly Step[]): string {
  const names = new Map(steps.map((step) => [step.id, step.name]));
  const lines = steps.map((step, index) => {
    const next = step.then.flatMap((id) => names.get(id) ?? []);
    const parts = [
      `${index + 1}. **${step.name}**${step.role === null ? "" : ` (${step.role})`}.`,
      step.text.trim(),
      next.length > 0 ? `Then: ${next.join(", ")}.` : "",
    ];
    return parts.filter((part) => part !== "").join(" ");
  });
  return `# The team's flow\n\n${lines.join("\n")}\n`;
}
