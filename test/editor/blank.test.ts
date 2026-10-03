import assert from "node:assert/strict";
import { test } from "node:test";
import { blankTemplate } from "../../editor/template/blank.ts";
import { notesOf } from "../../editor/template/checks.ts";
import { addRole, applied, setJob, together, wired } from "../../editor/template/edits.ts";
import { graphOf } from "../../editor/template/graph.ts";
import { readTemplate } from "../../editor/template/read-template.ts";

// Rows of spec/CONFORMANCE.md, Editor: a template started from nothing.

test("a template started from nothing loads: one role the Human works with, wired to the Human, and nothing else", () => {
  const made = blankTemplate("Night crew");
  assert.ok(made.ok);
  const read = readTemplate(made.files);
  assert.ok(read.ok, read.ok ? "" : read.says);

  const graph = graphOf(read.template);
  assert.equal(read.template.about.name, "Night crew");
  assert.deepEqual(
    graph.nodes.filter((node) => node.kind !== "tools").map((node) => node.kind),
    ["human", "role"],
  );
  const role = graph.nodes.find((node) => node.kind === "role")!;
  assert.deepEqual([role.properties, role.job], [["root", "humanDoor"], null]);
  assert.deepEqual(
    graph.wires.map((wire) => [wire.kind, wire.from, wire.to]),
    [["human", role.id, "human"]],
  );
  assert.deepEqual(
    notesOf(read.template, read.template).map((note) => note.says),
    [
      "it is the root and names no agent profile, so a project cannot start",
      "its prompt still holds the skeleton's words",
    ],
    "its notes say what is left to do, and none says it asks for a tool it is refused or lacks one it needs",
  );

  const grown = applied(
    read.template,
    together(addRole("helper"), setJob("first", "delegates"), wired("spawns", "role:first", "role:helper", true)),
  );
  assert.ok(grown.ok, grown.ok ? "it is added to as any template is" : grown.says);
  assert.deepEqual([...grown.template.profile.roles.get("first")!.spawns], ["helper"]);
});

test("a template is not started under a name with no letter or digit, which it could not be installed under", () => {
  const made = blankTemplate(" — ");
  assert.ok(!made.ok);
  assert.match(made.says, /letter or digit/);
});
