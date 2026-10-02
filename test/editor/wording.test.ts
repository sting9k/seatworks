import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import fc from "fast-check";
import { readTemplate } from "../../editor/template/read-template.ts";
import { sha256, wordingOf } from "../../editor/template/wording.ts";
import { wordingOf as pluginWordingOf } from "../../server/satellites/reflex/config.ts";
import { slpFiles } from "./slp.ts";

// A row of spec/CONFORMANCE.md, Editor: the page and the plugin make one hash of a question's words.

test("the page hashes any text as Node does", () => {
  fc.assert(
    fc.property(fc.string({ unit: "grapheme", maxLength: 400 }), (text) => {
      assert.equal(sha256(text), createHash("sha256").update(text).digest("hex"));
    }),
  );
  for (const length of [0, 55, 56, 63, 64, 119, 120, 1000])
    assert.equal(
      sha256("a".repeat(length)),
      createHash("sha256").update("a".repeat(length)).digest("hex"),
      `${length}`,
    );
});

test("the wording a threshold is earned for is the same in the page as in the plugin, for every question of SLP", () => {
  const read = readTemplate(slpFiles());
  assert.ok(read.ok);
  const asked = [...read.template.questions, ...read.template.moments];
  assert.ok(asked.length > 20);
  for (const { name, spec } of asked) assert.equal(wordingOf(spec), pluginWordingOf(spec), name);
});
