import type { Relation, Role, Route, Server } from "../../shared/contracts/profile.ts";
import { type Step, withAbout, withEditor } from "./about.ts";
import { flowText } from "./flow.ts";
import { type Job, JOBS, type Property, type Wire } from "./graph.ts";
import { readTemplate, type Template, type TemplateFiles } from "./read-template.ts";
import {
  momentSkeleton,
  promptSkeleton,
  questionSkeleton,
  routeSkeleton,
  sectionSkeleton,
  serverSkeleton,
  skillSkeleton,
} from "./skeletons.ts";
import { TOOL_GROUPS, toolsFollowing } from "./tool-groups.ts";
import { deleteIn, renameItem, renameKey, setIn, type Value, withItem } from "./yaml-patch.ts";

/** A change to a template: its files in, its files out, or why it is not made; only what it changes is touched. */
export type Edit = (template: Template) => TemplateFiles | { readonly refused: string };

const PROFILE = "profile.yaml";
const FLOW = "flow.md";
const NAME = /^[a-z][a-z0-9-]*$/;

/** The template after the edit; one that would leave a template that does not load is not made. */
export function applied(
  template: Template,
  edit: Edit,
):
  | { readonly ok: true; readonly files: TemplateFiles; readonly template: Template }
  | { readonly ok: false; readonly says: string } {
  const files = edit(template);
  if ("refused" in files) return { ok: false, says: files.refused };
  const read = readTemplate(files);
  return read.ok ? { ok: true, files, template: read.template } : read;
}

/** Several edits as one, each made on what the one before left. */
export const together =
  (...edits: readonly Edit[]): Edit =>
  (template) => {
    let current = template;
    for (const edit of edits) {
      const made = applied(current, edit);
      if (!made.ok) return { refused: made.says };
      current = made.template;
    }
    return current.files;
  };

/** The template under another name: what the gallery and its tab call it. */
export const renameTemplate =
  (name: string): Edit =>
  (template) =>
    name.trim() === ""
      ? { refused: "a template has a name" }
      : withAbout(template.files, (about) => ({ ...about, name: name.trim() }));

const nameIn = (id: string) => id.slice(id.indexOf(":") + 1);
const withFile = (files: TemplateFiles, path: string, change: (text: string) => string): Map<string, string> =>
  new Map(files).set(path, change(files.get(path)!));
const having = <T>(items: Iterable<T>, item: T, on: boolean): T[] => {
  const all = [...items];
  if (on) return all.includes(item) ? all : [...all, item];
  return all.filter((other) => other !== item);
};
/** A role's list as the file keeps one: written out, or its key taken away when nothing is left in it. */
const listed = (text: string, role: string, key: string, items: readonly string[]) =>
  items.length > 0 ? setIn(text, ["roles", role, key], items) : deleteIn(text, ["roles", role, key]);

/** Switches a role's property; its tools come ticked and go with it, and the root moves, since there is one. */
export const setProperty =
  (name: string, property: Property, on: boolean): Edit =>
  (template) => {
    let text = template.files.get(PROFILE)!;
    if (property === "root" && on)
      for (const other of template.profile.roles.values())
        if (other.root && other.name !== name) text = switched(text, template, other, "root", false);
    return new Map(template.files).set(
      PROFILE,
      switched(text, template, template.profile.roles.get(name)!, property, on),
    );
  };

/** Gives a role one job in place of the one it had, or none: one change, where two switches would be refused. */
export const setJob = (name: string, job: Job | null): Edit =>
  together(
    ...JOBS.filter((other) => other !== job).map(
      (other): Edit =>
        (template) =>
          template.profile.roles.get(name)![other] ? setProperty(name, other, false)(template) : template.files,
    ),
    ...(job === null ? [] : [setProperty(name, job, true)]),
  );

