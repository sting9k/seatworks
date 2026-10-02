import { z } from "zod";
import { TEAM_SERVER } from "./ids.ts";
import { ROLE_TOOLS } from "./tools.ts";

/** What a role may message, as relations on the scope graph (KERNEL.md §2). */
export const RELATIONS = ["parent", "children", "descendants", "human"] as const;
export type Relation = (typeof RELATIONS)[number];

/** An MCP server that is not the team's; a secret is named as `$NAME` and filled in when an agent is made. */
const ServerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("stdio"),
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      env: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
  z
    .object({
      type: z.enum(["http", "sse"]),
      url: z.string().min(1),
      headers: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
]);
export type Server = z.infer<typeof ServerSchema>;

/** A variable named in a server's settings, as a profile writes one: `$NAME`. */
export const VARIABLE = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** Every text of a server's settings that a variable may be named in, or a secret wrongly written. */
export const settingsOf = (server: Server): string[] =>
  server.type === "stdio"
    ? [server.command, ...server.args, ...Object.values(server.env)]
    : [server.url, ...Object.values(server.headers)];

/** Every environment variable the servers name, for the Human to see what a profile reads of their machine. */
export function variablesNamed(servers: readonly Server[]): string[] {
  const texts = servers.flatMap(settingsOf);
  return [...new Set(texts.flatMap((text) => [...text.matchAll(VARIABLE)].map((found) => found[1]!)))].sort();
}

const RoleSchema = z
  .object({
    root: z.boolean().optional(),
    delegates: z.boolean().optional(),
    writes: z.boolean().optional(),
    reading: z.boolean().optional(),
    watches: z.boolean().optional(),
    humanDoor: z.boolean().optional(),
    spawns: z.array(z.string()).optional(),
    speaksTo: z.array(z.enum(RELATIONS)).optional(),
    tools: z.array(z.string()).optional(),
    like: z.string().optional(),
    prompt: z.string().optional(),
    skills: z.array(z.string()).optional(),
    models: z.array(z.string()).optional(),
    /** The outside servers it is given, each with the tools of it the role may call, by name. */
    servers: z.record(z.string(), z.array(z.string().min(1)).min(1)).optional(),
  })
  .strict();

export const ProfileFileSchema = z
  .object({
    roles: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), RoleSchema),
    servers: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), ServerSchema).default({}),
    reflex: z.string().optional(),
    watch: z.string().optional(),
    /** The team's flow, a passage every role is given after its own prompt (TEMPLATE.md). */
    flow: z.string().min(1).optional(),
    /** What every agent in an attached project reads: the note in `file`, the docs written from the record, `docs`. */
    project: z
      .object({
        file: z.string().min(1),
        note: z.string().min(1),
        glossary: z.string().min(1).optional(),
        map: z.string().min(1).optional(),
        docs: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ProfileFile = z.infer<typeof ProfileFileSchema>;

/** A role as the kernel reads it: every property resolved, `like` applied. */
export type Role = {
  readonly name: string;
  readonly root: boolean;
  readonly delegates: boolean;
  readonly writes: boolean;
  readonly reading: boolean;
  readonly watches: boolean;
  readonly humanDoor: boolean;
  readonly spawns: ReadonlySet<string>;
  readonly speaksTo: ReadonlySet<Relation>;
  readonly tools: ReadonlySet<string>;
  readonly models: readonly string[];
};

export type Profile = { readonly roles: ReadonlyMap<string, Role>; readonly root: Role };

/** Resolves a profile file into roles, or says what is wrong with it. */
export function resolveProfile(file: ProfileFile): { ok: true; profile: Profile } | { ok: false; says: string } {
  const raw = file.roles;
  const resolved = new Map<string, Role>();
  const resolving = new Set<string>();
  const resolve = (name: string): Role | string => {
    const done = resolved.get(name);
    if (done) return done;
    const spec = raw[name];
    if (!spec) return `role ${name} is not in the profile`;
    if (resolving.has(name)) return `role ${name} is \`like\` itself through a cycle`;
    resolving.add(name);
    const base = spec.like === undefined ? undefined : resolve(spec.like);
    if (typeof base === "string") return base;
    const role: Role = {
      name,
      root: spec.root ?? false,
      delegates: spec.delegates ?? base?.delegates ?? false,
      writes: spec.writes ?? base?.writes ?? false,
      reading: spec.reading ?? base?.reading ?? false,
      watches: spec.watches ?? base?.watches ?? false,
      humanDoor: spec.humanDoor ?? base?.humanDoor ?? false,
      spawns: new Set(spec.spawns ?? base?.spawns ?? []),
      speaksTo: new Set(spec.speaksTo ?? base?.speaksTo ?? []),
      tools: new Set(spec.tools ?? base?.tools ?? []),
      models: spec.models ?? base?.models ?? [],
    };
    resolving.delete(name);
    resolved.set(name, role);
    return role;
  };
  for (const name of Object.keys(raw)) {
    const role = resolve(name);
    if (typeof role === "string") return { ok: false, says: role };
  }
  const roots = [...resolved.values()].filter((r) => r.root);
  const root = roots[0];
  if (roots.length !== 1 || !root)
    return { ok: false, says: `exactly one role must be \`root\`, found ${roots.length}` };
  for (const role of resolved.values()) {
    const kinds = [role.delegates, role.writes, role.reading, role.watches].filter(Boolean).length;
    if (kinds > 1)
      return { ok: false, says: `role ${role.name} may be only one of delegates, writes, reading, watches` };
    for (const spawned of role.spawns)
      if (!resolved.has(spawned))
        return { ok: false, says: `role ${role.name} spawns ${spawned}, which is not a role` };
    if (role.spawns.size > 0 && !role.delegates)
      return { ok: false, says: `role ${role.name} spawns roles but does not delegate` };
    // A name that is no tool would leave the role without one and nobody told: a misspelling, or another core's tool.
    for (const tool of role.tools)
      if (!ROLE_TOOLS.has(tool))
        return { ok: false, says: `role ${role.name} is given the tool ${tool}, which the team does not have` };
  }
  if (Object.hasOwn(file.servers, TEAM_SERVER))
    return { ok: false, says: `no outside server may be named ${TEAM_SERVER}: that is the team's own` };
  for (const [name, spec] of Object.entries(raw))
    for (const server of Object.keys(spec.servers ?? {}))
      if (!Object.hasOwn(file.servers, server))
        return { ok: false, says: `role ${name} is given the server ${server}, which the profile does not declare` };
  return { ok: true, profile: { roles: resolved, root } };
}

/** A skill's `description` from its frontmatter: what an agent is told of the skill on every turn. */
export function skillDescription(skill: string): string {
  const match = /^description:\s*"?(.*?)"?\s*$/m.exec(skill);
  return match?.[1] ?? "";
}
