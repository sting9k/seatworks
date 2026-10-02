import type { CommandType } from "../../shared/contracts/commands.ts";
import type { Role } from "../../shared/contracts/profile.ts";
import type { ReadName } from "../../shared/contracts/tools.ts";

/**
 * Tools that mean something to the same roles (EDITOR.md, Tool groups). `follows` says which roles' nodes a group
 * sits in; an optional group is a node of its own, wired to the roles that are given it.
 */
type ToolGroup = {
  readonly id: string;
  readonly name: string;
  readonly tools: readonly (CommandType | ReadName)[];
  readonly follows: ((role: Role) => boolean) | "optional";
};

const delegates = (role: Role) => role.delegates;

export const TOOL_GROUPS: readonly ToolGroup[] = [
  { id: "record", name: "Record", tools: ["status", "record", "diff"], follows: () => true },
  { id: "talk", name: "Talk", tools: ["send_message", "answer"], follows: (role) => role.speaksTo.size > 0 },
  {
    id: "scopes",
    name: "Scopes",
    tools: ["open_scope", "amend_brief", "handover", "reseat", "release", "drop_scope", "hold_scope", "resume_scope"],
    follows: delegates,
  },
  { id: "plan", name: "Plan", tools: ["set_plan", "amend_plan", "add_edge", "remove_edge"], follows: delegates },
  { id: "acceptance", name: "Acceptance", tools: ["integrate", "send_back", "classify_finding"], follows: delegates },
  {
    id: "attention",
    name: "Attention",
    tools: ["acknowledge", "mark_noise", "answer_permission", "look"],
    follows: delegates,
  },
  {
    id: "hand-back",
    name: "Hand-back",
    tools: ["hand_back", "run_checks", "report"],
    follows: (role) => role.writes || role.delegates,
  },
  { id: "human", name: "The Human", tools: ["ask_human"], follows: (role) => role.humanDoor },
  { id: "project", name: "Project", tools: ["set_checks", "publish"], follows: (role) => role.root },
  { id: "reading", name: "Reading", tools: ["record_verdict"], follows: (role) => role.reading },
  { id: "watching", name: "Watching", tools: ["attend", "pass"], follows: (role) => role.watches },
  {
    id: "findings",
    name: "Findings",
    tools: ["raise_finding", "withdraw_finding", "reopen_finding"],
    follows: "optional",
  },
  { id: "machine", name: "The machine", tools: ["hold_machine"], follows: "optional" },
];
