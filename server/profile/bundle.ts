import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  type Profile,
  ProfileFileSchema,
  resolveProfile,
  type Server,
  skillDescription,
} from "../../shared/contracts/profile.ts";

/** An outside server given to a role: the tools of it the role may call, and how the server is reached. */
export type Grant = { readonly name: string; readonly tools: readonly string[]; readonly server: Server };

/** What agents are started with from a profile directory: the kernel's profile, each role's prompt and skills. */
export type Bundle = {
  readonly dir: string;
  readonly profile: Profile;
  readonly hash: string;
  readonly prompts: ReadonlyMap<string, string>;
  /** The team's flow, given to every role after its prompt; none when the profile names none. */
  readonly flow: string | null;
  readonly skills: ReadonlyMap<string, readonly { name: string; description: string; path: string }[]>;
  /** The outside servers each role is given; a role given none has no entry. */
  readonly servers: ReadonlyMap<string, readonly Grant[]>;
  readonly environment: readonly string[];
  /** The files the profile names for its questions and its moments, each within `dir`; none when it names none. */
  readonly asks: { readonly reflex: string | null; readonly watch: string | null };
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
  const servers = new Map<string, Grant[]>();
  for (const [name, role] of Object.entries(file.roles)) {
    const grants = Object.entries(role.servers ?? {}).map(([server, tools]) => ({
      name: server,
      tools,
      server: file.servers[server]!,
    }));
    if (grants.length > 0) servers.set(name, grants);
  }
  const reflex = file.reflex ? (parse(readFileSync(join(dir, file.reflex), "utf8")) as { environment?: unknown }) : {};
  const environment = Array.isArray(reflex.environment)
    ? reflex.environment.filter((p): p is string => typeof p === "string")
    : [];
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
    servers,
    flow: file.flow ? readFileSync(join(dir, file.flow), "utf8") : null,
    skills,
    environment,
    asks: { reflex: file.reflex ?? null, watch: file.watch ?? null },
    project,
  };
}

/** What the gallery and the editor keep of a template, which the plugin does not read and so does not hash. */
const UNREAD = new Set(["template.json", "NOTICE.md"]);

/** One hash of everything a profile's directory makes agents do: every file by its path, in the order of the paths. */
export function hashOf(dir: string): string {
  const hash = createHash("sha256");
  const walk = (within: string): void => {
    for (const entry of readdirSync(join(dir, within), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = within === "" ? entry.name : `${within}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (!UNREAD.has(path))
        hash
          .update(`${path}\0`)
          .update(readFileSync(join(dir, path)))
          .update("\0");
    }
  };
  walk("");
  return hash.digest("hex").slice(0, 16);
}
