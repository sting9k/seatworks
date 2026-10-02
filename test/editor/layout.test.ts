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
});
