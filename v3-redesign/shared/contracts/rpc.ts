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
    output: z.object({ projects: z.array(z.object({ id: z.string(), repo: z.string(), open: z.boolean() })) }),
  },
  view: {
    name: "seatworks.view",
    input: z.object({ project: z.string().min(1) }),
    output: z.object({ human: HumanViewSchema.nullable(), activity: z.array(z.string()), root: z.string() }),
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
} as const;
