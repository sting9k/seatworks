import assert from "node:assert/strict";
import { test } from "node:test";
import { notesOf } from "../../editor/template/checks.ts";
import {
  addAsked,
  addRole,
  applied,
  type Edit,
  putFile,
  removeAsked,
  renameRole,
  setAsked,
  setModels,
  setTool,
  together,
  wired,
} from "../../editor/template/edits.ts";
import { graphOf } from "../../editor/template/graph.ts";
import { readTemplate, type Template, type TemplateFiles } from "../../editor/template/read-template.ts";
import { wordingOf } from "../../server/satellites/reflex/config.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Editor: what a machine sees in a template, as a note on a node.

function opened(files: TemplateFiles): Template {
  const read = readTemplate(files);
  assert.ok(read.ok, read.ok ? "" : read.says);
  return read.template;
}
function changed(template: Template, edit: Edit): Template {
  const made = applied(template, edit);
  assert.ok(made.ok, made.ok ? "" : made.says);
  return made.template;
}
const slp = opened(slpFiles());
const notes = (template: Template) => notesOf(template, slp).map((note) => `${note.node}: ${note.says}`);
const rewritten = (path: string, change: (text: string) => string) => putFile(path, change(slp.files.get(path)!));
const filesChanged = (after: Template) =>
  [...new Set([...slp.files.keys(), ...after.files.keys()])]
    .filter((path) => slp.files.get(path) !== after.files.get(path))
    .sort();

test("the shipped SLP template draws no note", () => {
  assert.deepEqual(notes(slp), []);
});

test("each thing a machine can see in a template is a note on the node it is about", () => {
  const cases: [string, Edit, string][] = [
    [
      "a tool unticked that the prompt names",
      setTool("peer", "hand_back", false),
      "role:peer: its prompt names `hand_back`, which the role is not shown",
    ],
    [
      "a role renamed that prompts still name",
      renameRole("reviewer", "reader"),
      "role:lead: its prompt still names reviewer, a role the template no longer has",
    ],
    [
      "a watched role told of the watch",
      rewritten("roles/peer.md", (text) => `${text}\nThe watcher reads your turns.\n`),
      "role:peer: its prompt names the watch, which a role that is watched is never told of",
    ],
    ["a role fresh from its skeleton", addRole("planner"), "role:planner: its prompt still holds the skeleton's words"],
    [
      "a skill named otherwise than its folder",
      rewritten("skills/spike/SKILL.md", (text) => text.replace("name: spike", "name: prototype")),
      "skill:spike: it is named prototype in its file and spike by its folder",
    ],
    [
      "a skill that does not say when to use it",
      rewritten("skills/spike/SKILL.md", (text) => text.replace(/^description:.*$/m, 'description: "Finds one fact."')),
      "skill:spike: its description does not say when to use it",
    ],
    [
      "a skill pointing at a file that is not beside it",
      rewritten("skills/spike/SKILL.md", (text) => `${text}\nSee [the form](form.md).\n`),
      "skill:spike: it points at form.md, which is not beside it",
    ],
    [
      "a question asking of a field its state lacks",
      rewritten("reflex.yaml", (text) =>
        text.replace("Does `goal` or a line of `constraints` name", "Does `brief` name"),
      ),
      "question:names-method: it asks of `brief`, which is not in its state",
    ],
    [
      "a question with one outcome described",
      rewritten("reflex.yaml", (text) => text.replace(/^ {4}yes: A line says which approach.*\n/m, "")),
      "question:names-method: it does not describe both a yes and a no",
    ],
  ];
  for (const [name, edit, expected] of cases) {
    const found = notes(changed(slp, edit)).filter((note) => !notes(slp).includes(note));
    assert.ok(found.includes(expected), `${name}: ${JSON.stringify(found)}`);
  }
});

test("a file put beside a skill is kept, and a skill that points at it draws no note", () => {
  const after = changed(
    slp,
    together(
      rewritten("skills/spike/SKILL.md", (text) => `${text}\nSee [the form](form.md).\n`),
      putFile("skills/spike/form.md", "# The form\n"),
    ),
  );

  assert.deepEqual(filesChanged(after), ["skills/spike/SKILL.md", "skills/spike/form.md"]);
  assert.deepEqual(notes(after), notes(slp));
});

test("a role's always-on words are its prompt's and its skills' descriptions'", () => {
  const words = (template: Template, role: string) => {
    const node = graphOf(template).nodes.find((candidate) => candidate.id === `role:${role}`);
    assert.ok(node?.kind === "role");
    return node.alwaysOn;
  };
  const count = (text: string) => text.split(/\s+/).filter((word) => word !== "").length;
  const description = slp.skills.get("grilling")!.description;

  const after = changed(slp, wired("skill", "skill:grilling", "role:reviewer", true));

  assert.equal(words(after, "reviewer") - words(slp, "reviewer"), count(description));
  assert.ok(words(slp, "reviewer") > count(slp.files.get("roles/reviewer.md")!));
});

test("a question starts written and not asked, is asked by one line of its file, and taken away leaves the file as it was", () => {
  const added = changed(slp, addAsked("question", "names-a-date"));
  const node = (template: Template) => graphOf(template).nodes.find((n) => n.id === "question:names-a-date");
  assert.deepEqual(filesChanged(added), ["reflex.yaml"]);
  const written = node(added);
  assert.ok(written?.kind === "question" && !written.active);

  const asked = changed(added, setAsked("question", "names-a-date", true));
  const lines = (template: Template) => template.files.get("reflex.yaml")!.split("\n");
  assert.deepEqual(
    lines(asked).filter((line) => !lines(added).includes(line)),
    ["  - names-a-date"],
  );
  assert.equal(lines(asked).length, lines(added).length + 1);

  const gone = changed(asked, removeAsked("question", "names-a-date"));
  assert.deepEqual(filesChanged(gone), []);
});

test("a role's models are set in its own line of the profile", () => {
  const after = changed(slp, setModels("peer", ["fast", "slp-peer"]));
  const node = graphOf(after).nodes.find((candidate) => candidate.id === "role:peer");

  assert.ok(node?.kind === "role");
  assert.deepEqual(node.models, ["fast", "slp-peer"]);
  assert.deepEqual(
    after.files
      .get("profile.yaml")!
      .split("\n")
      .filter((line) => !slp.files.get("profile.yaml")!.split("\n").includes(line)),
    ["    models: [fast, slp-peer]"],
  );
});

test("a question reworded after its threshold was earned is shown as not yet earned", () => {
  const spec = slp.questions.find((question) => question.name === "names-method")!.spec;
  const earnedFor = `    tell: 0.9\n    for: { wording: "${wordingOf(spec)}", model: jev }\n`;
  const earned = changed(
    slp,
    rewritten("reflex.yaml", (text) => text.replace("    tell: 0.9\n", earnedFor)),
  );
  const node = (template: Template) => graphOf(template).nodes.find((n) => n.id === "question:names-method");
  const first = node(earned);
  assert.ok(first?.kind === "question");
  assert.equal(first.earned, "earned");
  assert.deepEqual(notes(earned), notes(slp));

  const reworded = changed(
    earned,
    putFile(
      "reflex.yaml",
      earned.files.get("reflex.yaml")!.replace("Does `goal` or a line", "Does `goal` or any line"),
    ),
  );

  const second = node(reworded);
  assert.ok(second?.kind === "question");
  assert.equal(second.earned, "reworded");
  assert.ok(
    notes(reworded).includes(
      "question:names-method: its words changed since its threshold was earned, so it is not yet earned",
    ),
  );
});
