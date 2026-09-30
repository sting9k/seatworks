import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Human's own rules for a role, from files they keep outside any profile: `all.md` for every role, then
 * `<role>.md`. Read when an agent is made, so an edit reaches the next agent seated and never one already running.
 */
export function humanRules(dir: string, role: string): string | null {
  const texts = ["all.md", `${role}.md`]
    .map((file) => join(dir, file))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8").trim())
    .filter((text) => text.length > 0);
  return texts.length > 0 ? texts.join("\n\n") : null;
}

export function rulesDir(stateRoot: string): string {
  return join(stateRoot, "rules");
}
