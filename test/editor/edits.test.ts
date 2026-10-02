import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRole,
  addRoute,
  addSection,
  addServer,
  addSkill,
  addStep,
  applied,
  giveServer,
  removeServer,
  setServer,
  type Edit,
  removeClassifier,
  removeRole,
  removeRoute,
  removeSection,
  removeSkill,
  removeStep,
  renameAsked,
  renameRole,
  renameSection,
  renameSkill,
  setProperty,
  setRoute,
  setSection,
  setStep,
  setTool,
  together,
  wired,
} from "../../editor/template/edits.ts";
import { type Graph, graphOf } from "../../editor/template/graph.ts";
import { readTemplate, type Template, type TemplateFiles } from "../../editor/template/read-template.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Editor: a template in, a change a person makes, its files out.

function opened(files: TemplateFiles): Template {
  const read = readTemplate(files);
  assert.ok(read.ok, read.ok ? "" : read.says);
  return read.template;
}

function changed(template: Template, edit: Edit): Template {
  const made = applied(template, edit);
  assert.ok(made.ok, made.ok ? "" : made.says);
  return opened(made.files);
}

/** The lines of a file that are not as they were, by their text. */
function linesChanged(before: Template, after: Template, path: string): string[] {
  const was = new Set(before.files.get(path)!.split("\n"));
  return after.files
    .get(path)!
    .split("\n")
    .filter((line) => !was.has(line));
}
const filesChanged = (before: Template, after: Template) =>
  [...new Set([...before.files.keys(), ...after.files.keys()])]
    .filter((path) => before.files.get(path) !== after.files.get(path))
    .sort();

const role = (graph: Graph, name: string) => {
  const node = graph.nodes.find((candidate) => candidate.id === `role:${name}`);
  assert.ok(node?.kind === "role", `no role ${name}`);
  return node;
};
const ticked = (graph: Graph, name: string) =>
  role(graph, name)
    .groups.flatMap((group) => group.tools.filter((tool) => tool.ticked).map((tool) => tool.name))
    .sort();
const wires = (graph: Graph, kind: string) =>
  graph.wires.filter((wire) => wire.kind === kind).map((wire) => `${wire.from} > ${wire.to}`);

const slp = opened(slpFiles());

test("a tool unticked for one role leaves that role's tools, and touches no other line of the profile", () => {
  const after = changed(slp, setTool("lead", "handover", false));

  assert.ok(!ticked(graphOf(after), "lead").includes("handover"));
  assert.ok(ticked(graphOf(after), "supervisor").includes("handover"));
  assert.deepEqual(filesChanged(slp, after), ["profile.yaml"]);
  const lines = linesChanged(slp, after, "profile.yaml");
  assert.ok(lines.length > 0 && lines.length <= 4, lines.join("\n"));
  assert.ok(lines.every((line) => !line.includes("#")));
  assert.equal(
    after.files
      .get("profile.yaml")!
      .split("\n")
      .filter((line) => line.startsWith("#")).length,
    slp.files
      .get("profile.yaml")!
      .split("\n")
      .filter((line) => line.startsWith("#")).length,
  );
});

test("a property switched on brings its groups ticked, and switched off takes them away", () => {
  const withRole = changed(slp, addRole("planner"));
  assert.deepEqual(ticked(graphOf(withRole), "planner"), ["answer", "diff", "record", "send_message", "status"]);

  const delegating = changed(withRole, setProperty("planner", "delegates", true));
  const groups = role(graphOf(delegating), "planner").groups.map((group) => group.name);
  for (const name of ["Scopes", "Plan", "Acceptance", "Attention", "Hand-back"]) assert.ok(groups.includes(name), name);
  assert.ok(role(graphOf(delegating), "planner").groups.every((group) => group.tools.every((tool) => tool.ticked)));

  const back = changed(delegating, setProperty("planner", "delegates", false));
  assert.deepEqual(ticked(graphOf(back), "planner"), ticked(graphOf(withRole), "planner"));
});

