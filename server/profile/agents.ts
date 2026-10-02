import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

/**
 * The Human's matching for one profile (TEMPLATE.md, Installing): each agent profile its roles name that runs on one
 * of the Human's own, under another name. It is kept beside the profiles and not in one, so a template's files stay
 * as they were shared and the matching outlives the template installed again.
 */
export type Matching = Readonly<Record<string, string>>;

const MatchingSchema = z.record(z.string().min(1), z.string().min(1));

export const matchingFile = (stateRoot: string, profile: string): string =>
  join(stateRoot, "agents", `${profile}.json`);

/** The matching kept in a file; none when the Human matched nothing. Read when an agent is made, as their rules are. */
export function matchingOf(file: string): Matching {
  return existsSync(file) ? MatchingSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : {};
}

/** Keeps a matching in its file, in place of the one kept before. */
export function keepMatching(file: string, matching: Matching): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(matching, null, 2)}\n`);
}

/** The Paseo agent profile a name runs on: the one it is matched to, or the profile of that very name. */
export const runsOn = (matching: Matching, named: string): string =>
  Object.hasOwn(matching, named) ? matching[named]! : named;
