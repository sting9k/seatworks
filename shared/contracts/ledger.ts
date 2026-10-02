import type {
  ActorId,
  AttentionId,
  ClaimId,
  EvidenceId,
  FindingId,
  LineId,
  MessageId,
  ObligationId,
  ObservationId,
  Party,
  PermissionId,
  QuestionId,
  ScopeId,
} from "./ids.ts";

/** The entities of the ledger (LEDGER.md §3). */

export type Ref = { readonly kind: "message" | "question" | "finding" | "evidence"; readonly id: string };

export type Line = {
  readonly id: LineId;
  readonly text: string;
  readonly origin: Party;
  readonly via: Ref | null;
  readonly at: string;
};

export type BriefKind = "verification" | "discovery";

export type Brief = {
  readonly version: number;
  readonly goal: Line;
  readonly constraints: readonly Line[];
  readonly choices: readonly Line[];
  readonly context: readonly Line[];
  readonly kind: BriefKind;
};

export type Appetite = { readonly line: Line; readonly usd: number | null; readonly hours: number | null };

export type Unknown = { readonly line: Line; readonly check: string };

/** A word of the project's domain as it was settled: its definition is a line, and the words it stands in for. */
export type Term = { readonly name: string; readonly line: Line; readonly avoid: readonly string[] };

export type Plan = {
  readonly goal: Line;
  readonly limits: readonly Line[];
  readonly unknowns: readonly Unknown[];
  readonly appetite: Appetite;
  readonly terms: readonly Term[];
};

export type ScopeKind = "work" | "reading" | "watch";
export type ScopeStatus = "open" | "integrated" | "dropped";
export type Edge = "after" | "mayChange" | "mustTell";

export type Candidate = { readonly commit: string; readonly candidate: string; readonly parentHead: string };

export type Scope = {
  readonly id: ScopeId;
  readonly parent: ScopeId | null;
  readonly role: string;
  readonly kind: ScopeKind;
  readonly owner: ActorId | null;
  readonly writes: boolean;
  readonly writer: ActorId | null;
  readonly paths: readonly string[];
  readonly after: readonly ScopeId[];
  readonly mayChange: readonly ScopeId[];
  readonly mustTell: readonly ScopeId[];
  readonly commit: string | null;
  readonly over: readonly ScopeId[] | "all";
  readonly brief: Brief | null;
  readonly plan: Plan | null;
  readonly branch: string | null;
  /** The head of `branch` as the record last saw it: what a publish asks the workspace to still find. */
  readonly head: string | null;
  readonly workspace: "pending" | "ready" | "failed" | "none";
  readonly status: ScopeStatus;
  readonly held: boolean;
  readonly claim: ClaimId | null;
  readonly candidate: Candidate | null;
  readonly integrating: boolean;
  readonly children: number;
  /** What agents in this scope and every scope below it have spent, kept as they report it. */
  readonly spent: { readonly usd: number; readonly tokens: number };
};

export type ActorStatus = "seated" | "released" | "gone";

export type Actor = {
  readonly id: ActorId;
  readonly role: string;
  readonly scope: ScopeId;
  readonly model: string;
  readonly host: string | null;
  /** Whether its agent's tool server has reached the plugin: one that never does has none of the team's tools. */
  readonly tools: boolean;
  readonly status: ActorStatus;
  readonly turns: number;
  readonly tokens: number;
  readonly usd: number;
  readonly reported: { readonly tokens: number; readonly usd: number };
  /** How many items of its agent's history were read by the end of its last turn. */
  readonly seen: number;
  /** Its last turn failed and its words were sent again, so the next turn's failure is only told. */
  readonly resent: boolean;
  readonly startedAt: string;
};

export type Verdict = "changes" | "alternative" | "minor";
export type FindingStatus = "raised" | "carried" | "kept" | "waiting" | "withdrawn";

export type Finding = {
  readonly id: FindingId;
  readonly scope: ScopeId;
  readonly raisedBy: ActorId;
  readonly disputes: LineId | null;
  readonly about: ScopeId | null;
  readonly text: string;
  readonly evidence: readonly EvidenceId[];
  readonly default: string;
  readonly answeredBy: ScopeId;
  readonly status: FindingStatus;
  readonly verdict: Verdict | null;
  readonly reason: string | null;
  readonly carriedBy: readonly number[];
  readonly question: QuestionId | null;
  readonly raisedAt: number;
};

