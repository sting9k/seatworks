import assert from "node:assert/strict";
import { test } from "node:test";
import { bytesOf, dayOf } from "../../client/state/words.ts";

// Rows of spec/CONFORMANCE.md, The Human's surface.

test("a size is said in whole numbers of the unit that keeps it short, and a day by its number and month", () => {
  assert.deepEqual([0, 820, 4_200_000, 212_400_000, 999_600, 1_540_000_000].map(bytesOf), [
    "0 B",
    "820 B",
    "4 MB",
    "212 MB",
    "1 MB",
    "1.5 GB",
  ]);
  assert.equal(dayOf("2026-09-12T12:00:00.000Z", 2026), "12 Sep");
  assert.equal(dayOf("2025-12-03T12:00:00.000Z", 2026), "3 Dec 2025", "with its year when that is not this one");
});
