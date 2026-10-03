import assert from "node:assert/strict";
import { test } from "node:test";
import { effortOn, startOf } from "../../client/state/models.ts";

// Rows of spec/CONFORMANCE.md, The Human's surface: the model and effort a profile is offered.

const MODELS = [
  { id: "haiku", label: "Haiku", isDefault: false, efforts: [], defaultEffort: null },
  {
    id: "sonnet",
    label: "Sonnet",
    isDefault: true,
    efforts: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
    defaultEffort: "low",
  },
  { id: "opus", label: "Opus", isDefault: false, efforts: [{ id: "high", label: "High" }], defaultEffort: null },
];

test("a new profile is offered the provider's own model at the effort that model starts on; a model changed keeps its effort where the new one has it", () => {
  assert.deepEqual(startOf(MODELS), { model: "sonnet", effort: "low" });
  assert.deepEqual(startOf(MODELS.slice(0, 1)), { model: "haiku", effort: null }, "the first where none is its own");
  assert.equal(startOf([]), null);

  assert.equal(effortOn(MODELS, "opus", "high"), "high");
  assert.equal(effortOn(MODELS, "sonnet", "max"), "low", "an effort the new model lacks gives way to its own");
  assert.equal(effortOn(MODELS, "haiku", "high"), null);
});
