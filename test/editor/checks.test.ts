import assert from "node:assert/strict";
import { test } from "node:test";
import { notesOf } from "../../editor/template/checks.ts";
import {
  addAsked,
  addRole,
  addRoute,
  addSection,
  addServer,
  giveServer,
  setServer,
  applied,
  type Edit,
  putFile,
  removeAsked,
  removeClassifier,
  renameRole,
  setAsked,
  setModels,
  setRoute,
  setSection,
  setTool,
  together,
  wired,
} from "../../editor/template/edits.ts";
import { graphOf } from "../../editor/template/graph.ts";
import { readTemplate, type Template, type TemplateFiles } from "../../editor/template/read-template.ts";
import { wordingOf } from "../../server/satellites/reflex/config.ts";
import { pairFiles } from "../pair.ts";
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

test("SLP as it comes draws no note", () => {
  assert.deepEqual(notes(slp), []);
});

test("a template that shares no role with SLP draws no note", () => {
  const pair = opened(pairFiles());

  assert.deepEqual(notesOf(pair, pair), []);
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

test("where a template leaves a role, a question or a moment with no way on, a note says so", () => {
  const profile = (from: string, to: string) => rewritten("profile.yaml", (text) => text.replace(from, to));
  const cases: [string, Edit, string][] = [
    [
      "a writer with no way to hand back",
      setTool("peer", "hand_back", false),
      "role:peer: it is not shown `hand_back`: it writes, so its work never comes back",
    ],
    [
      "a reader with no way to say what it found",
      setTool("reviewer", "record_verdict", false),
      "role:reviewer: it is not shown `record_verdict`: it reads a commit, so what it finds is evidence for nobody",
    ],
    [
      "a watching role with no way to tell",
      setTool("watcher", "attend", false),
      "role:watcher: it is not shown `attend`: it watches, so what it sees reaches nobody",
    ],
    [
      "a role that seats others and cannot open a scope",
      setTool("lead", "open_scope", false),
      "role:lead: it is not shown `open_scope`: it seats other roles, so it can seat none",
    ],
    [
      "a role that seats others and cannot take their work in",
      setTool("lead", "integrate", false),
      "role:lead: it is not shown `integrate`: it seats other roles, so their work is never taken in",
    ],
    [
      "a tool shown to a role with no door to the Human",
      setTool("peer", "ask_human", true),
      "role:peer: it is shown `ask_human`, which it is always refused: only a role with `humanDoor` asks the Human",
    ],
    [
      "a tool to attend shown to a role that does not watch",
      setTool("peer", "attend", true),
      "role:peer: it is shown `attend`, which it is always refused: only a role that watches attends",
    ],
    [
      "a tool to open a scope shown to a role that seats none",
      setTool("peer", "open_scope", true),
      "role:peer: it is shown `open_scope`, which it is always refused: it seats no role",
    ],
    [
      "a role shown the report in a template that names no section of one",
      rewritten("profile.yaml", (text) => text.replace(/\nreport:\n( {2}.*\n)+/, "\n")),
      "role:lead: it is shown `report`, and the template names no section a report has, so its reports say nothing",
    ],
    ["a role nobody seats", addRole("planner"), "role:planner: no role seats it, so it never joins the team"],
    [
      "a role with no agent profile",
      addRole("planner"),
      "role:planner: it names no agent profile, so whoever seats it must name one each time",
    ],
    [
      "a root with no agent profile",
      profile("    models: [slp-supervisor]\n", ""),
      "role:supervisor: it is the root and names no agent profile, so a project cannot start",
    ],
    ["a role with no prompt", profile("    prompt: roles/watcher.md\n", ""), "role:watcher: it has no prompt"],
    [
      "a question asked on what is no event of the record",
      rewritten("reflex.yaml", (text) => text.replace("on: [report_made]", "on: [report_written]")),
      "question:unrecorded-structure: it is asked on `report_written`, which is not an event a question is asked on",
    ],
    [
      "a question whose state reads what the record does not have",
      rewritten("reflex.yaml", (text) =>
        text.replace(
          "state: { goal: brief.goal }\n    noul: Does `goal` fail",
          "state: { goal: brief.aim }\n    noul: Does `goal` fail",
        ),
      ),
      "question:unobservable-goal: its state reads `brief.aim`, which the record does not have",
    ],
    [
      "a question that tells nobody the plugin knows",
      rewritten("reflex.yaml", (text) => text.replace("tells: answerer", "tells: owner")),
      "question:cannot-be-undone: it tells `owner`, which is not one of root, parent, self, answerer, evidence",
    ],
    [
      "a moment watching a role the template does not have",
      rewritten("watch.yaml", (text) => text.replace("watches: [peer]", "watches: [builder]")),
      "moment:trades-the-goal: it watches builder, which is not a role of the template",
    ],
    [
      "a moment counted in code under a name the plugin does not count",
      rewritten(
        "watch.yaml",
        (text) => `${text}\n  stalled:\n    watches: [peer]\n    by: code\n    fact: nothing moved\n`,
      ),
      "moment:stalled: it is counted in code, and no moment of this name is: going-in-circles, check-made-to-pass, silent-without-progress, findings-waiting, past-appetite are",
    ],
  ];
  for (const [name, edit, expected] of cases) {
    const found = notes(changed(slp, edit)).filter((note) => !notes(slp).includes(note));
    assert.ok(found.includes(expected), `${name}: ${JSON.stringify(found)}`);
  }
});

test("a prompt that names a read draws no note: every agent reads the record, whatever its tools list", () => {
  const after = changed(
    slp,
    rewritten("roles/peer.md", (text) => `${text}\nUse \`look\` on an agent only where \`status\` points you.\n`),
  );

  assert.equal(slp.profile.roles.get("peer")!.tools.has("look"), false);
  assert.deepEqual(notes(after), notes(slp));
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

test("an outside server draws a note while it is its skeleton, while no role is given it, and when a secret is written in it", () => {
  const about = (template: Template) => notes(template).filter((note) => note.startsWith("server:tickets"));
  const declared = changed(slp, addServer("tickets"));
  assert.deepEqual(about(declared), [
    "server:tickets: it still holds the skeleton's words",
    "server:tickets: no role is given it",
  ]);

  const named = changed(
    declared,
    together(
      setServer("tickets", { type: "stdio", command: "npx", args: ["tickets"], env: { TOKEN: "$TICKETS_TOKEN" } }),
      giveServer("lead", "tickets", ["search"]),
    ),
  );
  assert.deepEqual(about(named), []);

  const written = changed(
    named,
    setServer("tickets", { type: "stdio", command: "npx", args: ["tickets"], env: { TOKEN: "AKIAABCDEFGHIJKLMNOP" } }),
  );
  assert.deepEqual(about(written), [
    "server:tickets: its settings hold what looks like a secret: name a variable as $NAME, and keep the secret on the machine",
  ]);
});

test("a report section draws a note while it is its skeleton, and none once it says what it holds", () => {
  const about = (template: Template) => notes(template).filter((note) => note.startsWith("section:"));
  const added = changed(slp, addSection("risks"));
  assert.deepEqual(about(added), ["section:risks: it still holds the skeleton's words"]);
  assert.deepEqual(about(changed(added, setSection("risks", "Each risk nobody owns yet."))), []);
});

test("with no classifier each question and moment a model would answer says it is never asked; a classifier draws a note while a route is its skeleton, and when nothing is asked of it", () => {
  const never = "it is asked of a model, and the template names no classifier, so it is never asked";
  const none = changed(slp, removeClassifier());
  const said = notes(none);
  assert.ok(said.includes(`question:names-method: ${never}`));
  assert.ok(said.includes(`moment:big-decision: ${never}`));
  assert.ok(said.includes(`moment:mints-an-api: ${never}`), "one that asks only once code finds a name, too");
  assert.ok(!said.some((note) => note.startsWith("moment:going-in-circles")), "what code counts asks no model");
  const asked = [...slp.questions, ...slp.moments].filter((one) => one.active && one.spec.by !== "code");
  assert.equal(said.length, asked.length, "one note for each that is asked, and no other");

  const back = changed(none, addRoute("own"));
  assert.deepEqual(notes(back), ["classifier: its route own still holds the skeleton's words"]);
  const served = setRoute("own", { endpoint: "https://models.example/v1/systemone", model: "m-1", budget: 8000 });
  assert.deepEqual(notes(changed(back, served)), []);

  const pair = opened(pairFiles());
  const unasked = applied(pair, together(addRoute("own"), served));
  assert.ok(unasked.ok);
  assert.deepEqual(
    notesOf(unasked.template, pair).map((note) => `${note.node}: ${note.says}`),
    ["classifier: no question and no moment is asked of it"],
  );
});
