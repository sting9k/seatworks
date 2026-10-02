import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The Human's own rules for a role, `all.md` then `<role>.md`; read when an agent is made, never for one running. */
export function humanRules(dir: string, role: string): string | null {
  const texts = ["all.md", `${role}.md`]
    .map((file) => join(dir, file))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8").trim())
    .filter((text) => text.length > 0);
  return texts.length > 0 ? texts.join("\n\n") : null;
}

/** The Human's rules for one profile: they are kept by role, and a role's name belongs to its profile. */
export function rulesDir(stateRoot: string, profile: string): string {
  return join(stateRoot, "rules", profile);
}
