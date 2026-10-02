import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AboutSchema } from "../editor/template/about.ts";
import { notesOf } from "../editor/template/checks.ts";
import { readTemplate } from "../editor/template/read-template.ts";
import { loadBundle } from "../server/profile/bundle.ts";
import { loadReflex } from "../server/satellites/reflex/config.ts";
import { ProfileFileSchema, RELATIONS } from "../shared/contracts/profile.ts";
import {
  ASKED_ON,
  CODE_MOMENTS,
  ReflexFileSchema,
  STATE_PATHS,
  TELLS,
  WatchFileSchema,
} from "../shared/contracts/reflex.ts";
import { ROLE_TOOLS } from "../shared/contracts/tools.ts";
import { specExample, templateSpec } from "./spec-example.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: the spec a template is written from, held to the code.

const spec = templateSpec();
/** A word the spec names: in backticks, or as a key of one of its examples. */
const named = (word: string) => spec.includes(`\`${word}\``) || new RegExp(`^\\s*${word}:`, "m").test(spec);
const missing = (words: Iterable<string>) => [...words].filter((word) => !named(word));

test("the template spec names every tool, key and word a template may write, so a template written from it alone is whole", () => {
  const profile = ProfileFileSchema.shape;
  const watch = WatchFileSchema.shape;
  const all: Record<string, Iterable<string>> = {
    "a tool": ROLE_TOOLS,
    "a key of template.json": Object.keys(AboutSchema.shape),
    "a key of profile.yaml": Object.keys(profile),
    "a key of a role": Object.keys(profile.roles.valueType.shape),
    "a key of the project": Object.keys(profile.project.unwrap().shape),
    "a relation": RELATIONS,
    "a key of the reflex file": Object.keys(ReflexFileSchema.shape),
    "a key of a question": Object.keys(ReflexFileSchema.shape.questions.unwrap().valueType.shape),
    "a key of the watch file": [
      ...Object.keys(watch),
      ...Object.keys(watch.item.shape),
      ...Object.keys(watch.sweep.unwrap().shape),
      ...Object.keys(watch.facts.shape),
    ],
    "an event a question is asked on": ASKED_ON,
    "a state path": STATE_PATHS,
    "whom a question tells": TELLS,
    "a moment counted in code": CODE_MOMENTS,
  };
  const unnamed = Object.entries(all).flatMap(([kind, words]) => missing(words).map((word) => `${kind}: ${word}`));
  assert.deepEqual(unnamed, []);
});

test("the whole small template the spec gives loads as the editor and the plugin load one, and draws no note", () => {
  const files = specExample();
  assert.ok(files.size >= 5, [...files.keys()].join(", "));

  const read = readTemplate(files);
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.deepEqual(notesOf(read.template, read.template), []);

  const dir = mkdtempSync(join(tmpdir(), "sw-example-"));
  for (const [path, text] of files) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const bundle = loadBundle(dir);
  assert.deepEqual([...bundle.profile.roles.keys()], ["navigator", "driver", "checker"]);
  assert.equal(loadReflex(dir, bundle.asks), null);
});
