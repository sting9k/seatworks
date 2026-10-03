import { z } from "zod";

/** What the Human needs to know of a project (shared/views/human.ts). */
export const HumanViewSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      /** The scope its asker sits on, as each thing that waits on the Human names where it came from. */
      scope: z.string().nullable(),
      text: z.string(),
      options: z.array(z.string()),
      recommend: z.string().nullable(),
    }),
  ),
  permissions: z.array(z.object({ id: z.string(), actor: z.string(), scope: z.string().nullable(), text: z.string() })),
  /** A claim handed back to the Human — the root's own — waiting on their publish or send-back. */
  claims: z.array(z.object({ scope: z.string(), by: z.string(), text: z.string(), commit: z.string() })),
  remote: z.string().nullable(),
  /** What the watch saw that reached the root and stopped with the Human, until they acknowledge it or mark it noise. */
  attentions: z.array(
    z.object({ id: z.string(), actor: z.string(), scope: z.string(), why: z.string(), facts: z.array(z.string()) }),
  ),
  disagreements: z.array(
    z.object({
      id: z.string(),
      scope: z.string(),
      raisedBy: z.string(),
      text: z.string(),
      status: z.string(),
      reason: z.string().nullable(),
    }),
  ),
  decisions: z.array(z.object({ scope: z.string(), line: z.string(), text: z.string(), by: z.string() })),
  directions: z.array(z.object({ message: z.string(), text: z.string(), to: z.string(), owedBy: z.string() })),
  /** Every scope as a tree: the root first, each before what is under it. */
  scopes: z.array(
    z.object({
      scope: z.string(),
      parent: z.string().nullable(),
      owner: z.string().nullable(),
      role: z.string(),
      /** Work lands; a reading and a watch end, and neither is work left to land. */
      kind: z.enum(["work", "reading", "watch"]),
      goal: z.string().nullable(),
      status: z.string(),
      held: z.boolean(),
      /** What the scope's owner still owes: findings to weigh, questions, permissions, attentions. */
      owes: z.number(),
    }),
  ),
  spent: z.object({ usd: z.number(), tokens: z.number(), appetiteUsd: z.number().nullable() }),
  /** The agent the Human works with: the root's role as the profile names it, and whoever is seated in it. */
  root: z.object({ role: z.string(), owner: z.string().nullable() }).nullable(),
  /** The project's checks as they run on a hand-back: each its name, and the program and arguments it runs. */
  checks: z.array(z.object({ name: z.string(), run: z.array(z.string()) })),
});
export type HumanView = z.infer<typeof HumanViewSchema>;

/** How a project's own copy of its template stands beside the one installed: behind it, or changed by hand since. */
const ProjectTemplateSchema = z.object({
  name: z.string(),
  hash: z.string(),
  state: z.enum(["current", "behind", "uninstalled"]),
  edited: z.boolean(),
});
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

/** Something a team left behind that nothing uses any more, or a whole project, for the Human to remove or keep. */
export const LeftoverSchema = z.object({
  id: z.string(),
  kind: z.enum(["copy", "branch", "agent", "project", "record"]),
  project: z.string(),
  label: z.string(),
  why: z.string(),
  removable: z.boolean(),
  /** How many of its commits the base does not hold: they go with it, so the Human looks before picking it. */
  unmerged: z.number(),
  /** What it takes on disk; none for a branch or an agent, which are no folder, and for a project still attached. */
  bytes: z.number().nullable(),
  /** When it was left behind, where the record says: a record's own project was removed then. */
  at: z.string().nullable(),
});
export type Leftover = z.infer<typeof LeftoverSchema>;

/** Whether a newer release of the plugin is out, as Paseo's own update check answers. */
export const UpdateCheckSchema = z.object({
  status: z.enum(["available", "current", "local", "unknown"]),
  current: z.string().nullable(),
  latest: z.string().nullable(),
  links: z.array(z.string()),
  text: z.string(),
});
export type UpdateCheck = z.infer<typeof UpdateCheckSchema>;

/** Where a template to install is read from: a shared file on this machine, or one that comes with the plugin. */
const TemplateSourceSchema = z.union([
  z.object({ path: z.string().min(1) }).strict(),
  z.object({ preset: z.string().min(1) }).strict(),
]);
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;

/** A template that comes with the plugin, and whether it is installed as it comes, otherwise, or not at all. */
const PresetSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  installed: z.enum(["no", "same", "differs"]),
});
export type Preset = z.infer<typeof PresetSchema>;

/** What installing a template would bring to this machine (`server/profile/install.ts`). */
const TemplateOfferSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  hash: z.string(),
  replaces: z.boolean(),
  roles: z.array(z.string()),
  agentProfiles: z.array(z.object({ name: z.string(), there: z.boolean() })),
  /** Each outside server it declares, with the command it runs or the address it calls. */
  servers: z.array(z.object({ name: z.string(), runs: z.string() })),
  /** Each environment variable its servers read, and whether this machine has it set. */
  variables: z.array(z.object({ name: z.string(), there: z.boolean() })),
  /** Each host its classifier is served at, with the model asked there; none when it names no classifier. */
  classifier: z.array(z.object({ host: z.string(), model: z.string() })),
});
export type TemplateOffer = z.infer<typeof TemplateOfferSchema>;

