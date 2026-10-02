import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type QuestionSpec, ReflexFileSchema, WatchFileSchema } from "../../../shared/contracts/reflex.ts";
import { SECRETS } from "../../../shared/contracts/secrets.ts";

/** What the eye counts in code, as a profile's watch file sets it. */
export type Facts = {
  readonly repeats: number;
  readonly repeatsTold: number;
  readonly silentTurns: number;
  readonly waitingTurns: number;
  readonly asksOfTests: RegExp | null;
  readonly assertion: RegExp | null;
};

export type ReflexConfig = {
  readonly mask: readonly RegExp[];
  readonly questions: ReadonlyMap<string, QuestionSpec>;
  readonly moments: ReadonlyMap<string, QuestionSpec>;
  /** How much of an item a model is shown; a profile with no watch file clips nothing, and a route's budget is the limit. */
  readonly itemChars: number;
  readonly testPath: RegExp | null;
  /** None when the profile names no watch file: nothing is counted then. */
  readonly facts: Facts | null;
  /** New work, in characters, that starts a sweep for whoever watches, and how much of it the sweep's note carries. */
  readonly sweep: { readonly everyChars: number; readonly digestChars: number } | null;
};

/** The active questions and moments, from the files `profile.yaml` names; a profile naming neither asks nothing. */
export function loadReflex(
  dir: string,
  named: { readonly reflex: string | null; readonly watch: string | null },
): ReflexConfig | null {
  if (named.reflex === null && named.watch === null) return null;
  const reflex = named.reflex === null ? null : ReflexFileSchema.parse(read(join(dir, named.reflex)));
  const watch = named.watch === null ? null : WatchFileSchema.parse(read(join(dir, named.watch)));
  const pick = (all: Record<string, QuestionSpec>, active: readonly string[]) =>
    new Map(active.map((name) => [name, all[name]!] as const));
  const pattern = (text: string | undefined, flags?: string) => (text === undefined ? null : new RegExp(text, flags));
  return {
    mask: SECRETS.map((p) => new RegExp(p, "g")),
    questions: reflex ? pick(reflex.questions, reflex.active) : new Map(),
    moments: watch ? pick(watch.moments, watch.active) : new Map(),
    itemChars: watch?.item.chars ?? Number.POSITIVE_INFINITY,
    testPath: pattern(watch?.facts.testPath),
    facts: watch
      ? {
          repeats: watch.facts.repeats,
          repeatsTold: watch.facts.repeatsTold,
          silentTurns: watch.facts.silentTurns,
          waitingTurns: watch.facts.waitingTurns,
          asksOfTests: pattern(watch.facts.asksOfTests, "i"),
          assertion: pattern(watch.facts.assertion),
        }
      : null,
    sweep: watch?.sweep ?? null,
  };
}

const read = (path: string): unknown => parse(readFileSync(path, "utf8"));

/** The hash a threshold is earned for: the question's words and every outcome's description. */
export function wordingOf(q: QuestionSpec): string {
  const words = [q.noul ?? q.choice ?? "", q.yes ?? "", q.no ?? "", JSON.stringify(q.labels ?? {})].join("\n");
  return createHash("sha256").update(words).digest("hex").slice(0, 16);
}
