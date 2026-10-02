import fc from "fast-check";
import { SHA, brief } from "./ledger.ts";

const actor = fc.constantFrom("a1", "a2", "a3", "a4", "a5", "a6", "a7");
const scope = fc.constantFrom("root", "1", "1.1", "1.2", "1.3", "2", "2.1");
const path = fc.constantFrom("src/", "src/net/", "src/net/wire.ts", "src/ui/", "docs/", "");
const text = fc.constantFrom("a", "why?", "int8", "done");

/** Commands drawn mostly valid in shape, from the actors and scopes a team has, so runs reach deep states. */
export const command = fc.oneof(
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
      outcome: fc.constantFrom("done", "failed", "cancelled"),
      began: fc.option(text),
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
    type: fc.constant("run_checks"),
    args: fc.record({ scope, commit: fc.constant(SHA(3)), steps: fc.constant([{ name: "unit", run: ["true"] }]) }),
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
  fc.record({
    who: actor,
    type: fc.constant("amend_brief"),
    args: fc.record({
      scope,
      set: fc.constant({ context: [{ text: "more is known now" }] }),
      reason: text,
      carries: fc.option(fc.constantFrom("f1", "f2")),
    }),
  }),
  fc.record({
    who: actor,
    type: fc.constantFrom("hold_scope", "resume_scope", "send_back"),
    args: fc.record({ scope, reason: text }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("report"),
    args: fc.constant({ decided: ["int16"], open: ["the order"] }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("raise_finding"),
    args: fc.record({ about: scope, text, default: text }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("withdraw_finding"),
    args: fc.record({ finding: fc.constantFrom("f1", "f2"), reason: text }),
  }),
  fc.record({
    who: actor,
    type: fc.constant("reopen_finding"),
    args: fc.record({ finding: fc.constantFrom("f1", "f2"), text, evidence: fc.constant(["e1"]) }),
  }),
  fc.record({
    who: fc.constant("bridge"),
    type: fc.constant("record_observation"),
    args: fc.record({
      question: fc.constant("going-in-circles"),
      actor,
      scope,
      source: fc.constant("code"),
      answer: text,
      level: fc.constant("tell"),
      route: fc.constant({ kind: "attention", why: "the same call failed", urgency: "now" }),
    }),
  }),
);
