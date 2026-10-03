import { z } from "zod";

const named = z.string().min(1);
/** With none for an effort, the model's own. */
const effort = named.nullable();

/** What a project runs in place of a profile of the Human's: an effort, a model with its effort, or a provider with both. */
export const OwnRunsSchema = z.union([
  z.object({ provider: named, model: named, effort }).strict(),
  z.object({ model: named, effort }).strict(),
  z.object({ effort }).strict(),
]);
export type OwnRuns = z.infer<typeof OwnRunsSchema>;

/** What a profile runs, as far as it says: one Paseo lacks says nothing, and one may name no model. */
export type Runs = { readonly provider: string | null; readonly model: string | null; readonly effort: string | null };

/** What a name runs once a project's own is laid over the Human's profile: what the own leaves out is the profile's. */
export function laidOver(profile: Runs, own: OwnRuns | null): Runs {
  if (own === null) return { provider: profile.provider, model: profile.model, effort: profile.effort };
  return {
    provider: "provider" in own ? own.provider : profile.provider,
    model: "model" in own ? own.model : profile.model,
    effort: own.effort,
  };
}