function switched(text: string, template: Template, before: Role, property: Property, on: boolean): string {
  const after: Role = { ...before, [property]: on };
  const path = ["roles", before.name, property];
  const inherits = template.file.roles[before.name]?.like !== undefined;
  const set = on ? setIn(text, path, true) : inherits ? setIn(text, path, false) : deleteIn(text, path);
  const brought = toolsFollowing(after);
  const taken = [...toolsFollowing(before)].filter((tool) => !brought.has(tool));
  const tools = [...before.tools].filter((tool) => !taken.includes(tool));
  for (const tool of brought) if (!toolsFollowing(before).has(tool) && !tools.includes(tool)) tools.push(tool);
  const same = tools.length === before.tools.size && tools.every((tool) => before.tools.has(tool));
  return same ? set : listed(set, before.name, "tools", tools);
}

export const setTool =
  (name: string, tool: string, shown: boolean): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) =>
      listed(text, name, "tools", having(template.profile.roles.get(name)!.tools, tool, shown)),
    );

export const setSpeaks =
  (name: string, relation: Relation, on: boolean): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) =>
      listed(text, name, "speaksTo", having(template.profile.roles.get(name)!.speaksTo, relation, on)),
    );

/** Draws a wire or takes it away, as what its kind becomes in the template's files (EDITOR.md, Wires). */
export const wired =
  (kind: Wire["kind"], from: string, to: string, on: boolean): Edit =>
  (template) => {
    const roles = template.profile.roles;
    switch (kind) {
      case "spawns":
        return withFile(template.files, PROFILE, (text) =>
          listed(text, nameIn(from), "spawns", having(roles.get(nameIn(from))!.spawns, nameIn(to), on)),
        );
      case "skill":
        return withFile(template.files, PROFILE, (text) =>
          listed(text, nameIn(to), "skills", having(template.file.roles[nameIn(to)]!.skills ?? [], nameIn(from), on)),
        );
      case "tools": {
        const group = TOOL_GROUPS.find((candidate) => candidate.id === nameIn(from))!;
        const role = roles.get(nameIn(to))!;
        const tools = group.tools.reduce<string[]>((kept, tool) => having(kept, tool, on), [...role.tools]);
        return withFile(template.files, PROFILE, (text) => listed(text, role.name, "tools", tools));
      }
      case "server":
        return { refused: "a server is given with the tools of it the role may call: say which" };
      case "human": {
        const role = roles.get(nameIn(from))!;
        const told = setSpeaks(role.name, "human", on);
        return on || !role.humanDoor
          ? told(template)
          : together(setProperty(role.name, "humanDoor", false), told)(template);
      }
      case "watches": {
        const moment = template.moments.find((candidate) => candidate.name === nameIn(from))!;
        const watched = having(moment.spec.watches ?? [], nameIn(to), on);
        const path = ["moments", moment.name, "watches"];
        return withFile(template.files, template.file.watch!, (text) =>
          watched.length > 0 ? setIn(text, path, watched) : deleteIn(text, path),
        );
      }
      case "then":
        return withSteps(template, (steps) =>
          steps.map((step) => (step.id === nameIn(from) ? { ...step, then: having(step.then, nameIn(to), on) } : step)),
        );
      case "does":
        return withSteps(template, (steps) =>
          steps.map((step) => (step.id === nameIn(to) ? { ...step, role: on ? nameIn(from) : null } : step)),
        );
    }
  };

/** A role with nothing but what every seated role has: it speaks to whoever seated it, and starts from the skeleton. */
export const addRole =
  (name: string): Edit =>
  (template) => {
    if (!NAME.test(name)) return { refused: `a role's name is lower-case letters, digits and dashes: ${name} is not` };
    if (template.profile.roles.has(name)) return { refused: `there is already a role named ${name}` };
    const speaksTo: readonly Relation[] = ["parent"];
    const fresh: Role = {
      name,
      root: false,
      delegates: false,
      writes: false,
      reading: false,
      watches: false,
      humanDoor: false,
      spawns: new Set(),
      speaksTo: new Set(speaksTo),
      tools: new Set(),
      models: [],
    };
    const prompt = `roles/${name}.md`;
    const spec = { speaksTo, prompt, tools: [...toolsFollowing(fresh)] };
    return withFile(template.files, PROFILE, (text) => setIn(text, ["roles", name], spec)).set(
      prompt,
      promptSkeleton(name),
    );
  };

