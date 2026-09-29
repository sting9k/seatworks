import assert from "node:assert/strict";
import { test } from "node:test";
import { activityLine } from "../../shared/views/activity.ts";
import { humanView } from "../../shared/views/human.ts";
import { chainOf, signalsOf } from "../../shared/views/record.ts";
import { SHA, brief, plan, team } from "./ledger.ts";

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
  assert.deepEqual(
    view.directions.map((d) => d.text),
    ["use protobuf"],
    "the Human's own words, not an id",
  );
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

test("a Reviewer's red verdict followed by a send-back counts as a review that changed the work", () => {
  const { ledger, lead, peer, task, lane } = team();
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "encoded" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(2), parentHead: SHA(3) } }),
  );
  ledger.must(
    ledger.as(lead, "open_scope", {
      parent: lane,
      role: "reviewer",
      paths: [],
      commit: SHA(2),
      brief: brief("Review"),
    }),
  );
  ledger.must(ledger.fact("record_workspace", { scope: "1.2", ok: true, branch: null }));
  ledger.must(ledger.as("a4", "record_verdict", { ok: false, text: "the rounding is off" }));
  ledger.must(ledger.as(lead, "send_back", { scope: task, reason: "fix the rounding" }));
  assert.deepEqual(signalsOf(ledger.log).reviewsThatChanged, [1, 1]);
});

test("a finding reopened with new evidence reads as not yet weighed in its chain", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.as(peer, "raise_finding", { text: "int16 is too coarse", default: "keep it" }));
  ledger.must(ledger.as(lead, "classify_finding", { finding: "f1", verdict: "alternative", reason: "int16 holds" }));
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(1),
      ok: false,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  ledger.must(ledger.as(peer, "reopen_finding", { finding: "f1", evidence: ["e1"], text: "measured: it drifts" }));
  const chain = chainOf(ledger.log, "f1");
  assert.equal(chain?.verdict, null, "the old verdict no longer stands");
  assert.deepEqual(chain.evidence, ["e1"]);
});
