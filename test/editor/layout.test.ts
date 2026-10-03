import assert from "node:assert/strict";
import { test } from "node:test";
import { anchoredOf } from "../../editor/template/fold.ts";
import { graphOf } from "../../editor/template/graph.ts";
import { readTemplate } from "../../editor/template/read-template.ts";
import { BETWEEN_ROLES, FAN, fanned, laidOut } from "../../editor/ui/layout.ts";
import { slpFiles } from "./slp.ts";

// Rows of spec/CONFORMANCE.md, Editor.

test("a template that keeps no positions is laid out: every node placed, no two on top of each other", () => {
  const read = readTemplate(slpFiles());
  assert.ok(read.ok);
  const anchored = anchoredOf(graphOf(read.template));
  const size = { width: 250, height: 120 };

  const placed = laidOut(anchored, new Map(anchored.nodes.map((node) => [node.id, size])), BETWEEN_ROLES);

  assert.deepEqual([...placed.keys()].sort(), anchored.nodes.map((node) => node.id).sort());
  const boxes = [...placed];
  const overlapping = boxes.flatMap(([a, at], index) =>
    boxes
      .slice(index + 1)
      .filter(([, other]) => Math.abs(at.x - other.x) < size.width && Math.abs(at.y - other.y) < size.height)
      .map(([b]) => `${a} on ${b}`),
  );
  assert.deepEqual(overlapping, []);

  const rows = (family: string) =>
    new Set(anchored.nodes.flatMap((node) => (node.family === family ? [placed.get(node.id)!.y] : [])));
  assert.ok(rows("section").size > 0 && rows("question").size > 0 && rows("moment").size > 0);
  for (const [one, other] of [
    ["section", "question"],
    ["question", "moment"],
    ["watch", "section"],
  ] as const)
    assert.deepEqual(
      [...rows(one)].filter((y) => rows(other).has(y)),
      [],
      `${one} and ${other} share no row, so each frame holds its own family`,
    );
  assert.equal(rows("watch").size, 1, "the classifier and the two stacks sit on one row, in one frame");
});

test("two roles one role seats are laid out far enough apart for each to open all it has beside it", () => {
  const seat = (id: string, beside: number) => ({ id, family: "team", beside });
  const wires = ["lane", "task"].map((to) => ({ from: "root", to }));
  const nodes = [seat("root", 0), seat("lane", 12), seat("task", 12)];

  const placed = laidOut({ nodes, wires }, new Map(nodes.map(({ id }) => [id, { width: 250, height: 120 }])), 300);

  assert.ok(Math.abs(placed.get("lane")!.y - placed.get("task")!.y) >= 12 * FAN.pitch);
});

test("a role's opened equipment sits in a column at its left, clear of the role and of the roles that seat it", () => {
  const places = [0, 1, 2].map((at) => fanned(300, at, 3));

  assert.ok(
    places.every((at) => at.x + FAN.width < 0),
    "left of the role",
  );
  assert.ok(
    places.every((at) => at.x > -BETWEEN_ROLES),
    "and right of whatever is one rank before it",
  );
  assert.deepEqual(
    places.map((at) => at.y),
    [78, 126, 174],
    "one under the other, about the role's middle",
  );
});
