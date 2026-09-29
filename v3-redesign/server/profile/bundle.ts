import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type Profile, ProfileFileSchema, resolveProfile } from "../../shared/contracts/profile.ts";

/** What agents are started with from a profile directory: the kernel's profile, each role's prompt and skills. */
export type Bundle = {
  readonly dir: string;
  readonly profile: Profile;
  readonly hash: string;
  readonly prompts: ReadonlyMap<string, string>;
  readonly skills: ReadonlyMap<string, readonly { name: string; description: string; path: string }[]>;
  readonly environment: readonly string[];
  /** The note an attached project's instruction file carries, with `{branches}` and `{base}` to fill. */
  readonly project: {
    readonly file: string;
    readonly note: string;
    readonly glossary: string | null;
    readonly map: string | null;
    readonly adr: string | null;
  } | null;
};

/** A profile in the state root replaces the shipped one whole, so another arrangement needs no fork. */
export function profileDir(shipped: string, stateRoot: string): string {
  const own = join(stateRoot, "profile");
  return existsSync(join(own, "profile.yaml")) ? own : shipped;
}

export function loadBundle(dir: string): Bundle {
  const text = readFileSync(join(dir, "profile.yaml"), "utf8");
  const file = ProfileFileSchema.parse(parse(text));
  const resolved = resolveProfile(file);
  if (!resolved.ok) throw new Error(`the profile in ${dir} is wrong: ${resolved.says}`);
  const prompts = new Map<string, string>();
  const skills = new Map<string, { name: string; description: string; path: string }[]>();
  for (const [name, role] of Object.entries(file.roles)) {
    if (role.prompt) prompts.set(name, readFileSync(join(dir, role.prompt), "utf8"));
    skills.set(
      name,
      (role.skills ?? []).map((skill) => {
        const path = join(dir, "skills", skill, "SKILL.md");
        return { name: skill, description: describe(readFileSync(path, "utf8")), path };
      }),
    );
  }
  const reflexFile = file.reflex ? join(dir, file.reflex) : null;
  const reflex = reflexFile && existsSync(reflexFile) ? (parse(readFileSync(reflexFile, "utf8")) as { environment?: unknown }) : {};
  const environment = Array.isArray(reflex.environment) ? reflex.environment.filter((p): p is string => typeof p === "string") : [];
  const project = file.project
    ? {
        file: file.project.file,
        note: readFileSync(join(dir, file.project.note), "utf8"),
        glossary: file.project.glossary ?? null,
        map: file.project.map ?? null,
        adr: file.project.adr ?? null,
      }
    : null;
  const hash = createHash("sha256").update(text);
  for (const prompt of prompts.values()) hash.update(prompt);
  if (project) hash.update(project.note);
  return {
    dir,
    profile: resolved.profile,
    hash: hash.digest("hex").slice(0, 16),
    prompts,
    skills,
    environment,
    project,
  };
}

/** A skill's `description` from its frontmatter. */
function describe(skill: string): string {
  const match = /^description:\s*"?(.*?)"?\s*$/m.exec(skill);
  return match?.[1] ?? "";
}
