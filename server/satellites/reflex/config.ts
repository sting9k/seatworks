import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type QuestionSpec, ReflexFileSchema, type Route, WatchFileSchema } from "../../../shared/contracts/reflex.ts";

export type ReflexConfig = {
  readonly routes: Readonly<Record<string, Route>>;
  readonly mask: readonly RegExp[];
  readonly questions: ReadonlyMap<string, QuestionSpec>;
  readonly moments: ReadonlyMap<string, QuestionSpec>;
  readonly itemChars: number;
  readonly repeats: number;
  readonly repeatsTold: number;
  readonly silentTurns: number;
  readonly testPath: RegExp | null;
  /** New work, in characters, that starts a sweep for the Watcher, and how much of it the sweep's note carries. */
  readonly sweep: { readonly everyChars: number; readonly digestChars: number } | null;
};

/** The profile's active questions and moments; one not in its file's `active` list is written but not asked. */
export function loadReflex(dir: string): ReflexConfig | null {
  const reflexFile = join(dir, "reflex.yaml");
  if (!existsSync(reflexFile)) return null;
  const reflex = ReflexFileSchema.parse(parse(readFileSync(reflexFile, "utf8")));
  const watchFile = join(dir, "watch.yaml");
  const watch = existsSync(watchFile) ? WatchFileSchema.parse(parse(readFileSync(watchFile, "utf8"))) : null;
  const pick = (all: Record<string, QuestionSpec>, active: readonly string[]) =>
    new Map(active.flatMap((name) => (all[name] ? [[name, all[name]] as const] : [])));
  return {
    routes: reflex.routes,
    mask: reflex.mask.map((p) => new RegExp(p, "g")),
    questions: pick(reflex.questions, reflex.active),
    moments: watch ? pick(watch.moments, watch.active) : new Map(),
    itemChars: watch?.item.chars ?? 1500,
    repeats: watch?.facts.repeats ?? 3,
    repeatsTold: watch?.facts.repeatsTold ?? 5,
    silentTurns: watch?.facts.silentTurns ?? 3,
    testPath: watch?.facts.testPath ? new RegExp(watch.facts.testPath) : null,
    sweep: watch?.sweep ?? null,
  };
}

/** The hash a threshold is earned for: the question's words and every outcome's description. */
export function wordingOf(q: QuestionSpec): string {
  const words = [q.noul ?? q.choice ?? "", q.yes ?? "", q.no ?? "", JSON.stringify(q.labels ?? {})].join("\n");
  return createHash("sha256").update(words).digest("hex").slice(0, 16);
}