/** A role as another is, under a name of its own and with a prompt of its own to change; never a second root. */
export const duplicateRole =
  (name: string, as: string): Edit =>
  (template) => {
    if (!NAME.test(as)) return { refused: `a role's name is lower-case letters, digits and dashes: ${as} is not` };
    if (template.profile.roles.has(as)) return { refused: `there is already a role named ${as}` };
    const { root: _, prompt, ...kept } = template.file.roles[name]!;
    const copy: Record<string, Value> = { ...kept };
    const files = new Map(template.files);
    if (prompt !== undefined) {
      copy.prompt = `roles/${as}.md`;
      files.set(copy.prompt, template.files.get(prompt)!);
    }
    return files.set(PROFILE, setIn(template.files.get(PROFILE)!, ["roles", as], copy));
  };

/** Takes a role away, and its name out of everything that named it; its prompt goes when no other role reads it. */
export const removeRole =
  (name: string): Edit =>
  (template) =>
    renamed(template, name, null);

export const renameRole =
  (from: string, to: string): Edit =>
  (template) => {
    if (!NAME.test(to)) return { refused: `a role's name is lower-case letters, digits and dashes: ${to} is not` };
    if (template.profile.roles.has(to)) return { refused: `there is already a role named ${to}` };
    return renamed(template, from, to);
  };

/** Every place a role is named follows its new name, or loses it when the role is gone. */
function renamed(template: Template, from: string, to: string | null): TemplateFiles {
  const follow = (names: Iterable<string>) => [...names].flatMap((name) => (name === from ? (to ?? []) : name));
  const files = new Map(template.files);
  let text = files.get(PROFILE)!;
  for (const [name, spec] of Object.entries(template.file.roles)) {
    if (name === from) continue;
    if (spec.spawns?.includes(from)) text = listed(text, name, "spawns", follow(spec.spawns));
    if (spec.like === from && to !== null) text = setIn(text, ["roles", name, "like"], to);
  }
  const own = `roles/${from}.md`;
  const prompt = template.file.roles[from]!.prompt;
  const shared = Object.entries(template.file.roles).some(([name, spec]) => name !== from && spec.prompt === prompt);
  if (to === null) {
    text = deleteIn(text, ["roles", from]);
    if (prompt !== undefined && !shared) files.delete(prompt);
  } else {
    if (prompt === own && !shared) {
      const moved = `roles/${to}.md`;
      files.set(moved, files.get(own)!);
      files.delete(own);
      text = setIn(text, ["roles", from, "prompt"], moved);
    }
    text = renameKey(text, ["roles", from], to);
  }
  files.set(PROFILE, text);

  const watch = template.file.watch;
  if (watch !== undefined) {
    let moments = files.get(watch)!;
    for (const moment of template.moments) {
      if (!moment.spec.watches?.includes(from)) continue;
      const watched = follow(moment.spec.watches);
      const path = ["moments", moment.name, "watches"];
      moments = watched.length > 0 ? setIn(moments, path, watched) : deleteIn(moments, path);
    }
    files.set(watch, moments);
  }
  if (!template.steps.some((step) => step.role === from)) return files;
  return stepsIn(files, (steps) => steps.map((step) => (step.role === from ? { ...step, role: to } : step)));
}

export const addSkill =
  (name: string): Edit =>
  (template) => {
    if (!NAME.test(name)) return { refused: `a skill's name is lower-case letters, digits and dashes: ${name} is not` };
    if (template.skills.has(name)) return { refused: `there is already a skill named ${name}` };
    return new Map(template.files).set(`skills/${name}/SKILL.md`, skillSkeleton(name));
  };

