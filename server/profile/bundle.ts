import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  type Profile,
  ProfileFileSchema,
  resolveProfile,
  skillDescription,
} from "../../shared/contracts/profile.ts";

/** What agents are started with from a profile directory: the kernel's profile, each role's prompt and skills. */
export type Bundle = {
  readonly dir: string;
  readonly profile: Profile;
  readonly hash: string;
  readonly prompts: ReadonlyMap<string, string>;
  /** The team's flow, given to every role after its prompt; none when the profile names none. */
  readonly flow: string | null;
  readonly skills: ReadonlyMap<string, readonly { name: string; description: string; path: string }[]>;
  readonly environment: readonly string[];
  /** The note an attached project's instruction file carries, with `{branches}` and `{base}` to fill. */
  readonly project: {
    readonly file: string;
    readonly note: string;
    readonly glossary: string | null;
    readonly map: string | null;
    /** The lasting docs the team keeps by hand: agents are pointed at them, and nothing writes them. */
    readonly docs: readonly string[];
  } | null;
};

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
        return { name: skill, description: skillDescription(readFileSync(path, "utf8")), path };
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
        docs: file.project.docs,
      }
    : null;
  return {
    dir,
    profile: resolved.profile,
    hash: hashOf(dir),
    prompts,
    flow: file.flow ? readFileSync(join(dir, file.flow), "utf8") : null,
    skills,
    environment,
    project,
  };
}

/** What the gallery and the editor keep of a template, which the plugin does not read and so does not hash. */
const UNREAD = new Set(["template.json", "NOTICE.md"]);

/** One hash of everything a profile's directory makes agents do: every file by its path, in the order of the paths. */
function hashOf(dir: string): string {
  const hash = createHash("sha256");
  const walk = (within: string): void => {
    for (const entry of readdirSync(join(dir, within), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = within === "" ? entry.name : `${within}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (!UNREAD.has(path)) hash.update(`${path}\0`).update(readFileSync(join(dir, path))).update("\0");
    }
  };
  walk("");
  return hash.digest("hex").slice(0, 16);
}
