import type { Asked, Template } from "./read-template.ts";
import { TOOL_GROUPS } from "./tool-groups.ts";

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

  for (const role of template.profile.roles.values()) {
    const prompt = template.file.roles[role.name]?.prompt;
    const text = prompt === undefined ? undefined : template.files.get(prompt);
    if (text === undefined) continue;
    const say = (says: string) => notes.push({ node: `role:${role.name}`, says });
    if (SKELETON.test(text)) say("its prompt still holds the skeleton's words");
    for (const tool of new Set(backticked(text)))
      if (TOOLS.has(tool) && !role.tools.has(tool)) say(`its prompt names \`${tool}\`, which the role is not shown`);
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

  for (const [kind, asked] of [
    ["question", template.questions],
    ["moment", template.moments],
  ] as const)
    for (const one of asked) for (const says of askedNotes(one)) notes.push({ node: `${kind}:${one.name}`, says });
  return notes;
}

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
