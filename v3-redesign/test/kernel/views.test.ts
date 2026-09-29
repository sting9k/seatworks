import assert from "node:assert/strict";
import { test } from "node:test";
import { activityLine } from "../../shared/views/activity.ts";
import { humanView } from "../../shared/views/human.ts";
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
