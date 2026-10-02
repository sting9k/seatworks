import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";
import { type Graph, graphOf } from "../../editor/template/graph.ts";
import { readTemplate } from "../../editor/template/read-template.ts";
import { TOOL_GROUPS } from "../../editor/template/tool-groups.ts";
import { ROLE_TOOLS } from "../../shared/contracts/tools.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Editor: a template's files in, the graph a person sees out.

function opened(files: ReadonlyMap<string, string>): Graph {
  const read = readTemplate(files);
  assert.ok(read.ok, read.ok ? "" : read.says);
  return graphOf(read.template);
}

type RoleFile = { spawns?: string[]; skills?: string[]; tools?: string[]; humanDoor?: boolean; speaksTo?: string[] };
const files = slpFiles();
const yaml = (path: string): unknown => parse(files.get(path)!);
const roles = Object.entries((yaml("profile.yaml") as { roles: Record<string, RoleFile> }).roles);
const { questions } = yaml("reflex.yaml") as { questions: Record<string, unknown> };
const { moments } = yaml("watch.yaml") as { moments: Record<string, { watches?: string[] }> };

const ids = (graph: Graph, kind: string) =>
  graph.nodes
    .filter((n) => n.kind === kind)
    .map((n) => n.id)
    .sort();
const wires = (graph: Graph, kind: string) =>
  graph.wires
    .filter((w) => w.kind === kind)
    .map((w) => `${w.from} > ${w.to}`)
    .sort();

test("the SLP profile opens as a graph: a node for all its files name and a wire for all they join", () => {
  const graph = opened(files);

  assert.deepEqual(ids(graph, "role"), roles.map(([name]) => `role:${name}`).sort());
  assert.deepEqual(
    ids(graph, "skill"),
    [...new Set(roles.flatMap(([, r]) => r.skills ?? []))].map((s) => `skill:${s}`).sort(),
  );
  assert.deepEqual(
    ids(graph, "question"),
    Object.keys(questions)
      .map((q) => `question:${q}`)
      .sort(),
  );
  assert.deepEqual(
    ids(graph, "moment"),
    Object.keys(moments)
      .map((m) => `moment:${m}`)
      .sort(),
  );
  assert.deepEqual(ids(graph, "human"), ["human"]);

  assert.deepEqual(
    wires(graph, "spawns"),
    roles.flatMap(([name, r]) => (r.spawns ?? []).map((to) => `role:${name} > role:${to}`)).sort(),
  );
  assert.deepEqual(
    wires(graph, "skill"),
    roles.flatMap(([name, r]) => (r.skills ?? []).map((s) => `skill:${s} > role:${name}`)).sort(),
  );
  assert.deepEqual(
    wires(graph, "watches"),
    Object.entries(moments)
      .flatMap(([name, m]) => (m.watches ?? []).map((role) => `moment:${name} > role:${role}`))
      .sort(),
  );
  assert.deepEqual(
    wires(graph, "human"),
    roles
      .filter(([, r]) => r.humanDoor === true || (r.speaksTo ?? []).includes("human"))
      .map(([name]) => `role:${name} > human`)
      .sort(),
  );
});

test("each role's ticked tools are exactly its `tools` in the profile, in its node's groups or on a wire to it", () => {
  const graph = opened(files);

  for (const [name, role] of roles) {
    const node = graph.nodes.find((n) => n.id === `role:${name}`);
    assert.ok(node?.kind === "role");
    const inNode = node.groups.flatMap((g) => g.tools.filter((t) => t.ticked).map((t) => t.name));
    const onWires = graph.wires.flatMap((w) => (w.kind === "tools" && w.to === node.id ? w.tools : []));
    assert.deepEqual([...inNode, ...onWires].sort(), [...(role.tools ?? [])].sort(), name);
  }
});

test("a template that names a skill it does not carry does not open, and says which", () => {
  const without = new Map(files);
  const [, first] = roles.find(([, r]) => (r.skills ?? []).length > 0)!;
  const skill = first.skills![0]!;
  without.delete(`skills/${skill}/SKILL.md`);

  const read = readTemplate(without);

  assert.ok(!read.ok);
  assert.match(read.says, new RegExp(skill));
});

test("every tool a role may be given sits in one of the editor's groups, and in one only", () => {
  const grouped = TOOL_GROUPS.flatMap((group): readonly string[] => group.tools);
  assert.deepEqual([...grouped].sort(), [...ROLE_TOOLS].sort());
});
