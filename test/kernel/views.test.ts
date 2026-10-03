import assert from "node:assert/strict";
import { test } from "node:test";
import { activityLine } from "../../shared/views/activity.ts";
import { humanView } from "../../shared/views/human.ts";
import { chainOf, signalsOf, yieldsOf } from "../../shared/views/record.ts";
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
  assert.deepEqual(view.root, { role: "supervisor", owner: supervisor });

  ledger.must(ledger.human("answer_question", { question: view.questions[0]!.id, text: "Fairness" }));
  assert.equal(humanView(ledger.state).questions.length, 0);
  const lines = ledger.log.map(activityLine).filter((l): l is string => l !== null);
  assert.ok(lines.some((l) => l.includes("asked you: Ship Friday")));
  assert.ok(lines.some((l) => l.includes("opened scope 1.1 (peer)")));
});

test("the Human's view lists every scope as a tree, the root first, and says which scope a question came from", () => {
  const { ledger, supervisor, lead } = team();
  ledger.must(
    ledger.as(supervisor, "open_scope", { parent: "root", role: "lead", paths: ["docs/"], brief: brief("Guide") }),
  );
  ledger.must(ledger.as(lead, "open_scope", { parent: "1", role: "peer", paths: ["src/ui/"], brief: brief("Menu") }));
  ledger.must(ledger.as(supervisor, "ask_human", { text: "Ship Friday?", options: [], recommend: null }));

  const view = humanView(ledger.state);
  assert.deepEqual(
    view.scopes.map((s) => [s.scope, s.parent, s.goal]),
    [
      ["root", null, null],
      ["1", "root", "Ship the net layer"],
      ["1.1", "1", "Encode directions"],
      ["1.2", "1", "Menu"],
      ["2", "root", "Guide"],
    ],
    "each scope before what is under it, whatever order they were opened in",
  );
  assert.deepEqual(
    view.questions.map((q) => q.scope),
    ["root"],
  );

  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  assert.deepEqual(
    humanView(ledger.state)
      .scopes.map((s) => [s.scope, s.kind])
      .filter(([, kind]) => kind !== "work"),
    [["3", "watch"]],
    "and says of each whether it is work, a reading or a watch",
  );
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

test("a lane's owes counts what waits on its owner: obligations and open attentions", () => {
  const { ledger, supervisor, lead, lane, peer } = team();
  const owes = () => humanView(ledger.state).scopes.find((l) => l.scope === lane)?.owes;
  assert.equal(owes(), 0);
  ledger.must(ledger.as(supervisor, "send_message", { to: lead, text: "how is the wire?", asks: true }));
  assert.equal(owes(), 1);

  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  ledger.must(
    ledger.as("a4", "attend", { actor: peer, moment: "trades-the-goal", why: "same edit again", urgency: "now" }),
  );
  assert.equal(owes(), 2, "the open attention on the Lead is owed too");
  const attention = [...ledger.state.attentions.values()][0]!.id;
  ledger.must(ledger.as(lead, "acknowledge", { attention }));
  assert.equal(owes(), 1);
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
      commit: SHA(2).slice(0, 12),
      brief: brief("Review"),
    }),
  );
  ledger.must(ledger.fact("record_workspace", { scope: "1.2", ok: true, branch: null }));
  ledger.must(ledger.as("a4", "record_verdict", { ok: false, text: "the rounding is off" }));
  ledger.must(ledger.as(lead, "send_back", { scope: task, reason: "fix the rounding" }));
  assert.deepEqual(
    signalsOf(ledger.log).reviewsThatChanged,
    [1, 1],
    "the commit read was named by an abbreviation, and is the candidate all the same",
  );
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

test("a look back reads of each question how often it was asked and went past its threshold, what its watcher made of it and what came of its attentions", () => {
  const { ledger, supervisor, lead, peer, task } = team();
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  const asked = (level: string, answer: string) => ({
    question: "trades-the-goal",
    actor: peer,
    scope: task,
    source: "reflex",
    model: "jev-1.13.0",
    answer,
    level,
    route: { kind: "attention", why: "int8", urgency: "now" },
  });
  ledger.must(ledger.fact("record_observation", asked("record", "0.10")));
  ledger.must(ledger.fact("record_observation", asked("record", "0.20")));
  ledger.must(ledger.fact("record_observation", asked("consider", "0.95")));
  ledger.must(ledger.fact("record_observation", asked("consider", "0.60")));
  const [first, second] = [...ledger.state.obligations.values()].flatMap((o) =>
    o.about.kind === "candidate" ? [o.about.id] : [],
  );
  ledger.must(
    ledger.as("a4", "attend", {
      candidate: first,
      actor: peer,
      moment: "trades-the-goal",
      why: "int8 against a goal of precision",
      urgency: "now",
    }),
  );
  ledger.must(ledger.as(lead, "acknowledge", { attention: [...ledger.state.attentions.keys()][0]! }));
  ledger.must(ledger.as("a4", "pass", { candidate: second, reason: "the brief allows it" }));

  const looped = {
    question: "going-in-circles",
    actor: peer,
    scope: task,
    source: "code",
    answer: "5 times",
    level: "tell",
    route: { kind: "attention", why: "the same call failed the same way 5 times", urgency: "now" },
  };
  ledger.must(ledger.fact("record_observation", looped));
  ledger.must(ledger.fact("record_delivery", { to: lead, attentions: [[...ledger.state.attentions.keys()][0]!] }));
  ledger.must(ledger.as(lead, "send_message", { to: peer, text: "What has each attempt told you?" }));

  const row = (name: string) => yieldsOf(ledger.log).find((y) => y.name === name);
  assert.deepEqual(row("trades-the-goal"), {
    name: "trades-the-goal",
    asked: 4,
    past: 2,
    low: 2,
    mid: 1,
    high: 1,
    attended: 1,
    passed: 1,
    attentions: 1,
    acted: 0,
    acknowledged: 1,
    noise: 0,
    climbed: 0,
  });
  assert.deepEqual(row("going-in-circles"), {
    name: "going-in-circles",
    asked: 1,
    past: 1,
    low: 0,
    mid: 0,
    high: 0,
    attended: 0,
    passed: 0,
    attentions: 1,
    acted: 1,
    acknowledged: 0,
    noise: 0,
    climbed: 0,
  });
});