test("the root switched on for a second role moves there: a template has one root", () => {
  const after = changed(slp, setProperty("lead", "root", true));

  assert.equal(after.profile.root.name, "lead");
  assert.ok(!role(graphOf(after), "supervisor").properties.includes("root"));
});

test("a change that would leave a template that does not load is not made, and says why", () => {
  const made = applied(slp, setProperty("lead", "delegates", false));

  assert.ok(!made.ok);
  assert.match(made.says, /lead/);
  assert.match(made.says, /delegate/);
});

test("a wire drawn is in the files as what its kind becomes, and taken away it is gone", () => {
  const graph = graphOf(slp);
  const cases: [Parameters<typeof wired>[0], string, string, string][] = [
    ["spawns", "role:lead", "role:watcher", "profile.yaml"],
    ["skill", "skill:grilling", "role:peer", "profile.yaml"],
    ["tools", "tools:findings", "role:supervisor", "profile.yaml"],
    ["human", "role:lead", "human", "profile.yaml"],
    ["watches", "moment:detour", "role:lead", "watch.yaml"],
  ];
  for (const [kind, from, to, file] of cases) {
    assert.ok(!wires(graph, kind).includes(`${from} > ${to}`), `${kind} is already there`);
    const drawn = changed(slp, wired(kind, from, to, true));
    assert.ok(wires(graphOf(drawn), kind).includes(`${from} > ${to}`), kind);
    assert.deepEqual(filesChanged(slp, drawn), [file], kind);

    const gone = changed(drawn, wired(kind, from, to, false));
    assert.ok(!wires(graphOf(gone), kind).includes(`${from} > ${to}`), kind);
  }
});

test("a role renamed is followed by every place that named it, and its prompt's file", () => {
  const after = changed(slp, renameRole("peer", "builder"));
  const graph = graphOf(after);

  assert.ok(wires(graph, "spawns").includes("role:lead > role:builder"));
  assert.ok(wires(graph, "watches").includes("moment:detour > role:builder"));
  assert.equal(role(graph, "builder").file, "roles/builder.md");
  assert.equal(after.files.get("roles/builder.md"), slp.files.get("roles/peer.md"));
  assert.ok(!after.files.has("roles/peer.md"));
  assert.deepEqual(ticked(graph, "builder"), ticked(graphOf(slp), "peer"));
  assert.ok(graph.nodes.every((node) => node.id !== "role:peer"));
});

test("a role taken away leaves nothing naming it, and its prompt goes with it", () => {
  const after = changed(slp, removeRole("reviewer"));
  const graph = graphOf(after);

  assert.ok(graph.nodes.every((node) => node.id !== "role:reviewer"));
  assert.ok(graph.wires.every((wire) => wire.from !== "role:reviewer" && wire.to !== "role:reviewer"));
  assert.ok(!after.files.has("roles/reviewer.md"));
  assert.ok(!after.files.get("profile.yaml")!.includes("reviewer"));
});

test("a role added and taken away again leaves every file as it was, to the byte", () => {
  const added = changed(slp, together(addRole("planner"), wired("spawns", "role:lead", "role:planner", true)));
  assert.match(added.files.get("profile.yaml")!, /\n\n {2}planner:\n/);

  const back = changed(added, removeRole("planner"));

  assert.deepEqual(filesChanged(slp, back), []);
});

test("a skill added is a node before any role has it, and taken away it leaves every role", () => {
  const added = changed(slp, addSkill("estimating"));
  assert.ok(graphOf(added).nodes.some((node) => node.id === "skill:estimating"));
  assert.match(added.files.get("skills/estimating/SKILL.md")!, /^---\nname: estimating\n/);

  const gone = changed(slp, removeSkill("domain-docs"));
  assert.ok(graphOf(gone).nodes.every((node) => node.id !== "skill:domain-docs"));
  assert.ok(wires(graphOf(gone), "skill").every((wire) => !wire.startsWith("skill:domain-docs")));
  assert.ok([...gone.files.keys()].every((path) => !path.startsWith("skills/domain-docs/")));
});