/** A skill under another name: its folder, the name in its file, and every role that has it follow. */
export const renameSkill =
  (from: string, to: string): Edit =>
  (template) => {
    if (!NAME.test(to)) return { refused: `a skill's name is lower-case letters, digits and dashes: ${to} is not` };
    if (template.skills.has(to)) return { refused: `there is already a skill named ${to}` };
    const files = new Map<string, string>();
    for (const [path, text] of template.files)
      files.set(
        path.startsWith(`skills/${from}/`) ? `skills/${to}/${path.slice(`skills/${from}/`.length)}` : path,
        text,
      );
    const own = `skills/${to}/SKILL.md`;
    files.set(own, files.get(own)!.replace(new RegExp(`^name:\\s*"?${from}"?\\s*$`, "m"), `name: ${to}`));
    let text = files.get(PROFILE)!;
    for (const role of Object.keys(template.file.roles))
      if (template.file.roles[role]!.skills?.includes(from))
        text = renameItem(text, ["roles", role, "skills"], from, to);
    return files.set(PROFILE, text);
  };

/** Takes a skill away: its folder, and its name out of every role that had it. */
export const removeSkill =
  (name: string): Edit =>
  (template) => {
    const files = new Map(template.files);
    for (const path of template.files.keys()) if (path.startsWith(`skills/${name}/`)) files.delete(path);
    let text = files.get(PROFILE)!;
    for (const [role, spec] of Object.entries(template.file.roles))
      if (spec.skills?.includes(name)) text = listed(text, role, "skills", having(spec.skills, name, false));
    return files.set(PROFILE, text);
  };

/** The id a new step of this name is given: its name in lower case, numbered when one has it already. */
export function stepIdFor(steps: readonly Step[], name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "step";
  const taken = new Set(steps.map((step) => step.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** An outside server from its skeleton, declared and given to no role yet. */
export const addServer =
  (name: string): Edit =>
  (template) => {
    if (!NAME.test(name))
      return { refused: `a server's name is lower-case letters, digits and dashes: ${name} is not` };
    if (Object.hasOwn(template.file.servers, name)) return { refused: `there is already a server named ${name}` };
    return withFile(template.files, PROFILE, (text) => declared(template, text, name, serverSkeleton));
  };

/** How a server is started or reached, written over what was there; the roles given it keep it. */
export const setServer =
  (name: string, server: Server): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) =>
      declared(template, deleteIn(text, ["servers", name]), name, written(server)),
    );

/** A server's settings as its file keeps them: an empty list or map is left out. */
function written(server: Server): Value {
  const some = (values: Readonly<Record<string, string>>) => (Object.keys(values).length > 0 ? values : undefined);
  const kept =
    server.type === "stdio"
      ? {
          type: server.type,
          command: server.command,
          args: server.args.length > 0 ? server.args : undefined,
          env: some(server.env),
        }
      : { type: server.type, url: server.url, headers: some(server.headers) };
  return Object.fromEntries(Object.entries(kept).filter(([, value]) => value !== undefined)) as Value;
}

/** A server set down under `servers`, beside the others the profile declares. */
const declared = (template: Template, text: string, name: string, server: Value) =>
  entered(
    text,
    "servers",
    Object.keys(template.file.servers).some((other) => other !== name),
    name,
    server,
  );

/** An entry set down under a key of the profile, which the profile gains with its first one. */
const entered = (text: string, key: string, others: boolean, name: string, value: Value) =>
  others ? setIn(text, [key, name], value) : setIn(deleteIn(text, [key]), [key], { [name]: value });

/** A route a classifier is served by, from its skeleton; the first gives the template its classifier. */
export const addRoute =
  (name: string): Edit =>
  (template) => {
    if (!NAME.test(name)) return { refused: `a route's name is lower-case letters, digits and dashes: ${name} is not` };
    const routes = template.file.classifier ?? {};
    if (Object.hasOwn(routes, name)) return { refused: `there is already a route named ${name}` };
    return withFile(template.files, PROFILE, (text) =>
      entered(text, "classifier", Object.keys(routes).length > 0, name, routeSkeleton),
    );
  };

/** Where a route is served, the model as it is called there and what fits, written over what was there. */
export const setRoute =
  (name: string, route: Route): Edit =>
  (template) => {
    const others = Object.keys(template.file.classifier ?? {}).some((other) => other !== name);
    return withFile(template.files, PROFILE, (text) =>
      entered(deleteIn(text, ["classifier", name]), "classifier", others, name, route as Value),
    );
  };

/** Takes one route away; the last is not taken alone, since a classifier with none is no classifier. */
export const removeRoute =
  (name: string): Edit =>
  (template) =>
    Object.keys(template.file.classifier ?? {}).length > 1
      ? withFile(template.files, PROFILE, (text) => deleteIn(text, ["classifier", name]))
      : { refused: "a classifier is served by at least one route: take the classifier away to ask no model" };

/** Takes the classifier away: the template then asks no model, and what code counts is all that is noticed. */
export const removeClassifier = (): Edit => (template) =>
  withFile(template.files, PROFILE, (text) => deleteIn(text, ["classifier"]));

const SECTION = /^[a-z][a-z0-9_]*$/;
/** Why a section may not take a name: it is an argument an agent writes, and a report has each once. */
const notASection = (template: Template, name: string) =>
  !SECTION.test(name)
    ? { refused: `a section's name is lower-case letters, digits and underscores: ${name} is not` }
    : template.profile.report.has(name)
      ? { refused: `there is already a section named ${name}` }
      : null;

/** A section of the team's reports from its skeleton, read after the others. */
export const addSection =
  (name: string): Edit =>
  (template) =>
    notASection(template, name) ??
    withFile(template.files, PROFILE, (text) =>
      entered(text, "report", template.profile.report.size > 0, name, sectionSkeleton),
    );

/** What a section holds, in the words an agent is shown when it reports. */
export const setSection =
  (name: string, holds: string): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) => setIn(text, ["report", name], holds));

