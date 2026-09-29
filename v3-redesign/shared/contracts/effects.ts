import type { ActorId, AttentionId, MessageId, ScopeId } from "./ids.ts";
import type { Check } from "./ledger.ts";

/**
 * What an event asks the world to do (LEDGER.md §8). An effect names ids, not copies: the dispatcher reads the current
 * state when it sends one, so a message moved to a new reader goes to the new reader.
 */
export type EffectBody =
  | { kind: "workspace.create"; scope: ScopeId }
  | { kind: "workspace.candidate"; scope: ScopeId; commit: string }
  | { kind: "workspace.advance"; scope: ScopeId; from: string; to: string }
  | { kind: "workspace.remove"; scope: ScopeId }
  | { kind: "workspace.publish"; remote: string; branch: string }
  | { kind: "evidence.run"; scope: ScopeId; subject: string; steps: readonly Check[] }
  | { kind: "agent.create"; actor: ActorId }
  | { kind: "agent.archive"; actor: ActorId }
  | { kind: "agent.permission"; actor: ActorId; request: string; allow: boolean; reason: string }
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
