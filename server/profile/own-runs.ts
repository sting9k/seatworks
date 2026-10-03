import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type OwnRuns, OwnRunsSchema } from "../../shared/contracts/rpc.ts";

/** What a project runs in place of the Human's agent profiles, by the name its template gives each. */
export type Own = Readonly<Record<string, OwnRuns>>;

type Runs = { readonly provider: string | null; readonly model: string | null; readonly effort: string | null };

const OwnSchema = z.record(z.string().min(1), OwnRunsSchema);

/** Kept with the project and not with the template or the Human's profiles: it is this project's alone. */
export const ownFile = (projectDir: string): string => join(projectDir, "agents.json");

/** A file that does not read is said, never thrown: a throw where an agent is made leaves a seat with nobody told why. */
export function ownOf(file: string): { readonly ok: true; readonly own: Own } | { ok: false; says: string } {
  if (!existsSync(file)) return { ok: true, own: {} };
  try {
    return { ok: true, own: OwnSchema.parse(JSON.parse(readFileSync(file, "utf8"))) };
  } catch {
    return { ok: false, says: `what this project runs of its own, kept in ${file}, does not read: pick it again` };
  }
}

/** Keeps one name's own for a project, or takes it away; a file that did not read starts anew with it. */
export function keepOwn(file: string, agent: string, runs: OwnRuns | null): void {
  const kept = ownOf(file);
  const { [agent]: _was, ...rest } = kept.ok ? kept.own : {};
  writeFileSync(file, `${JSON.stringify(runs === null ? rest : { ...rest, [agent]: runs }, null, 2)}\n`);
}

/** What a name runs once a project's own is laid over the Human's profile: what the own leaves out is the profile's. */
export function laidOver(profile: Runs, own: Partial<Runs>): Runs {
  return {
    provider: own.provider ?? profile.provider,
    model: own.model ?? profile.model,
    effort: own.effort === undefined ? profile.effort : own.effort,
  };
}