export type Behaviour = { readonly behaviour: string; readonly proof: string };

export type Claim = {
  readonly id: ClaimId;
  readonly scope: ScopeId;
  readonly by: ActorId;
  readonly commit: string;
  readonly text: string;
  readonly behaviours: readonly Behaviour[];
};

export type EvidenceKind = "check" | "verdict" | "measurement" | "judgement" | "human";
export type Cause = "environment" | "code";
export type Step = {
  readonly name: string;
  readonly exit: number;
  readonly seconds: number;
  readonly cause: Cause | null;
};

export type Evidence = {
  readonly id: EvidenceId;
  readonly scope: ScopeId;
  readonly kind: EvidenceKind;
  readonly subject: string;
  /** Null for a reader's answer to a question, which judges no commit. */
  readonly ok: boolean | null;
  readonly by: Party;
  readonly summary: string;
  readonly steps: readonly Step[];
  readonly heldMachine: boolean;
};

export type Message = {
  readonly id: MessageId;
  readonly from: Party;
  readonly to: Party;
  readonly text: string;
  readonly asks: boolean;
  readonly directs: boolean;
  readonly replyTo: MessageId | null;
  readonly copyOf: MessageId | null;
  readonly queued: boolean;
  readonly delivered: string | null;
  readonly answered: boolean;
  /** A note that wakes its reader though it asks nothing and opens no obligation (REFLEX.md, `wakes`). */
  readonly wakes: boolean;
};

export type Question = {
  readonly id: QuestionId;
  readonly from: ActorId;
  readonly text: string;
  readonly about: Ref | null;
  readonly options: readonly string[];
  readonly recommend: string | null;
};

export type Owed = {
  readonly kind: "finding" | "message" | "direction" | "question" | "claim" | "candidate" | "permission";
  readonly id: string;
};

/** An item of an agent's turn with up to two either side, oldest first, as the watch's eye saw them. */
export type Around = { readonly before: readonly string[]; readonly item: string; readonly after: readonly string[] };

/** A moment as the watch saw it, kept by the candidate that is about it for whoever weighs it. */
export type SeenMoment = {
  readonly actor: ActorId;
  readonly scope: ScopeId;
  readonly moment: string;
  readonly answer: string;
  readonly why: string;
  readonly around: Around | null;
  readonly facts: readonly string[];
};

export type Obligation = {
  readonly id: ObligationId;
  readonly owedBy: Party;
  readonly owedTo: Party;
  readonly about: Owed;
  readonly opened: string;
  /** Held by an obligation about a candidate, and by no other. */
  readonly seen?: SeenMoment;
};

export type Urgency = "now" | "later";
export type AttentionSource = "reflex" | "code" | "attend";

export type Attention = {
  readonly id: AttentionId;
  readonly about: { readonly actor: ActorId; readonly scope: ScopeId };
  readonly moment: string;
  readonly why: string;
  readonly facts: readonly string[];
  readonly source: AttentionSource;
  readonly urgency: Urgency;
  readonly to: Party;
  readonly delivered: string | null;
  readonly climbedFrom: AttentionId | null;
};

export type Observation = {
  readonly id: ObservationId;
  readonly question: string;
  readonly subject: { readonly actor: ActorId | null; readonly scope: ScopeId };
  readonly source: "reflex" | "code";
  readonly model: string | null;
  readonly answer: string;
  readonly level: "tell" | "consider" | "record";
};

export type Permission = {
  readonly id: PermissionId;
  readonly actor: ActorId;
  readonly request: string;
  readonly text: string;
};

export type Check = { readonly name: string; readonly run: readonly string[] };

export type Project = {
  readonly base: string;
  readonly remote: string | null;
  /** The profile the project runs, by its name; a look back reads which way of working the team had. */
  readonly profile: string;
  readonly profileHash: string;
  readonly checks: readonly Check[];
};
