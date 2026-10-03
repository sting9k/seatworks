import type { OwnRuns, Runs } from "../../shared/contracts/runs.ts";

/** What a name is to run: a provider, a model of it, and an effort or the model's own. */
export type Wanted = { readonly provider: string; readonly model: string; readonly effort: string | null };

/** The least a project keeps of its own so a name runs what is wanted; none where the Human's profile already does. */
export function ownFor(profile: Runs, wanted: Wanted): OwnRuns | null {
  if (wanted.provider !== profile.provider) return wanted;
  if (wanted.model !== profile.model) return { model: wanted.model, effort: wanted.effort };
  return wanted.effort === profile.effort ? null : { effort: wanted.effort };
}
