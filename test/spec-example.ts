import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The spec a template is written from, as whoever writes one reads it. */
export const templateSpec = (): string => readFileSync(join(import.meta.dirname, "../docs/TEMPLATE-SPEC.md"), "utf8");

/**
 * The whole small template the spec gives, each file by its path with its text. The prompts it holds have headings of
 * their own, so the section ends at the heading that follows it by name.
 */
export function specExample(): Map<string, string> {
  const section = templateSpec().split("\n## A whole small template\n")[1]?.split("\n## Before you hand it over\n")[0];
  if (section === undefined) throw new Error("the template spec no longer holds its example where the tests look");
  return new Map(
    [...section.matchAll(/^#### `(.+)`\n\n```[a-z]*\n([\s\S]*?)\n```$/gm)].map(
      ([, path, text]) => [path!, `${text!}\n`] as const,
    ),
  );
}
