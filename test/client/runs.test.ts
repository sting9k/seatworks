import assert from "node:assert/strict";
import { test } from "node:test";
import { ownFor } from "../../client/state/runs.ts";
import { laidOver } from "../../shared/contracts/runs.ts";

// Rows of spec/CONFORMANCE.md, The Human's surface: what a project keeps of its own when a pick is made on its page.

const PROFILE = { provider: "claude", model: "sonnet", effort: "low" };

test("a pick on a project's page keeps the least of its own: nothing where the Human's profile already runs it, an effort, a model with its effort, a provider with both", () => {
  assert.equal(ownFor(PROFILE, PROFILE), null);
  assert.deepEqual(ownFor(PROFILE, { ...PROFILE, effort: "high" }), { effort: "high" });
  assert.deepEqual(ownFor(PROFILE, { ...PROFILE, effort: null }), { effort: null }, "the model's own is an effort too");
  assert.deepEqual(ownFor(PROFILE, { provider: "claude", model: "opus", effort: "low" }), {
    model: "opus",
    effort: "low",
  });
  assert.deepEqual(ownFor(PROFILE, { provider: "codex", model: "gpt", effort: null }), {
    provider: "codex",
    model: "gpt",
    effort: null,
  });
  assert.deepEqual(
    ownFor({ provider: "claude", model: null, effort: null }, { provider: "claude", model: "opus", effort: null }),
    { model: "opus", effort: null },
    "a profile that names no model is given one by the project",
  );
});

test("what a name runs in a project is its own laid over the Human's profile: what the own leaves out is the profile's", () => {
  assert.deepEqual(laidOver(PROFILE, null), PROFILE);
  assert.deepEqual(laidOver(PROFILE, { effort: null }), { provider: "claude", model: "sonnet", effort: null });
  assert.deepEqual(laidOver(PROFILE, { model: "opus", effort: "max" }), {
    provider: "claude",
    model: "opus",
    effort: "max",
  });
  for (const wanted of [
    { ...PROFILE, effort: "high" },
    { provider: "claude", model: "opus", effort: null },
    { provider: "codex", model: "gpt", effort: "medium" },
  ])
    assert.deepEqual(laidOver(PROFILE, ownFor(PROFILE, wanted)), wanted, "the least kept runs what was picked");
});
