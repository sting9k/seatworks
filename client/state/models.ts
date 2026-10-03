import type { ProviderModel } from "../../shared/contracts/rpc.ts";

/** What a new profile is offered first: the provider's own model, else its first, at the effort that model starts on. */
export function startOf(models: readonly ProviderModel[]): { model: string; effort: string | null } | null {
  const first = models.find((model) => model.isDefault) ?? models[0];
  return first ? { model: first.id, effort: first.defaultEffort } : null;
}

/** The effort a profile has once its model changes: its own where the new model has it, else that model's own. */
export function effortOn(models: readonly ProviderModel[], model: string, was: string | null): string | null {
  const next = models.find((one) => one.id === model);
  if (!next) return null;
  return was !== null && next.efforts.some((one) => one.id === was) ? was : next.defaultEffort;
}
