import assert from "node:assert/strict";
import { test } from "node:test";
import { tagOf } from "../../client/state/leftovers.ts";
import type { Leftover } from "../../shared/contracts/rpc.ts";

// A row of spec/CONFORMANCE.md, The Human's surface: what a leftover's line says of it.

const left = (kind: Leftover["kind"], more: Partial<Leftover> = {}): Leftover => ({
  id: `${kind}:p:x`,
  kind,
  project: "p",
  label: "x",
  why: "",
  removable: true,
  unmerged: 0,
  bytes: null,
  at: null,
  ...more,
});

test("a leftover's line says in a word or two what a sentence said: merged or how many commits are not, a draft, a seat ended", () => {
  assert.deepEqual(
    [
      tagOf(left("branch")),
      tagOf(left("branch", { unmerged: 3 })),
      tagOf(left("copy", { removable: false })),
      tagOf(left("agent")),
    ],
    [
      { label: "merged", tone: "success" },
      { label: "3 commits not merged", tone: "warning" },
      { label: "uncommitted work", tone: "neutral" },
      { label: "seat ended", tone: "neutral" },
    ],
  );
  assert.deepEqual(
    [tagOf(left("copy", { bytes: 4000 })), tagOf(left("record", { at: "2026-09-12T12:00:00.000Z" }))],
    [null, null],
    "a clean copy and a record say their size and their day, and no more",
  );
});
