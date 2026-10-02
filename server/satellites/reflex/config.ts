import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  type QuestionSpec,
  ReflexFileSchema,
  type Route,
  RoutesFileSchema,
  WatchFileSchema,
} from "../../../shared/contracts/reflex.ts";
import { SECRETS } from "../../../shared/contracts/secrets.ts";

export type ReflexConfig = {
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

/**
 * The profile's active questions and moments, from the files its `profile.yaml` names; one not in its file's `active`
 * list is written but not asked. A profile that names neither file asks nothing.
 */
export function loadReflex(
  dir: string,
  named: { readonly reflex: string | null; readonly watch: string | null },
): ReflexConfig | null {
  if (named.reflex === null && named.watch === null) return null;
  const reflex = named.reflex === null ? null : ReflexFileSchema.parse(read(join(dir, named.reflex)));
  const watch = named.watch === null ? null : WatchFileSchema.parse(read(join(dir, named.watch)));
  const pick = (all: Record<string, QuestionSpec>, active: readonly string[]) =>
    new Map(active.flatMap((name) => (all[name] ? [[name, all[name]] as const] : [])));
  return {
    mask: SECRETS.map((p) => new RegExp(p, "g")),
    questions: reflex ? pick(reflex.questions, reflex.active) : new Map(),
    moments: watch ? pick(watch.moments, watch.active) : new Map(),
    itemChars: watch?.item.chars ?? 1500,
    repeats: watch?.facts.repeats ?? 3,
    repeatsTold: watch?.facts.repeatsTold ?? 5,
    silentTurns: watch?.facts.silentTurns ?? 3,
    testPath: watch?.facts.testPath ? new RegExp(watch.facts.testPath) : null,
    sweep: watch?.sweep ?? null,
  };
}

const read = (path: string): unknown => parse(readFileSync(path, "utf8"));

/** The routes the plugin ships, by the name its settings give each (`harness/jev.json`). */
export function loadRoutes(pluginDir: string): Readonly<Record<string, Route>> {
  const file = join(pluginDir, "harness", "jev.json");
  return RoutesFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))).routes;
}

/** The hash a threshold is earned for: the question's words and every outcome's description. */
export function wordingOf(q: QuestionSpec): string {
  const words = [q.noul ?? q.choice ?? "", q.yes ?? "", q.no ?? "", JSON.stringify(q.labels ?? {})].join("\n");
  return createHash("sha256").update(words).digest("hex").slice(0, 16);
}
