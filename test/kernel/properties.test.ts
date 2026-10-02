import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { Event } from "../../shared/contracts/events.ts";
import { foldCommand } from "../../shared/kernel/evolve.ts";
import { checkState } from "../../shared/kernel/invariants.ts";
import { INITIAL, type State } from "../../shared/kernel/state.ts";
import { command } from "./arbitrary.ts";
import { team } from "./ledger.ts";

test("every invariant holds after every command, every effect has a key of its own, and the log folds again to the same state", () => {
  fc.assert(
    fc.property(fc.array(command, { maxLength: 40 }), (commands) => {
      const { ledger } = team();
      for (const c of commands) {
        const caller = c.who === "bridge" ? ({ kind: "bridge" } as const) : ({ kind: "agent", actor: c.who } as const);
        ledger.send(caller, c.type, c.args);
        assert.equal(checkState(ledger.state), null);
        assert.deepEqual(dangling(ledger.state), []);
      }
      const replayed = foldByCommand(ledger.log);
      assert.deepEqual(replayed.scopes, ledger.state.scopes);
      assert.deepEqual(replayed.obligations, ledger.state.obligations);
      assert.deepEqual(replayed.counters, ledger.state.counters);
    }),
    { numRuns: 300 },
  );
});

/** Pruning never lets go of what something open still points at: a pointer left dangling is an obligation nobody can close. */
function dangling(s: State): string[] {
  const out: string[] = [];
  const has: Record<string, (id: string) => boolean> = {
    finding: (id) => s.findings.has(id),
    claim: (id) => s.claims.has(id),
    message: (id) => s.messages.has(id),
    direction: (id) => s.messages.has(id),
    question: (id) => s.questions.has(id),
    permission: (id) => s.permissions.has(id),
    candidate: () => true,
  };
  for (const o of s.obligations.values())
    if (!has[o.about.kind]?.(o.about.id)) out.push(`${o.id} about ${o.about.kind} ${o.about.id}`);
  for (const t of s.attentions.values()) {
    if (!s.scopes.has(t.about.scope)) out.push(`${t.id} about scope ${t.about.scope}`);
    if (!s.actors.has(t.about.actor)) out.push(`${t.id} about actor ${t.about.actor}`);
  }
  for (const f of s.findings.values()) if (!s.scopes.has(f.scope)) out.push(`${f.id} in scope ${f.scope}`);
  for (const scope of s.scopes.values())
    if (scope.parent !== null && !s.scopes.has(scope.parent)) out.push(`${scope.id} under ${scope.parent}`);
  return out;
}

/** Replays a log as the shell does after a restart: one command's events at a time. */
function foldByCommand(log: readonly Event[]): State {
  let state = INITIAL;
  let batch: Event[] = [];
  for (const e of log) {
    if (batch.length > 0 && batch[0]!.commandId !== e.commandId) {
      state = foldCommand(state, batch);
      batch = [];
    }
    batch.push(e);
  }
  return batch.length === 0 ? state : foldCommand(state, batch);
}
