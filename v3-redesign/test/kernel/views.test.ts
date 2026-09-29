import assert from "node:assert/strict";
import { test } from "node:test";
import { activityLine } from "../../shared/views/activity.ts";
import { humanView } from "../../shared/views/human.ts";
import { chainOf, signalsOf } from "../../shared/views/record.ts";
import { plan, team } from "./ledger.ts";

test("the Human sees what waits on them, what agents decided for them, and their words not yet carried in", () => {
  const { ledger, supervisor, peer } = team();
  ledger.must(ledger.as(supervisor, "set_plan", { scope: "root", plan: plan("A fair game") }));
  ledger.must(
    ledger.as(supervisor, "ask_human", {
      text: "Ship Friday or keep fairness?",
      options: ["Friday", "Fairness"],
      recommend: "Fairness",
    }),
  );
  ledger.must(ledger.fact("record_human_words", { actor: peer, text: "use protobuf" }));

  const view = humanView(ledger.state);
  assert.deepEqual(
    view.questions.map((q) => [q.text, q.recommend]),
    [["Ship Friday or keep fairness?", "Fairness"]],
  );
  assert.ok(view.decisions.some((d) => d.scope === "root" && d.text === "A fair game" && d.by === supervisor));
  assert.equal(view.directions.length, 1);
  assert.equal(view.supervisor, supervisor);

  ledger.must(ledger.human("answer_question", { question: view.questions[0]!.id, text: "Fairness" }));
  assert.equal(humanView(ledger.state).questions.length, 0);
  const lines = ledger.log.map(activityLine).filter((l): l is string => l !== null);
  assert.ok(lines.some((l) => l.includes("asked you: Ship Friday")));
  assert.ok(lines.some((l) => l.includes("opened scope 1.1 (peer)")));
});

test("a finding's chain of change and the signals are read from the log", () => {
  const { ledger, lead, peer, task } = team();
  const line = ledger.state.scopes.get(task)!.brief!.constraints[0]!.id;
  ledger.must(ledger.as(peer, "raise_finding", { disputes: line, text: "int16 is too coarse", default: "keep it" }));
  ledger.must(ledger.as(peer, "raise_finding", { disputes: line, text: "still too coarse", default: "keep it" }));
  ledger.must(
    ledger.as(lead, "amend_brief", {
      scope: task,
      set: { constraints: [{ text: "int32" }] },
      reason: "measured",
      carries: "f1",
    }),
  );
  ledger.must(ledger.as(lead, "classify_finding", { finding: "f1", verdict: "changes", reason: "measured at 120 Hz" }));
  ledger.must(ledger.as(lead, "send_message", { to: peer, text: "Why?", asks: true }));

  const chain = chainOf(ledger.log, "f1");
  assert.ok(chain);
  assert.equal(chain.verdict, "changes");
  assert.equal(chain.briefWhenGiven, "v1: Encode directions");
  assert.deepEqual(
    chain.changes.map((c) => c.what),
    ["brief amended"],
  );

  const signals = signalsOf(ledger.log);
  assert.deepEqual(signals.repeatedFindings, [1, 2]);
  assert.deepEqual(signals.unanswered, [1, 1]);
});