/** A profile's agent profiles as they stand on this machine (`server/profile/agents.ts`). */
const ProfileAgentsSchema = z.object({
  name: z.string(),
  title: z.string(),
  problem: z.string().nullable(),
  agents: z.array(z.object({ name: z.string(), runsOn: z.string(), there: z.boolean() })),
});
export type ProfileAgents = z.infer<typeof ProfileAgentsSchema>;

/** The Human's surface calls these (PORTS.md, Human surface); shaped as Paseo's plugin RPC contracts. */
export const RPC = {
  openProject: {
    name: "seatworks.open_project",
    /** `profile` names the profile a project is attached with; with none, it is the only one installed. */
    input: z.object({
      cwd: z.string().min(1),
      base: z.string().min(1).optional(),
      profile: z.string().min(1).optional(),
    }),
    output: z.object({ project: z.string(), ok: z.boolean(), text: z.string() }),
  },
  human: {
    name: "seatworks.human",
    input: z.object({
      project: z.string().min(1),
      type: z.string().min(1),
      args: z.record(z.string(), z.unknown()).default({}),
    }),
    output: z.object({ ok: z.boolean(), text: z.string() }),
  },
  projects: {
    name: "seatworks.projects",
    input: z.object({}),
    output: z.object({
      projects: z.array(z.object({ id: z.string(), repo: z.string(), open: z.boolean() })),
      unattached: z.array(z.object({ name: z.string(), root: z.string() })),
      /** The profiles a project may be attached with: each the Human installed. */
      profiles: z.array(z.object({ name: z.string(), title: z.string(), description: z.string() })),
    }),
  },
  view: {
    name: "seatworks.view",
    input: z.object({ project: z.string().min(1) }),
    output: z.object({
      human: HumanViewSchema.nullable(),
      activity: z.array(z.string()),
      /** What looks stuck, as facts (`shared/views/stuck.ts`). */
      stuck: z.array(z.string()),
      /** How many scopes the record holds as taken in: the state forgets one once nothing open is under it. */
      landed: z.number(),
      root: z.string(),
      /** How the project's own copy of its template stands beside the one installed. */
      template: ProjectTemplateSchema.nullable(),
      alarm: z.string().nullable(),
    }),
  },
  /** Takes the installed template's files for a project anew, for the agents seated from then on. */
  syncTemplate: {
    name: "seatworks.sync_template",
    input: z.object({ project: z.string().min(1) }),
    output: z.object({ ok: z.boolean(), text: z.string() }),
  },
  /** Removes an installed template from this machine; projects go on with their own copies of it. */
  removeTemplate: {
    name: "seatworks.remove_template",
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ ok: z.boolean(), text: z.string() }),
  },
  projectAt: {
    name: "seatworks.project_at",
    input: z.object({ dir: z.string().min(1) }),
    output: z.object({ project: z.string().nullable() }),
  },
  record: {
    name: "seatworks.record",
    input: z.object({ project: z.string().min(1), finding: z.string().nullable().default(null) }),
    output: z.object({ text: z.string() }),
  },
  status: {
    name: "seatworks.status",
    input: z.object({ project: z.string().min(1), scope: z.string().default("root") }),
    output: z.object({ text: z.string() }),
  },
  leftovers: {
    name: "seatworks.leftovers",
    input: z.object({}),
    output: z.object({ leftovers: z.array(LeftoverSchema) }),
  },
  clean: {
    name: "seatworks.clean",
    input: z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }),
    output: z.object({ results: z.array(z.object({ id: z.string(), ok: z.boolean(), text: z.string() })) }),
  },
  /** The templates that come with the plugin, for the Human to install one. */
  presets: {
    name: "seatworks.presets",
    input: z.object({}),
    output: z.object({ presets: z.array(PresetSchema) }),
  },
  /** Reads a template from where it is and says what it would bring; nothing is installed. */
  templateOffer: {
    name: "seatworks.template_offer",
    input: z.object({ from: TemplateSourceSchema }),
    output: z.object({ ok: z.boolean(), text: z.string(), offer: TemplateOfferSchema.nullable() }),
  },
  /** Installs the template the Human read the offer of: `hash` is that offer's, and no other file is installed. */
  installTemplate: {
    name: "seatworks.install_template",
    input: z.object({ from: TemplateSourceSchema, hash: z.string().min(1) }),
    output: z.object({ ok: z.boolean(), text: z.string() }),
  },
  /** What each profile's agent profiles run on here; with `match`, that profile's whole matching is kept first. */
  agents: {
    name: "seatworks.agents",
    input: z.object({
      match: z
        .object({ profile: z.string().min(1), matching: z.record(z.string().min(1), z.string().min(1)) })
        .optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      text: z.string(),
      profiles: z.array(ProfileAgentsSchema),
      available: z.array(z.string()),
    }),
  },
  checkUpdate: {
    name: "seatworks.check_update",
    input: z.object({}),
    output: UpdateCheckSchema,
  },
} as const;

export type ViewOutput = z.infer<typeof RPC.view.output>;