export const renameSection =
  (from: string, to: string): Edit =>
  (template) =>
    notASection(template, to) ?? withFile(template.files, PROFILE, (text) => renameKey(text, ["report", from], to));

/** Takes a section away; with the last one gone the profile names no `report`. */
export const removeSection =
  (name: string): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) =>
      deleteIn(text, template.profile.report.size === 1 ? ["report"] : ["report", name]),
    );

/** Gives a role a server with the tools of it the role may call, or takes it away when none is named. */
export const giveServer =
  (role: string, server: string, tools: readonly string[]): Edit =>
  (template) => {
    const given = Object.keys(template.file.roles[role]!.servers ?? {}).filter((other) => other !== server);
    return withFile(template.files, PROFILE, (text) => {
      const path = ["roles", role, "servers"];
      if (tools.length === 0) return given.length > 0 ? deleteIn(text, [...path, server]) : deleteIn(text, path);
      return given.length > 0 || template.file.roles[role]!.servers?.[server]
        ? setIn(text, [...path, server], tools)
        : setIn(text, path, { [server]: tools });
    });
  };

/** Takes a server away: its settings, and itself out of every role that was given it. */
export const removeServer =
  (name: string): Edit =>
  (template) => {
    const roles = Object.keys(template.file.roles).filter((role) => template.file.roles[role]!.servers?.[name]);
    const taken = together(...roles.map((role) => giveServer(role, name, [])))(template);
    if ("refused" in taken) return taken;
    const last = Object.keys(template.file.servers).length === 1;
    return withFile(taken, PROFILE, (text) => deleteIn(text, last ? ["servers"] : ["servers", name]));
  };

/** A file's text as a person wrote it, or a file put beside a skill. */
export const putFile =
  (path: string, text: string): Edit =>
  (template) =>
    new Map(template.files).set(path, text);

