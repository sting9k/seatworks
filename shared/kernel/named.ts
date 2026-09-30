import type { CommandBody } from "../contracts/commands.ts";

const NAMING_KEYS = ["scope", "parent", "to", "actor", "from", "about", "target"] as const;

/** The scopes and actors a command names in its arguments, by id. */
export function namedIn(body: CommandBody): Set<string> {
  const found = new Set<string>();
  const record = body as Record<string, unknown>;
  for (const key of NAMING_KEYS) {
    const value = record[key];
    if (typeof value === "string") found.add(value);
  }
  return found;
}
