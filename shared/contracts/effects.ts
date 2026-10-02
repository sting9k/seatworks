import type { ActorId, AttentionId, MessageId, Party, ScopeId } from "./ids.ts";
import type { Check } from "./ledger.ts";

/** What an event asks the world to do; it names ids, not copies, so what was delivered meanwhile is not sent twice. */
export type EffectBody =
  | { kind: "workspace.create"; scope: ScopeId }
  | { kind: "workspace.candidate"; scope: ScopeId; commit: string }
  | { kind: "workspace.advance"; scope: ScopeId; from: string; to: string }
  | { kind: "workspace.remove"; scope: ScopeId; branch: string | null; mergedInto: string | null }
  | { kind: "workspace.publish"; remote: string; branch: string; expectedSha: string }
  /** `by` is whoever asked for the run with `run_checks`; none for the project's checks on a hand-back. */
  | { kind: "evidence.run"; scope: ScopeId; subject: string; steps: readonly Check[]; by: Party | null }
  | { kind: "agent.create"; actor: ActorId }
  | { kind: "agent.archive"; actor: ActorId; host: string | null }
  | { kind: "agent.permission"; actor: ActorId; host: string | null; request: string; allow: boolean; reason: string }
  | {
      kind: "deliver";
      to: ActorId;
      item:
        | { kind: "message"; id: MessageId }
        | { kind: "attention"; id: AttentionId }
        | { kind: "note"; text: string; asks: boolean };
    }
  | { kind: "machine.hold"; actor: ActorId; hold: boolean };

export type Effect = { readonly key: string; readonly body: EffectBody };

/** Effects that load the machine: held while any project on it measures. */
export const LOADS_MACHINE: ReadonlySet<EffectBody["kind"]> = new Set([
  "workspace.create",
  "workspace.candidate",
  "evidence.run",
]);
