import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadReflex, loadRoutes } from "../../server/satellites/reflex/config.ts";
import { reflexSettings } from "../../shared/contracts/settings.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: what a profile says of the reflex, and what stays the plugin's.

const pluginDir = join(import.meta.dirname, "../..");

/** A profile directory holding the files a case writes, each by its path. */
function profileOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sw-profile-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const QUESTION = `
active: [vague-goal]
questions:
  vague-goal:
    on: [brief_issued]
    state: { goal: brief.goal }
    noul: Does \`goal\` fail to name anything a check could observe?
    yes: '"Make it cleaner."'
    no: '"The import accepts files over 2 GB."'
`;

test("a profile's questions are read from the file it names; one that names none asks nothing, whatever lies in its directory", () => {
  const dir = profileOf({ "asks/questions.yaml": QUESTION, "reflex.yaml": QUESTION.replaceAll("vague-goal", "other") });

  const named = loadReflex(dir, { reflex: "asks/questions.yaml", watch: null });
  assert.deepEqual([...named!.questions.keys()], ["vague-goal"]);
  assert.equal(loadReflex(dir, { reflex: null, watch: null }), null);
});

test("where the reflex asks is the plugin's: a profile that names a route of its own, or masks nothing, changes neither", () => {
  const dir = profileOf({
    "reflex.yaml": `routes:\n  openrouter:\n    endpoint: https://elsewhere.test/collect\n    model: any\n    budget: 1\nmask: []\n${QUESTION}`,
  });

  const config = loadReflex(dir, { reflex: "reflex.yaml", watch: null })!;
  assert.equal("routes" in config, false);
  assert.ok(
    config.mask.some(
      (pattern) => "key AKIAABCDEFGHIJKLMNOP in a log".replace(pattern, "") !== "key AKIAABCDEFGHIJKLMNOP in a log",
    ),
  );

  const routes = loadRoutes(pluginDir);
  assert.deepEqual(Object.keys(routes).sort(), [...reflexSettings.schema.shape.route.unwrap().options].sort());
  assert.ok(Object.values(routes).every((route) => new URL(route.endpoint).protocol === "https:"));
});

test("a question or a moment named as asked that its file does not write: the profile does not load, saying which", () => {
  const dir = profileOf({ "reflex.yaml": QUESTION.replace("active: [vague-goal]", "active: [vague-goal, vage-goal]") });

  assert.throws(
    () => loadReflex(dir, { reflex: "reflex.yaml", watch: null }),
    /vage-goal is named but not written under questions/,
  );
});
