import assert from "node:assert/strict";
import { test } from "node:test";
import { graphOf } from "../../editor/template/graph.ts";
import { readTemplate } from "../../editor/template/read-template.ts";
import { laidOut } from "../../editor/ui/layout.ts";
import { slpFiles } from "./slp.ts";

// A row of spec/CONFORMANCE.md, Editor.

test("a template that keeps no positions is laid out: every node placed, no two on top of each other", () => {
  const read = readTemplate(slpFiles());
  assert.ok(read.ok);
  const graph = graphOf(read.template);
  const size = { width: 250, height: 120 };

  const placed = laidOut(graph, new Map(graph.nodes.map((node) => [node.id, size])));

  assert.deepEqual([...placed.keys()].sort(), graph.nodes.map((node) => node.id).sort());
  const boxes = [...placed];
  const overlapping = boxes.flatMap(([a, at], index) =>
    boxes
      .slice(index + 1)
      .filter(([, other]) => Math.abs(at.x - other.x) < size.width && Math.abs(at.y - other.y) < size.height)
      .map(([b]) => `${a} on ${b}`),
  );
  assert.deepEqual(overlapping, []);

  const rows = (kind: string) =>
    new Set(graph.nodes.flatMap((node) => (node.kind === kind ? [placed.get(node.id)!.y] : [])));
  const questionRows = rows("question");
  assert.ok(rows("section").size > 0 && questionRows.size > 0);
  assert.deepEqual(
    [...rows("section")].filter((y) => questionRows.has(y)),
    [],
    "the report's sections share no row with the questions, so each frame holds its own family",
  );
});
