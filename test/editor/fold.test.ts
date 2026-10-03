import assert from "node:assert/strict";
import { test } from "node:test";
import { addSkill, applied } from "../../editor/template/edits.ts";
import { anchoredOf, foldedInto, shownOf, STACKS } from "../../editor/template/fold.ts";
import { type Graph, graphOf } from "../../editor/template/graph.ts";
import { readTemplate } from "../../editor/template/read-template.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Editor: what of a template's graph is on the canvas.

function slp() {
  const read = readTemplate(slpFiles());
  assert.ok(read.ok);
  return read.template;
}
const NONE = { roles: new Set<string>(), stacks: new Set<"question" | "moment">() };
const kinds = (graph: Graph, shown: ReadonlySet<string>) =>
  [...new Set(graph.nodes.filter((node) => shown.has(node.id)).map((node) => node.kind))].sort();
const skillsOf = (graph: Graph, shown: ReadonlySet<string>) =>
  graph.nodes
    .filter((node) => node.kind === "skill" && shown.has(node.id))
    .map((node) => node.id)
    .sort();

test("with nothing opened a template shows its roles, the Human, the classifier and its report's sections, and every role says how much is folded into it", () => {
  const graph = graphOf(slp());

  assert.deepEqual(kinds(graph, shownOf(graph, NONE, null, new Set())), ["classifier", "human", "role", "section"]);
  assert.deepEqual(foldedInto(graph, "role:peer"), { skills: 8, more: 2 });
  assert.deepEqual(foldedInto(graph, "role:watcher"), { skills: 0, more: 0 });
});

test("a role opened shows what is wired into it, a skill two roles share among it, and a role picked opens nothing; a stack opened shows its family", () => {
  const graph = graphOf(slp());
  const opened = shownOf(graph, { ...NONE, roles: new Set(["role:reviewer"]) }, null, new Set());
  assert.deepEqual(skillsOf(graph, opened), ["skill:proof-audit", "skill:security-check"]);
  assert.deepEqual(skillsOf(graph, shownOf(graph, NONE, "role:supervisor", new Set())), []);

  const asked = shownOf(graph, { ...NONE, stacks: new Set(["question"]) }, null, new Set());
  assert.deepEqual(kinds(graph, asked), ["classifier", "human", "question", "role", "section"]);
});

test("never folded: a skill no role has, a node that carries a note, and a node picked from the list", () => {
  const made = applied(slp(), addSkill("release-notes"));
  assert.ok(made.ok);
  const graph = graphOf(made.template);

  assert.deepEqual(skillsOf(graph, shownOf(graph, NONE, null, new Set())), ["skill:release-notes"]);
  assert.ok(shownOf(graph, NONE, null, new Set(["question:claim-gap"])).has("question:claim-gap"));
  assert.ok(shownOf(graph, NONE, "skill:grilling", new Set()).has("skill:grilling"));
});

test("the graph that is laid out leaves out what sits beside a role, and holds a stack for each family that folds", () => {
  const graph = graphOf(slp());
  const anchored = anchoredOf(graph);
  const ids = new Set(anchored.nodes.map((node) => node.id));

  assert.ok(!ids.has("skill:grilling"), "a skill a role has is placed beside its role, not laid out");
  for (const stack of STACKS) assert.ok(ids.has(stack.id));
  assert.equal(
    anchored.nodes.find((node) => node.id === "role:peer")?.beside,
    10,
    "and a role says how many those are",
  );
  assert.deepEqual(
    [...new Set(anchored.wires.map((wire) => wire.kind))].sort(),
    ["human", "spawns"],
    "only what places a node is a wire of the layout",
  );
});
