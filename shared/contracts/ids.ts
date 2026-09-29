/** Ids the kernel counts (LEDGER.md §1), so the same log always folds to the same ids. */
export type ScopeId = string;
export type ActorId = string;
export type LineId = string;
export type FindingId = string;
export type EvidenceId = string;
export type ClaimId = string;
export type MessageId = string;
export type QuestionId = string;
export type ObligationId = string;
export type ObservationId = string;
export type AttentionId = string;
export type PermissionId = string;

export const ROOT: ScopeId = "root";
export const HUMAN = "human";
export const BRIDGE = "bridge";

/** Who a line, message or obligation belongs to: an agent's actor or the Human. */
export type Party = ActorId;
/** Who called a command, as the log records it. */
export type By = ActorId;

export const ID_PREFIX = {
  actor: "a",
  line: "l",
  finding: "f",
  evidence: "e",
  claim: "c",
  message: "m",
  question: "q",
  obligation: "o",
  observation: "v",
  attention: "t",
  permission: "p",
} as const;

export type IdKind = keyof typeof ID_PREFIX;
export type Counters = Readonly<Record<IdKind, number>>;

export const NO_COUNTS: Counters = {
  actor: 0,
  line: 0,
  finding: 0,
  evidence: 0,
  claim: 0,
  message: 0,
  question: 0,
  obligation: 0,
  observation: 0,
  attention: 0,
  permission: 0,
};

export function childScopeId(parent: ScopeId, n: number): ScopeId {
  return parent === ROOT ? `${n}` : `${parent}.${n}`;
}

/** Labels every agent the plugin starts carries, so Paseo itself finds a project's agents and a seat's agent. */
export const PROJECT_LABEL = "seatworks.project";
export const ACTOR_LABEL = "seatworks.actor";