test("steps saved are a line each in `flow.md`, in order, each with its role and where the work goes next", () => {
  const after = changed(
    slp,
    together(
      addStep("Plan"),
      addStep("Work"),
      setStep("plan", { text: "The lane is split by who writes which files." }),
      wired("does", "role:lead", "step:plan", true),
      wired("does", "role:peer", "step:work", true),
      wired("then", "step:plan", "step:work", true),
      wired("then", "step:work", "step:plan", true),
    ),
  );

  assert.equal(
    after.files.get("flow.md"),
    [
      "# The team's flow",
      "",
      "1. **Plan** (lead). The lane is split by who writes which files. Then: Work.",
      "2. **Work** (peer). Then: Plan.",
      "",
    ].join("\n"),
  );
  assert.deepEqual(filesChanged(slp, after), ["flow.md", "profile.yaml", "template.json"]);
  assert.deepEqual(linesChanged(slp, after, "profile.yaml"), ["flow: flow.md"]);
  assert.deepEqual(wires(graphOf(after), "then"), ["step:plan > step:work", "step:work > step:plan"]);

  const none = changed(after, together(removeStep("plan"), removeStep("work")));
  assert.deepEqual(filesChanged(slp, none), ["template.json"]);
});

test("a skill renamed keeps its folder's files, its name in its file and its place in every role that has it", () => {
  const after = changed(slp, renameSkill("domain-docs", "project-docs"));

  assert.deepEqual(
    wires(graphOf(after), "skill").filter((wire) => wire.startsWith("skill:project-docs")),
    wires(graphOf(slp), "skill")
      .filter((wire) => wire.startsWith("skill:domain-docs"))
      .map((wire) => wire.replace("domain-docs", "project-docs")),
  );
  assert.match(after.files.get("skills/project-docs/SKILL.md")!, /^---\nname: project-docs\n/);
  assert.ok([...after.files.keys()].every((path) => !path.startsWith("skills/domain-docs/")));
  assert.equal(after.skills.get("project-docs")!.description, slp.skills.get("domain-docs")!.description);
  assert.equal(linesChanged(slp, after, "profile.yaml").length, 2);
});

test("a question renamed keeps its place in its file and in the list of those asked", () => {
  const after = changed(slp, renameAsked("question", "cause-as-fact", "states-a-cause"));
  const before = slp.files.get("reflex.yaml")!.split("\n");
  const lines = after.files.get("reflex.yaml")!.split("\n");

  assert.deepEqual(filesChanged(slp, after), ["reflex.yaml"]);
  assert.equal(lines.length, before.length);
  assert.deepEqual(
    lines.flatMap((line, index) => (line === before[index] ? [] : [`${before[index]!} > ${line}`])),
    ["  - cause-as-fact >   - states-a-cause", "  cause-as-fact: >   states-a-cause:"],
  );
  const node = graphOf(after).nodes.find((candidate) => candidate.id === "question:states-a-cause");
  assert.ok(node?.kind === "question" && node.active);
});

test("an outside server is declared, said how to reach, given to a role with the tools it may call, and taken away leaving every file as it was", () => {
  const declared = changed(slp, addServer("tickets"));
  assert.ok(graphOf(declared).nodes.some((node) => node.id === "server:tickets"));
  assert.deepEqual(filesChanged(slp, declared), ["profile.yaml"]);

  const reached = changed(
    declared,
    setServer("tickets", {
      type: "http",
      url: "https://tickets.example/mcp",
      headers: { Authorization: "Bearer $TICKETS_TOKEN" },
    }),
  );
  const node = graphOf(reached).nodes.find((candidate) => candidate.id === "server:tickets");
  assert.ok(node?.kind === "server");
  assert.equal(node.runs, "https://tickets.example/mcp");
  assert.deepEqual(node.variables, ["TICKETS_TOKEN"]);

  const drawn = applied(reached, wired("server", "server:tickets", "role:lead", true));
  assert.ok(!drawn.ok);
  assert.match(drawn.says, /say which/);
  const given = changed(reached, giveServer("lead", "tickets", ["search", "create_issue"]));
  assert.deepEqual(
    graphOf(given).wires.filter((wire) => wire.kind === "server"),
    [{ kind: "server", from: "server:tickets", to: "role:lead", tools: ["search", "create_issue"] }],
  );
  assert.ok(ticked(graphOf(given), "lead").length > 0);

  const fewer = changed(given, giveServer("lead", "tickets", ["search"]));
  assert.deepEqual(linesChanged(given, fewer, "profile.yaml"), ["      tickets: [search]"]);

  const gone = changed(fewer, removeServer("tickets"));
  assert.deepEqual(filesChanged(slp, gone), []);
});

