import { z } from "zod";
import { COMMANDS, type CommandType, FACTS, HUMAN_ONLY } from "./commands.ts";

/** The reads every agent may be shown besides the commands its role names. */
export const READS = {
  status: z.object({ scope: z.string().optional() }),
  record: z.object({ scope: z.string() }),
  diff: z.object({ scope: z.string(), commit: z.string().optional() }),
  look: z.object({ actor: z.string(), last: z.number().int().positive().max(200).default(40) }),
} as const;
export type ReadName = keyof typeof READS;

/** Every tool a profile may give a role, by name: the reads, and the commands an agent may send. */
export const ROLE_TOOLS: ReadonlySet<string> = new Set([
  ...Object.keys(READS),
  ...(Object.keys(COMMANDS) as CommandType[]).filter((type) => !FACTS.has(type) && !HUMAN_ONLY.has(type)),
]);

/** What each tool is for, in the words an agent reads; a description names no role, so any profile uses them. */
export const DESCRIPTIONS: Record<CommandType | ReadName, string> = {
  status:
    "Your scope as the record has it: its brief with line ids, its children, what waits on whom, what you owe and are owed, spend beside the appetite. Pass `scope` to see another.",
  record: "A scope's history: every brief version, its findings with what came of them, its reports.",
  diff: "A scope's change against its parent branch, at its branch head or a named commit.",
  look: "An agent's recent turns: what it said, thought and ran, newest last.",
  open_project: "Opens the project.",
  open_scope:
    "Opens a child scope under one you own, with its paths, its brief (goal, constraints, choices, context, kind) and an agent of the role you name.",
  amend_brief: "Amends a child scope's brief with a reason; `carries` names the finding it answers.",
  set_plan:
    "Sets your scope's plan: goal, limits, unknowns with how each is checked, appetite, and the domain's terms as settled.",
  amend_plan: "Amends your plan's lines with a reason.",
  add_edge: "Adds `after` (a sibling waits for another), `mayChange` or `mustTell` to a scope, with a reason.",
  remove_edge: "Removes an edge, with a reason.",
  handover: "Moves paths from one child scope to a sibling.",
  raise_finding:
    "Raises a finding: a premise, constraint or choice the evidence shows does not fit, with the evidence and what you do meanwhile. It is the channel for a check that cannot pass honestly, a premise the code contradicts, the same failure a third time, or a layer about to hide a contradiction.",
  reopen_finding: "Reopens a finding that was kept, with new evidence.",
  classify_finding:
    "Answers a finding: `changes` (after the change that carries it), `alternative` or `minor`, with a reason the raiser can argue with.",
  withdraw_finding: "Withdraws your finding, with a reason.",
  hand_back:
    "Hands your work back at a commit, with each behaviour beside what proves it. The project's checks run on it.",
  record_verdict: "Records your verdict on the commit you read, as evidence.",
  run_checks: "Runs the project's checks, or commands you name, on a commit of a scope; the result is evidence.",
  integrate:
    "Integrates a child scope's candidate commit, citing evidence on that very commit; a failing result needs a reason.",
  send_back: "Sends a hand-back back, saying why.",
  reseat: "Seats a fresh agent on a scope, briefed from the record; what the old one owed and was sent moves to it.",
  drop_scope: "Closes a scope without integrating it, with a reason.",
  hold_scope: "Holds a scope: nothing new is seated in it or integrated from it.",
  resume_scope: "Lifts a hold.",
  release: "Ends an agent's seat; its scope stays.",
  report:
    "Reports to whoever owns your scope's parent: what was decided, what was assumed unchecked, what is still open.",
  send_message:
    "Sends a message along the edges you have; `asks` keeps it owed until answered, `directs` marks it as changing what the reader is to do.",
  answer: "Answers a message you were sent.",
  ask_human: "Puts a question to the Human, with options and your recommendation.",
  answer_question: "Answers a question.",
  hold_machine: "Holds the machine while you measure, or releases it; nothing that loads the machine starts meanwhile.",
  answer_permission: "Allows or refuses what an agent's harness asked leave to do, with a reason.",
  acknowledge: "Says an attention was seen and needs nothing now.",
  mark_noise: "Stops one kind of attention for one agent and scope.",
  attend: "Sends an attention about an agent to the owner above its work, quoting the words that decided it.",
  pass: "Passes a candidate, with a reason.",
  set_checks: "Sets the project's checks: named commands as argv.",
  publish: "Pushes the landed base branch to a remote, never forced.",
  record_workspace: "",
  record_agent: "",
  record_turn: "",
  record_gone: "",
  record_delivery: "",
  record_candidate: "",
  record_evidence: "",
  record_integration: "",
  record_publish: "",
  record_permission: "",
  record_permission_settled: "",
  record_human_words: "",
  record_observation: "",
};

export type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };

/** The tools an agent of a role is shown: the reads, and the commands its role names. */
export function toolsFor(names: ReadonlySet<string>): ToolSpec[] {
  const specs: ToolSpec[] = [];
  for (const name of Object.keys(READS) as ReadName[]) if (names.has(name)) specs.push(spec(name, READS[name]));
  for (const name of Object.keys(COMMANDS) as CommandType[])
    if (names.has(name) && DESCRIPTIONS[name] !== "") specs.push(spec(name, COMMANDS[name]));
  return specs;
}

function spec(name: CommandType | ReadName, schema: z.ZodType): ToolSpec {
  return {
    name,
    description: DESCRIPTIONS[name],
    inputSchema: z.toJSONSchema(schema, { io: "input" }),
  };
}
