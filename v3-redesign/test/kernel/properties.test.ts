import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { Event } from "../../shared/contracts/events.ts";
import { foldCommand } from "../../shared/kernel/evolve.ts";
import { checkState } from "../../shared/kernel/invariants.ts";
import { INITIAL, type State } from "../../shared/kernel/state.ts";
import { SHA, brief, team } from "./ledger.ts";

const actor = fc.constantFrom("a1", "a2", "a3", "a4", "a5", "a6", "a7");
const scope = fc.constantFrom("root", "1", "1.1", "1.2", "1.3", "2", "2.1");
const path = fc.constantFrom("src/", "src/net/", "src/net/wire.ts", "src/ui/", "docs/", "");
const text = fc.constantFrom("a", "why?", "int8", "done");

/** Commands drawn mostly valid in shape, from the actors and scopes a team has, so runs reach deep states. */
const command = fc.oneof(
  fc.record({
    who: actor,
    type: fc.constant("open_scope"),
    args: fc.record({
      parent: scope,
      role: fc.constantFrom("lead", "peer", "reviewer"),
      paths: fc.array(path, { maxLength: 2 }),
      after: fc.array(scope, { maxLength: 1 }),
      brief: fc.constant(brief("g")),
      commit: fc.constant(SHA(9)),
    }),
  }),
  fc.record({ who: actor, type: fc.constant("raise_finding"), args: fc.record({ text, default: text }) }),
  fc.record({
    who: actor,
    type: fc.constant("send_message"),
    args: fc.record({ to: actor, text, asks: fc.boolean(), directs: fc.boolean() }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("hand_back"),
    args: fc.record({ commit: fc.constantFrom(SHA(1), SHA(2)), text }),
  }),
  fc.record({ who: actor, type: fc.constant("reseat"), args: fc.record({ scope, reason: text }) }),
  fc.record({ who: actor, type: fc.constant("release"), args: fc.record({ actor, reason: text }) }),
  fc.record({ who: actor, type: fc.constant("drop_scope"), args: fc.record({ scope, reason: text }) }),
  fc.record({
    who: actor,
    type: fc.constant("handover"),
    args: fc.record({ from: scope, to: scope, paths: fc.array(path, { minLength: 1, maxLength: 1 }), reason: text }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("add_edge"),
    args: fc.record({ scope, edge: fc.constant("after"), target: scope, reason: text }),
  }),
  fc.record({ who: fc.constant("bridge"), type: fc.constant("record_gone"), args: fc.record({ actor, why: text }) }),
  fc.record({
    who: fc.constant("bridge"),
    type: fc.constant("record_turn"),
    args: fc.record({
      actor,
      outcome: fc.constant("done"),
      tokensSoFar: fc.nat(100),
      usdSoFar: fc.constant(0),
      seen: fc.nat(50),
    }),
  }),
  fc.record({
    who: fc.constant("bridge"),
    type: fc.constant("record_candidate"),
    args: fc.record({
      scope,
      commit: fc.constant(SHA(1)),
      result: fc.constant({ candidate: SHA(3), parentHead: SHA(4) }),
    }),
  }),
  fc.record({
    who: fc.constant("bridge"),
    type: fc.constant("record_evidence"),
    args: fc.record({
      scope,
      subject: fc.constant(SHA(3)),
      ok: fc.boolean(),
      summary: text,
      steps: fc.constant([]),
      heldMachine: fc.constant(false),
    }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("integrate"),
    args: fc.record({ scope, evidence: fc.constantFrom(["e1"], ["e2"], ["e3"]), reason: text }),
  }),
  fc.record({
    who: fc.constant("bridge"),
    type: fc.constant("record_integration"),
    args: fc.record({ scope, result: fc.constant({ sha: SHA(3) }) }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("classify_finding"),
    args: fc.record({
      finding: fc.constantFrom("f1", "f2"),
      verdict: fc.constantFrom("alternative", "minor"),
      reason: text,
    }),
  }),
);

test("every invariant holds after every command, and the log folds again to the same state", () => {
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