/** The models a role may be seated on, the first its default: each names an agent profile of the Human's in Paseo. */
export const setModels =
  (name: string, models: readonly string[]): Edit =>
  (template) =>
    withFile(template.files, PROFILE, (text) => listed(text, name, "models", models));

type AskedKind = "question" | "moment";
const ASKED = {
  question: { key: "questions", skeleton: questionSkeleton },
  moment: { key: "moments", skeleton: momentSkeleton },
};
const askedFile = (template: Template, kind: AskedKind) =>
  kind === "question" ? template.file.reflex : template.file.watch;
const askedOf = (template: Template, kind: AskedKind) => (kind === "question" ? template.questions : template.moments);

/** A question or a moment from its skeleton: written, and not asked until its author says so. */
export const addAsked =
  (kind: AskedKind, name: string): Edit =>
  (template) => {
    const path = askedFile(template, kind);
    if (path === undefined) return { refused: `this template keeps no file of ${ASKED[kind].key}` };
    if (!NAME.test(name)) return { refused: `its name is lower-case letters, digits and dashes: ${name} is not` };
    if (askedOf(template, kind).some((asked) => asked.name === name))
      return { refused: `there is already one named ${name}` };
    return withFile(template.files, path, (text) => setIn(text, [ASKED[kind].key, name], ASKED[kind].skeleton));
  };

/** A question or a moment under another name, in its place in its file and in the `active` list. */
export const renameAsked =
  (kind: AskedKind, from: string, to: string): Edit =>
  (template) => {
    if (!NAME.test(to)) return { refused: `its name is lower-case letters, digits and dashes: ${to} is not` };
    if (askedOf(template, kind).some((asked) => asked.name === to))
      return { refused: `there is already one named ${to}` };
    return withFile(template.files, askedFile(template, kind)!, (text) =>
      renameKey(renameItem(text, ["active"], from, to), [ASKED[kind].key, from], to),
    );
  };

export const removeAsked =
  (kind: AskedKind, name: string): Edit =>
  (template) =>
    withFile(template.files, askedFile(template, kind)!, (text) =>
      deleteIn(withItem(text, ["active"], name, false), [ASKED[kind].key, name]),
    );

/** Whether a question is asked or a moment watched: its name in its file's `active` list. */
export const setAsked =
  (kind: AskedKind, name: string, active: boolean): Edit =>
  (template) =>
    withFile(template.files, askedFile(template, kind)!, (text) => withItem(text, ["active"], name, active));

export const addStep =
  (name: string): Edit =>
  (template) =>
    withSteps(template, (steps) => [...steps, { id: stepIdFor(steps, name), name, text: "", role: null, then: [] }]);

export const setStep =
  (id: string, change: Partial<Pick<Step, "name" | "text">>): Edit =>
  (template) =>
    withSteps(template, (steps) => steps.map((step) => (step.id === id ? { ...step, ...change } : step)));

export const removeStep =
  (id: string): Edit =>
  (template) =>
    withSteps(template, (steps) =>
      steps.filter((step) => step.id !== id).map((step) => ({ ...step, then: having(step.then, id, false) })),
    );

const withSteps = (template: Template, change: (steps: readonly Step[]) => Step[]) => stepsIn(template.files, change);

/** The steps changed and `flow.md` written from them again; with no step left the profile names no flow. */
function stepsIn(files: TemplateFiles, change: (steps: readonly Step[]) => Step[]): Map<string, string> {
  let steps: Step[] = [];
  const next = new Map(
    withEditor(files, (editor) => {
      steps = change(editor.steps);
      return { ...editor, steps };
    }),
  );
  const profile = next.get(PROFILE)!;
  if (steps.length > 0) next.set(FLOW, flowText(steps)).set(PROFILE, setIn(profile, ["flow"], FLOW));
  else {
    next.delete(FLOW);
    next.set(PROFILE, deleteIn(profile, ["flow"]));
  }
  return next;
}
