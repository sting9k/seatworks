import { parse } from "yaml";
import { z } from "zod";
import {
  type Profile,
  type ProfileFile,
  ProfileFileSchema,
  resolveProfile,
  skillDescription,
} from "../../shared/contracts/profile.ts";
import { type QuestionSpec, ReflexFileSchema, WatchFileSchema } from "../../shared/contracts/reflex.ts";
import { type About, AboutSchema, type Step } from "./about.ts";

/** A template's files as they are packed: each path inside it, with its text. */
export type TemplateFiles = ReadonlyMap<string, string>;

type Skill = { readonly name: string; readonly description: string };
export type Asked = { readonly name: string; readonly spec: QuestionSpec; readonly active: boolean };

/** A template read once at the boundary: what the plugin would load of it, and what only the gallery reads. */
export type Template = {
  readonly about: About;
  readonly files: TemplateFiles;
  readonly file: ProfileFile;
  readonly profile: Profile;
  /** Every skill the template carries, wired to a role or not. */
  readonly skills: ReadonlyMap<string, Skill>;
  readonly steps: readonly Step[];
  readonly questions: readonly Asked[];
  readonly moments: readonly Asked[];
};

type Failed = { readonly ok: false; readonly says: string };
type Read = { readonly ok: true; readonly template: Template } | Failed;

/** Reads a template as the plugin's loader reads a profile, so what opens here is what would run. */
export function readTemplate(files: TemplateFiles): Read {
  const about = decoded(files, "template.json", JSON.parse, AboutSchema);
  if (!about.ok) return about;
  const profile = decoded(files, "profile.yaml", parse, ProfileFileSchema);
  if (!profile.ok) return profile;
  const file = profile.value;
  const resolved = resolveProfile(file);
  if (!resolved.ok) return resolved;

  for (const [name, role] of Object.entries(file.roles))
    if (role.prompt && !files.has(role.prompt)) return missing(role.prompt, `role ${name}`);
  if (file.flow && !files.has(file.flow)) return missing(file.flow, "the profile's flow");
  const skills = new Map<string, Skill>();
  const carried = [...files.keys()].flatMap((path) => /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1] ?? []);
  for (const name of new Set([...Object.values(file.roles).flatMap((role) => role.skills ?? []), ...carried])) {
    const path = `skills/${name}/SKILL.md`;
    const skill = files.get(path);
    if (skill === undefined) return missing(path, `skill ${name}`);
    skills.set(name, { name, description: skillDescription(skill) });
  }

  const reflex = file.reflex ? decoded(files, file.reflex, parse, ReflexFileSchema) : null;
  if (reflex?.ok === false) return reflex;
  const watch = file.watch ? decoded(files, file.watch, parse, WatchFileSchema) : null;
  if (watch?.ok === false) return watch;
  return {
    ok: true,
    template: {
      about: about.value,
      files,
      file,
      profile: resolved.profile,
      skills,
      steps: about.value.editor?.steps ?? [],
      questions: asked(reflex?.value.questions ?? {}, reflex?.value.active ?? []),
      moments: asked(watch?.value.moments ?? {}, watch?.value.active ?? []),
    },
  };
}

const missing = (path: string, neededBy: string): Failed => ({
  ok: false,
  says: `${neededBy} needs ${path}, which is not in the template`,
});

/** One file through its decoder and its schema; text that is not JSON or YAML is the template's fault, not a bug. */
function decoded<T>(
  files: TemplateFiles,
  path: string,
  decode: (text: string) => unknown,
  schema: z.ZodType<T>,
): { readonly ok: true; readonly value: T } | Failed {
  const text = files.get(path);
  if (text === undefined) return missing(path, "a template");
  let raw: unknown;
  try {
    raw = decode(text);
  } catch (error) {
    return { ok: false, says: `${path} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, says: `${path} is wrong: ${z.prettifyError(parsed.error)}` };
}

function asked(all: Readonly<Record<string, QuestionSpec>>, active: readonly string[]): Asked[] {
  const on = new Set(active);
  return Object.entries(all).map(([name, spec]) => ({ name, spec, active: on.has(name) }));
}
