import { z } from "zod";

/** What the Human needs to know of a project (shared/views/human.ts). */
export const HumanViewSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      text: z.string(),
      options: z.array(z.string()),
      recommend: z.string().nullable(),
    }),
  ),
  permissions: z.array(z.object({ id: z.string(), actor: z.string(), text: z.string() })),
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
  lanes: z.array(
    z.object({
      scope: z.string(),
      owner: z.string().nullable(),
      role: z.string(),
      goal: z.string().nullable(),
      status: z.string(),
      held: z.boolean(),
      /** What the lane's owner still owes: findings to weigh, questions, permissions, attentions. */
      owes: z.number(),
    }),
  ),
  spent: z.object({ usd: z.number(), tokens: z.number(), appetiteUsd: z.number().nullable() }),
  supervisor: z.string().nullable(),
});
export type HumanView = z.infer<typeof HumanViewSchema>;

/** Something a team left behind that nothing uses any more, or a whole project, for the Human to remove or keep. */
export const LeftoverSchema = z.object({
  id: z.string(),
  kind: z.enum(["copy", "branch", "agent", "project", "record"]),
  project: z.string(),
  label: z.string(),
  why: z.string(),
  removable: z.boolean(),
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

/** What installing a shared template would bring to this machine (`server/profile/install.ts`). */
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
});
export type TemplateOffer = z.infer<typeof TemplateOfferSchema>;

/** The Human's surface calls these (PORTS.md, Human surface); shaped as Paseo's plugin RPC contracts. */
export const RPC = {
  openProject: {
    name: "seatworks.open_project",
    /** `profile` names the profile a project is attached with; none is the shipped one. */
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
      /** The profiles a project may be attached with: the shipped one and each installed. */
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
      root: z.string(),
      alarm: z.string().nullable(),
    }),
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
  /** Reads a shared template from a file on this machine and says what it would bring; nothing is installed. */
  templateOffer: {
    name: "seatworks.template_offer",
    input: z.object({ path: z.string().min(1) }),
    output: z.object({ ok: z.boolean(), text: z.string(), offer: TemplateOfferSchema.nullable() }),
  },
  /** Installs the template the Human read the offer of: `hash` is that offer's, and no other file is installed. */
  installTemplate: {
    name: "seatworks.install_template",
    input: z.object({ path: z.string().min(1), hash: z.string().min(1) }),
    output: z.object({ ok: z.boolean(), text: z.string() }),
  },
  checkUpdate: {
    name: "seatworks.check_update",
    input: z.object({}),
    output: UpdateCheckSchema,
  },
} as const;

export type ViewOutput = z.infer<typeof RPC.view.output>;
