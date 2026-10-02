import { type Role, settingsOf } from "../../shared/contracts/profile.ts";
import { ASKED_ON, CODE_MOMENTS, STATE_PATHS, TELLS } from "../../shared/contracts/reflex.ts";
import { SECRETS } from "../../shared/contracts/secrets.ts";
import { READS } from "../../shared/contracts/tools.ts";
import type { Asked, Template } from "./read-template.ts";
import { TOOL_GROUPS } from "./tool-groups.ts";
import { earnedOf } from "./wording.ts";

/**
 * Something a machine saw in a template that a person should look at (EDITOR.md, Checks): the node it is about and
 * what was seen. A note stops nothing. Whether a template makes a team work well is known only by running it.
 */
export type Note = { readonly node: string; readonly says: string };

const TOOLS = new Set(TOOL_GROUPS.flatMap((group): readonly string[] => group.tools));
/** A line that is all in italics is one a skeleton left to be written over (`skeletons.ts`). */
const SKELETON = /^_.+_$/m;
const WATCH = /\bwatch(es|ed|er|ing)?\b/i;
const backticked = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((found) => found[1]!);
const names = (name: string) => new RegExp(`\\b${name}s?\\b`, "i");

/** The notes on a template; `opened` is the template as it was opened, to tell a role that is gone from it since. */
export function notesOf(template: Template, opened: Template): Note[] {
  const gone = [...opened.profile.roles.keys()].filter((name) => !template.profile.roles.has(name));
  const stillNamed = (text: string) => gone.filter((name) => names(name).test(text));
  const watched = new Set(template.moments.flatMap((moment) => moment.spec.watches ?? []));
  const notes: Note[] = [];

  const seated = new Set([...template.profile.roles.values()].flatMap((role) => [...role.spawns]));
  for (const role of template.profile.roles.values()) {
    const say = (says: string) => notes.push({ node: `role:${role.name}`, says });
    if (!role.root && !seated.has(role.name)) say("no role seats it, so it never joins the team");
    if (role.models.length === 0)
      say(
        role.root
          ? "it is the root and names no agent profile, so a project cannot start"
          : "it names no agent profile, so whoever seats it must name one each time",
      );
    for (const says of deadEnds(role)) say(says);
    const prompt = template.file.roles[role.name]?.prompt;
    const text = prompt === undefined ? undefined : template.files.get(prompt);
    if (text === undefined) {
      say("it has no prompt");
      continue;
    }
    if (SKELETON.test(text)) say("its prompt still holds the skeleton's words");
    for (const tool of new Set(backticked(text)))
      if (TOOLS.has(tool) && !role.tools.has(tool) && !Object.hasOwn(READS, tool))
        say(`its prompt names \`${tool}\`, which the role is not shown`);
    for (const name of stillNamed(text)) say(`its prompt still names ${name}, a role the template no longer has`);
    if (watched.has(role.name) && WATCH.test(text))
      say("its prompt names the watch, which a role that is watched is never told of");
  }

  for (const skill of template.skills.values()) {
    const folder = `skills/${skill.name}/`;
    const text = template.files.get(`${folder}SKILL.md`)!;
    const say = (says: string) => notes.push({ node: `skill:${skill.name}`, says });
    const named = /^name:\s*"?(.*?)"?\s*$/m.exec(text)?.[1];
    if (named !== skill.name) say(`it is named ${named ?? "nothing"} in its file and ${skill.name} by its folder`);
    if (SKELETON.test(text) || skill.description.startsWith("_")) say("it still holds the skeleton's words");
    else if (!/\buse\b/i.test(skill.description)) say("its description does not say when to use it");
    for (const name of stillNamed(text)) say(`it still names ${name}, a role the template no longer has`);
    for (const [, path] of text.matchAll(/\]\(([^)#\s]+)\)/g))
      if (!path!.includes("://") && !path!.startsWith("/") && !template.files.has(folder + path!))
        say(`it points at ${path!}, which is not beside it`);
  }

  const secret = SECRETS.map((pattern) => new RegExp(pattern));
  for (const [name, server] of Object.entries(template.file.servers)) {
    const say = (says: string) => notes.push({ node: `server:${name}`, says });
    const settings = settingsOf(server);
    if (settings.some((text) => SKELETON.test(text))) say("it still holds the skeleton's words");
    if (settings.some((text) => secret.some((pattern) => pattern.test(text))))
      say("its settings hold what looks like a secret: name a variable as $NAME, and keep the secret on the machine");
    if (!Object.values(template.file.roles).some((role) => role.servers?.[name])) say("no role is given it");
  }

  for (const [kind, asked] of [
    ["question", template.questions],
    ["moment", template.moments],
  ] as const)
    for (const one of asked) {
      const say = (says: string) => notes.push({ node: `${kind}:${one.name}`, says });
      for (const says of askedNotes(one)) say(says);
      for (const says of kind === "question" ? questionNotes(one) : momentNotes(one, template)) say(says);
    }
  return notes;
}

/** Where a role's properties and tools leave it no way on; each is certain from `profile.yaml` alone. */
function deadEnds(role: Role): string[] {
  const shown = (tool: string) => role.tools.has(tool);
  const lacks: [boolean, string, string][] = [
    [role.writes, "hand_back", "it writes, so its work never comes back"],
    [role.reading, "record_verdict", "it reads a commit, so what it finds is evidence for nobody"],
    [role.watches, "attend", "it watches, so what it sees reaches nobody"],
    [role.spawns.size > 0, "open_scope", "it seats other roles, so it can seat none"],
    [role.spawns.size > 0, "integrate", "it seats other roles, so their work is never taken in"],
  ];
  const refused: [boolean, string, string][] = [
    [!role.humanDoor, "ask_human", "only a role with `humanDoor` asks the Human"],
    [!role.watches, "attend", "only a role that watches attends"],
    [role.spawns.size === 0, "open_scope", "it seats no role"],
  ];
  return [
    ...lacks.flatMap(([holds, tool, why]) => (holds && !shown(tool) ? [`it is not shown \`${tool}\`: ${why}`] : [])),
    ...refused.flatMap(([holds, tool, why]) =>
      holds && shown(tool) ? [`it is shown \`${tool}\`, which it is always refused: ${why}`] : [],
    ),
  ];
}

const known = (all: readonly string[], one: string) => all.includes(one);

/** What a question asks of the record that the record does not have: it would never be asked, with nobody told. */
function questionNotes({ spec }: Asked): string[] {
  const notes = (spec.on ?? [])
    .filter((event) => !known(ASKED_ON, event))
    .map((event) => `it is asked on \`${event}\`, which is not an event a question is asked on`);
  if (spec.tells !== undefined && !known(TELLS, spec.tells))
    notes.push(`it tells \`${spec.tells}\`, which is not one of ${TELLS.join(", ")}`);
  return [...notes, ...stateNotes(spec)];
}

function momentNotes({ name, spec }: Asked, template: Template): string[] {
  const notes = (spec.watches ?? [])
    .filter((role) => !template.profile.roles.has(role))
    .map((role) => `it watches ${role}, which is not a role of the template`);
  if (spec.by === "code" && !known(CODE_MOMENTS, name))
    notes.push(`it is counted in code, and no moment of this name is: ${CODE_MOMENTS.join(", ")} are`);
  return [...notes, ...stateNotes(spec)];
}

const stateNotes = (spec: Asked["spec"]) =>
  Object.values(spec.state ?? {})
    .filter((path) => !known(STATE_PATHS, path))
    .map((path) => `its state reads \`${path}\`, which the record does not have`);

/** What `REFLEX.md`, Asking well, asks of a question that a machine can see is missing. */
function askedNotes({ spec }: Asked): string[] {
  if (spec.by === "code") return [];
  const notes: string[] = [];
  const state = new Set(Object.keys(spec.state ?? {}));
  for (const field of new Set(backticked(spec.noul ?? spec.choice ?? "")))
    if (!state.has(field)) notes.push(`it asks of \`${field}\`, which is not in its state`);
  if (spec.noul !== undefined && (spec.yes === undefined || spec.no === undefined))
    notes.push("it does not describe both a yes and a no");
  if (spec.choice !== undefined && spec.labels === undefined) notes.push("it does not describe its outcomes");
  if (SKELETON.test([spec.noul, spec.yes, spec.no].join("\n"))) notes.push("it still holds the skeleton's words");
  if (earnedOf(spec) === "reworded")
    notes.push("its words changed since its threshold was earned, so it is not yet earned");
  return notes;
}

const wordsIn = (text: string | undefined) => (text ?? "").split(/\s+/).filter((word) => word !== "").length;

/**
 * The words a role reads on every turn: its prompt, the description of each of its skills and the team's flow. The
 * cost a template raises without anyone seeing it.
 */
export function alwaysOnWords(template: Template, role: string): number {
  const spec = template.file.roles[role];
  const skills = (spec?.skills ?? []).reduce((sum, skill) => sum + wordsIn(template.skills.get(skill)?.description), 0);
  const prompt = spec?.prompt === undefined ? 0 : wordsIn(template.files.get(spec.prompt));
  return prompt + skills + wordsIn(template.files.get("flow.md"));
}
