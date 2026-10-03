import assert from "node:assert/strict";
import { test } from "node:test";
import { type Queued, entering } from "../../server/satellites/delivery/into-turn.ts";

// The rows of spec/CONFORMANCE.md, Into a turn, that are about time: what waits, and for how long.

const rule = { patience: 120, rest: 90 };
const at = (seconds: number) => seconds * 1000;
const q = (key: string, entry: Queued["entry"], queued: number): Queued => ({ key, entry, at: at(queued) });

test("what would wake an idle reader enters a busy one's turn only once it has waited out the template's patience", () => {
  const queue = [q("question", "soon", 0), q("note", "end", 0)];
  assert.deepEqual(entering(queue, at(119), null, rule), [], "not before");
  assert.deepEqual(entering(queue, at(120), null, rule), ["question"], "then, and what asks nothing stays for the end");
});

test("a direction enters at the next step, and takes with it everything that would wake", () => {
  const queue = [q("question", "soon", 10), q("direction", "now", 11), q("note", "end", 12)];
  assert.deepEqual(entering(queue, at(12), null, rule), ["question", "direction"], "oldest first, as they were queued");
});

test("after an entry the reader rests: what waited goes on waiting, a direction does not", () => {
  const waited = [q("question", "soon", 0)];
  assert.deepEqual(entering(waited, at(200), at(150), rule), [], "50 seconds after the last entry");
  assert.deepEqual(entering(waited, at(240), at(150), rule), ["question"], "the rest is over");
  assert.deepEqual(entering([...waited, q("direction", "now", 190)], at(200), at(150), rule), [
    "question",
    "direction",
  ]);
});
