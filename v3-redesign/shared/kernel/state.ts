import {
  type ActorId,
  type AttentionId,
  type ClaimId,
  type Counters,
  type EvidenceId,
  type FindingId,
  type MessageId,
  NO_COUNTS,
  type ObligationId,
  type PermissionId,
  type QuestionId,
  type ScopeId,
} from "../contracts/ids.ts";
import type {
  Actor,
  Attention,
  Claim,
  Evidence,
  Finding,
  Message,
  Obligation,
  Permission,
  Project,
  Question,
  Scope,
} from "../contracts/ledger.ts";

/** What `decide` reads, and nothing else: open work, not history (LEDGER.md §3, §10). */
export type State = {
  readonly seq: number;
  readonly counters: Counters;
  readonly project: Project | null;
  readonly scopes: ReadonlyMap<ScopeId, Scope>;
  readonly actors: ReadonlyMap<ActorId, Actor>;
  readonly findings: ReadonlyMap<FindingId, Finding>;
  readonly claims: ReadonlyMap<ClaimId, Claim>;
  readonly evidence: ReadonlyMap<EvidenceId, Evidence>;
  readonly messages: ReadonlyMap<MessageId, Message>;
  readonly questions: ReadonlyMap<QuestionId, Question>;
  readonly obligations: ReadonlyMap<ObligationId, Obligation>;
  readonly attentions: ReadonlyMap<AttentionId, Attention>;
  readonly permissions: ReadonlyMap<PermissionId, Permission>;
  readonly noise: ReadonlySet<string>;
  /** Messages the Human wrote and questions they answered: what a line may cite as theirs (I6, I9). Grows only with their words. */
  readonly humanWords: ReadonlySet<string>;
  readonly machineHeldBy: ActorId | null;
};

export const INITIAL: State = {
  seq: 0,
  counters: NO_COUNTS,
  project: null,
  scopes: new Map(),
  actors: new Map(),
  findings: new Map(),
  claims: new Map(),
  evidence: new Map(),
  messages: new Map(),
  questions: new Map(),
  obligations: new Map(),
  attentions: new Map(),
  permissions: new Map(),
  noise: new Set(),
  humanWords: new Set(),
  machineHeldBy: null,
};

export function noiseKey(moment: string, actor: ActorId, scope: ScopeId): string {
  return `${moment}|${actor}|${scope}`;
}

/** A copy of a map with one entry set; state is never mutated. */
export function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

/** A copy of a map with one entry removed. */
export function without<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
