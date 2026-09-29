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
  directions: z.array(z.object({ message: z.string(), to: z.string(), owedBy: z.string() })),
  lanes: z.array(
    z.object({
      scope: z.string(),
      owner: z.string().nullable(),
      role: z.string(),
      goal: z.string().nullable(),
      status: z.string(),
      held: z.boolean(),
    }),
  ),
  spent: z.object({ usd: z.number(), tokens: z.number(), appetiteUsd: z.number().nullable() }),
  supervisor: z.string().nullable(),
});
export type HumanView = z.infer<typeof HumanViewSchema>;

/** Something a team left behind that nothing uses any more, or a whole project, for the Human to remove or keep. */
export const LeftoverSchema = z.object({
  id: z.string(),
  kind: z.enum(["copy", "branch", "agent", "project"]),
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

/** The Human's surface calls these (PORTS.md, Human surface); shaped as Paseo's plugin RPC contracts. */
export const RPC = {
  openProject: {
    name: "seatworks.open_project",
    input: z.object({ cwd: z.string().min(1), base: z.string().min(1).optional() }),
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
    }),
  },
  view: {
    name: "seatworks.view",
    input: z.object({ project: z.string().min(1) }),
    output: z.object({
      human: HumanViewSchema.nullable(),
      activity: z.array(z.string()),
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
  checkUpdate: {
    name: "seatworks.check_update",
    input: z.object({}),
    output: UpdateCheckSchema,
  },
} as const;

export type ViewOutput = z.infer<typeof RPC.view.output>;
