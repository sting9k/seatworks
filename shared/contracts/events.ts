import type {
  ActorId,
  AttentionId,
  By,
  FindingId,
  MessageId,
  ObligationId,
  Party,
  PermissionId,
  QuestionId,
  ScopeId,
} from "./ids.ts";
import type {
  Attention,
  Brief,
  Check,
  Claim,
  Edge,
  Evidence,
  Finding,
  Line,
  Message,
  Obligation,
  Observation,
  Permission,
  Plan,
  Question,
  Scope,
  Verdict,
} from "./ledger.ts";

/** Every event the kernel appends, with its payload (LEDGER.md §6). */
export type EventBody =
  | { type: "project_opened"; base: string; remote: string | null; profileHash: string }
  | { type: "scope_opened"; scope: Scope }
  | { type: "actor_seated"; actor: ActorId; role: string; scope: ScopeId; model: string }
  | { type: "workspace_ready"; scope: ScopeId; branch: string | null; head: string | null }
  | { type: "workspace_failed"; scope: ScopeId; why: string }
  | { type: "agent_started"; actor: ActorId; host: string }
  | { type: "brief_issued"; scope: ScopeId; brief: Brief }
  | { type: "brief_amended"; scope: ScopeId; brief: Brief; reason: string; carries: FindingId | null }
  | { type: "plan_set"; scope: ScopeId; plan: Plan }
  | { type: "plan_amended"; scope: ScopeId; plan: Plan; reason: string; carries: FindingId | null }
  | {
      type: "edge_added" | "edge_removed";
      scope: ScopeId;
      edge: Edge;
      target: ScopeId;
      reason: string;
      carries: FindingId | null;
    }
  | {
      type: "handed_over";
      from: ScopeId;
      to: ScopeId;
      paths: readonly string[];
      reason: string;
      carries: FindingId | null;
    }
  | { type: "finding_raised"; finding: Finding }
  | { type: "finding_classified"; finding: FindingId; verdict: Verdict; reason: string }
  | { type: "finding_waiting"; finding: FindingId; question: QuestionId }
  | { type: "finding_resumed"; finding: FindingId }
  | { type: "finding_reopened"; finding: FindingId; evidence: readonly string[]; text: string }
  | { type: "finding_withdrawn"; finding: FindingId; reason: string }
  | { type: "claim_made"; claim: Claim }
  | { type: "candidate_ready"; scope: ScopeId; commit: string; candidate: string; parentHead: string }
  | { type: "candidate_conflict"; scope: ScopeId; commit: string; paths: readonly string[] }
  | { type: "evidence_requested"; scope: ScopeId; subject: string; steps: readonly Check[]; by: Party }
  | { type: "evidence_recorded"; evidence: Evidence; wake: readonly Party[] }
  | {
      type: "integration_started";
      scope: ScopeId;
      candidate: string;
      parentHead: string;
      evidence: readonly string[];
      reason: string | null;
    }
  | { type: "integrated"; scope: ScopeId; sha: string }
  | { type: "integration_refused"; scope: ScopeId; why: string }
  | { type: "sent_back"; scope: ScopeId; reason: string }
  | { type: "reseated"; scope: ScopeId; from: ActorId | null; to: ActorId; reason: string }
  | { type: "scope_dropped"; scope: ScopeId; reason: string }
  | { type: "scope_held" | "scope_resumed"; scope: ScopeId; reason: string }
  | { type: "report_made"; scope: ScopeId; decided: readonly Line[]; assumed: readonly Line[]; open: readonly Line[] }
  | { type: "message_sent"; message: Message }
  | { type: "message_delivered"; message: MessageId; at: string }
  | { type: "message_moved"; message: MessageId; from: Party; to: Party }
  | { type: "question_asked"; question: Question }
  | { type: "question_answered"; question: QuestionId; text: string; asker: ActorId }
  | { type: "obligation_opened"; obligation: Obligation }
  | { type: "obligation_closed"; obligation: ObligationId; how: string }
  | { type: "obligation_moved"; obligation: ObligationId; to: Party }
  | { type: "machine_held" | "machine_released"; actor: ActorId; why: string }
  | { type: "actor_released"; actor: ActorId; reason: string }
  | { type: "actor_gone"; actor: ActorId; why: string }
  | {
      type: "turn_ended";
      actor: ActorId;
      outcome: "done" | "failed" | "cancelled";
      why: string | null;
      /** What the plugin sends again for a failed turn its words began; none past one try. */
      again: string | null;
      tokens: number;
      usd: number;
      tokensSoFar: number;
      usdSoFar: number;
      seen: number;
    }
  | { type: "checks_set"; checks: readonly Check[] }
  | { type: "publish_requested"; remote: string; branch: string; sha: string }
  | { type: "published"; remote: string; branch: string; sha: string }
  | { type: "publish_refused"; remote: string; branch: string; why: string; found: string | null }
  | { type: "permission_asked"; permission: Permission }
  | {
      type: "permission_answered";
      permission: PermissionId;
      actor: ActorId;
      request: string;
      allow: boolean;
      reason: string;
    }
  | { type: "permission_settled"; permission: PermissionId; actor: ActorId; allow: boolean }
  | { type: "observation_made"; observation: Observation }
  | { type: "attention_opened"; attention: Attention }
  | { type: "attention_delivered"; attention: AttentionId; at: string }
  | { type: "attention_acted"; attention: AttentionId; by: By }
  | { type: "acknowledged"; attention: AttentionId }
  | { type: "noise_marked"; attention: AttentionId; key: string }
  | { type: "attention_climbed"; attention: AttentionId; to: Attention }
  | { type: "attended"; candidate: string | null; attention: AttentionId | null }
  | { type: "passed"; candidate: string; reason: string };

export type EventType = EventBody["type"];

/** An event as the log keeps it: the body, stamped by the shell. */
export type Event = EventBody & {
  readonly seq: number;
  readonly at: string;
  readonly by: By;
  readonly commandId: string;
};
