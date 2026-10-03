import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ProfileAgents } from "../../shared/contracts/rpc.ts";
import { type Bundle, loadBundle } from "./bundle.ts";
import { listProfiles, profilePath } from "./profiles.ts";

/** The Human's matching for one profile: each agent profile its roles name that runs on one of the Human's own. */
export type Matching = Readonly<Record<string, string>>;

/** An agent profile the Human keeps in Paseo, which a name may call by its id or its name. */
export type Has = { readonly id: string; readonly name: string };

type Refused = { readonly ok: false; readonly says: string };

const MatchingSchema = z.record(z.string().min(1), z.string().min(1));

/** Kept beside the profiles, not in one: a template's files stay as shared, and installing it again keeps the matching. */
export const matchingFile = (stateRoot: string, profile: string): string =>
  join(stateRoot, "agents", `${profile}.json`);

/** A file that does not read is said, never thrown: a throw where an agent is made leaves a seat with nobody told why. */
export function matchingOf(file: string): { readonly ok: true; readonly matching: Matching } | Refused {
  if (!existsSync(file)) return { ok: true, matching: {} };
  try {
    return { ok: true, matching: MatchingSchema.parse(JSON.parse(readFileSync(file, "utf8"))) };
  } catch {
    return { ok: false, says: `the matching of agent profiles kept in ${file} does not read: match them again` };
  }
}

/** The Paseo agent profile a name runs on: the one it is matched to, or the profile of that very name. */
export const runsOn = (matching: Matching, named: string): string =>
  Object.hasOwn(matching, named) ? matching[named]! : named;

export const there = (has: readonly Has[], named: string): boolean =>
  has.some((profile) => profile.id === named || profile.name === named);

/** Every agent profile a profile's roles name. */
export const namedBy = (bundle: Bundle): string[] =>
  [...new Set([...bundle.profile.roles.values()].flatMap((role) => role.models))].sort();

/** The names a listed profile's roles give; only a listed name is joined into a path, since it comes from the surface. */
function namedIn(stateRoot: string, profile: string): { ok: true; named: string[] } | Refused {
  if (!listProfiles(stateRoot).some((listed) => listed.name === profile))
    return { ok: false, says: `no profile named ${profile} is installed` };
  try {
    return { ok: true, named: namedBy(loadBundle(profilePath(stateRoot, profile)!)) };
  } catch (error) {
    return { ok: false, says: `${profile} does not load: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Every profile a project may be attached with, each with what its agent profiles run on here. */
export function agentsByProfile(stateRoot: string, has: readonly Has[]): ProfileAgents[] {
  return listProfiles(stateRoot).map(({ name, title }) => {
    const read = namedIn(stateRoot, name);
    if (!read.ok) return { name, title, problem: read.says, agents: [] };
    const kept = matchingOf(matchingFile(stateRoot, name));
    const agents = read.named.map((agent) => {
      const runs = runsOn(kept.ok ? kept.matching : {}, agent);
      return { name: agent, runsOn: runs, there: there(has, runs) };
    });
    return { name, title, problem: kept.ok ? null : kept.says, agents };
  });
}

/** The names a profile's roles give that Paseo has no agent profile for, and its matching with those taken out. */
export function lacking(
  stateRoot: string,
  profile: string,
  has: readonly Has[],
): { readonly ok: true; readonly names: readonly string[]; readonly matching: Matching } | Refused {
  const read = namedIn(stateRoot, profile);
  if (!read.ok) return read;
  const kept = matchingOf(matchingFile(stateRoot, profile));
  // A matching that does not read matches nothing: every name then stands for the profile of its own name.
  const matching = kept.ok ? kept.matching : {};
  const names = read.named.filter((agent) => !there(has, runsOn(matching, agent)));
  return {
    ok: true,
    names,
    matching: Object.fromEntries(Object.entries(matching).filter(([agent]) => !names.includes(agent))),
  };
}

/** Keeps the Human's matching for a profile in place of the one before, or refuses it whole and keeps nothing. */
export function match(
  stateRoot: string,
  profile: string,
  matching: Matching,
  has: readonly Has[],
): { readonly ok: true } | Refused {
  const read = namedIn(stateRoot, profile);
  if (!read.ok) return read;
  for (const [agent, runs] of Object.entries(matching)) {
    if (!read.named.includes(agent)) return { ok: false, says: `${agent} is not an agent profile ${profile} names` };
    if (!there(has, runs)) return { ok: false, says: `Paseo has no agent profile named ${runs} to run ${agent} on` };
  }
  const file = matchingFile(stateRoot, profile);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(matching, null, 2)}\n`);
  return { ok: true };
}
