import assert from "node:assert/strict";
import { test } from "node:test";
import { agoOf, bytesOf, dayOf, sinceOf } from "../../client/state/words.ts";

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

test("how long ago a thing was done is said to the minute, then to the hour", () => {
  assert.deepEqual([0, 59_000, 60_000, 14 * 60_000 + 30_000, 59 * 60_000, 60 * 60_000, 5 * 3_600_000].map(agoOf), [
    "just now",
    "just now",
    "1 min ago",
    "14 min ago",
    "59 min ago",
    "1 h ago",
    "5 h ago",
  ]);
});

test("how long since a thing happened is said short, for a column of its own: to the minute, the hour, then the day", () => {
  assert.deepEqual([0, 2 * 60_000, 59 * 60_000, 3 * 3_600_000, 23 * 3_600_000, 50 * 3_600_000].map(sinceOf), [
    "now",
    "2 min",
    "59 min",
    "3 h",
    "23 h",
    "2 d",
  ]);
});
