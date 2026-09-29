import { z } from "zod";

/** What a role may message, as relations on the scope graph (KERNEL.md §2). */
export const RELATIONS = ["parent", "children", "descendants", "human"] as const;
export type Relation = (typeof RELATIONS)[number];

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
  })
  .strict();

export const ProfileFileSchema = z
  .object({
    roles: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), RoleSchema),
    reflex: z.string().optional(),
    watch: z.string().optional(),
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
  }
  return { ok: true, profile: { roles: resolved, root } };
}