test("a report section is added, said what it holds, renamed and taken away leaving every file as it was; the last one gone, the profile names no report", () => {
  const sections = (template: Template) =>
    graphOf(template).nodes.flatMap((node) => (node.kind === "section" ? [node.name] : []));
  const added = changed(slp, addSection("risks"));
  assert.deepEqual(sections(added), ["decided", "assumed", "open", "risks"]);
  assert.deepEqual(filesChanged(slp, added), ["profile.yaml"]);

  const said = changed(added, setSection("risks", "Each risk nobody owns yet."));
  assert.deepEqual(linesChanged(added, said, "profile.yaml"), ['  risks: "Each risk nobody owns yet."']);
  const renamed = changed(said, renameSection("risks", "unowned_risks"));
  assert.deepEqual(linesChanged(said, renamed, "profile.yaml"), ['  unowned_risks: "Each risk nobody owns yet."']);
  assert.deepEqual(filesChanged(slp, changed(renamed, removeSection("unowned_risks"))), []);

  for (const [edit, why] of [
    [addSection("Risks"), /a section's name is lower-case letters, digits and underscores: Risks is not/],
    [addSection("open"), /there is already a section named open/],
    [renameSection("open", "decided"), /there is already a section named decided/],
    [renameSection("open", "still-open"), /still-open is not/],
  ] as const) {
    const made = applied(slp, edit);
    assert.ok(!made.ok);
    assert.match(made.says, why);
  }

  const none = changed(slp, together(removeSection("decided"), removeSection("assumed"), removeSection("open")));
  assert.deepEqual(sections(none), []);
  assert.doesNotMatch(none.files.get("profile.yaml")!, /^report:/m);
  const first = changed(none, addSection("landed"));
  assert.deepEqual(sections(first), ["landed"]);
  assert.match(first.files.get("profile.yaml")!, /^report:\n {2}landed: /m);
});

test("a classifier taken away leaves a template that asks no model; a route puts it back, is said where it is served, and the last one does not go alone", () => {
  const routes = (template: Template) =>
    graphOf(template).nodes.flatMap((node) => (node.kind === "classifier" ? node.routes : []));
  assert.deepEqual(routes(slp), [
    { name: "openrouter", host: "openrouter.ai", model: "typesafe/jev-1.13" },
    { name: "typesafe", host: "api.typesafe.ai", model: "jev-1.13.0" },
  ]);

  const none = changed(slp, removeClassifier());
  assert.equal(none.file.classifier, undefined);
  assert.ok(!graphOf(none).nodes.some((node) => node.kind === "classifier"));
  assert.deepEqual(filesChanged(slp, none), ["profile.yaml"]);

  const back = changed(none, addRoute("own"));
  assert.deepEqual(
    routes(back).map((route) => route.name),
    ["own"],
  );
  const served = changed(
    back,
    setRoute("own", { endpoint: "http://localhost:8080/v1/systemone", model: "local-1", budget: 8000 }),
  );
  assert.deepEqual(routes(served), [{ name: "own", host: "localhost:8080", model: "local-1" }]);
  const second = changed(served, addRoute("hosted"));
  assert.deepEqual(filesChanged(served, changed(second, removeRoute("hosted"))), []);

  for (const [edit, why] of [
    [addRoute("Own"), /a route's name is lower-case letters, digits and dashes: Own is not/],
    [addRoute("own"), /there is already a route named own/],
    [removeRoute("own"), /at least one route: take the classifier away/],
    [setRoute("own", { endpoint: "http://collects.test/v1", model: "m", budget: 1 }), /over https/],
  ] as const) {
    const made = applied(served, edit);
    assert.ok(!made.ok);
    assert.match(made.says, why);
  }
});
