import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger, SHA, brief, refusedBy, team } from "./ledger.ts";

test("one lane end to end: hand back, candidate, checks, integrate, land; then only the root stays in memory", () => {
  const { ledger, supervisor, lead, peer, lane, task } = team();
  ledger.must(ledger.as(supervisor, "set_checks", { checks: [{ name: "unit", run: ["npm", "test"] }] }));

  const handed = ledger.must(
    ledger.as(peer, "hand_back", {
      commit: SHA(1),
      text: "encoded",
      behaviours: [{ behaviour: "round trip", proof: "test/net.test.ts" }],
    }),
  );
  assert.ok(handed.some((e) => e.type === "obligation_opened"));
  assert.ok(ledger.effects.some((e) => e.body.kind === "workspace.candidate" && e.body.commit === SHA(1)));

  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(2), parentHead: SHA(3) } }),
  );
  const run = ledger.effects.find((e) => e.body.kind === "evidence.run");
  assert.deepEqual(run?.body, {
    kind: "evidence.run",
    scope: task,
    subject: SHA(2),
    steps: [{ name: "unit", run: ["npm", "test"] }],
  });

  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(2),
      ok: true,
      summary: "12 passed",
      steps: [],
      heldMachine: false,
    }),
  );
  const evidence = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(2))!.id;
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: [evidence] }));
  assert.ok(
    ledger.effects.some((e) => e.body.kind === "workspace.advance" && e.body.to === SHA(2) && e.body.from === SHA(3)),
  );

  ledger.must(ledger.fact("record_integration", { scope: task, result: { sha: SHA(2) } }));
  assert.equal(ledger.state.scopes.has(task), false, "an integrated task leaves memory");
  assert.equal(ledger.state.actors.has(peer), false, "and so does its released Peer");
  assert.ok(ledger.effects.some((e) => e.body.kind === "agent.archive" && e.body.actor === peer));
  assert.ok(ledger.effects.some((e) => e.body.kind === "workspace.remove" && e.body.scope === task));

  ledger.must(ledger.as(lead, "hand_back", { commit: SHA(4), text: "the lane is done" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: lane, commit: SHA(4), result: { candidate: SHA(5), parentHead: SHA(6) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: lane,
      subject: SHA(5),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  const landing = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(5))!.id;
  ledger.must(ledger.as(supervisor, "integrate", { scope: lane, evidence: [landing] }));
  ledger.must(ledger.fact("record_integration", { scope: lane, result: { sha: SHA(5) } }));

  assert.deepEqual([...ledger.state.scopes.keys()], ["root"]);
  assert.deepEqual([...ledger.state.actors.keys()], [supervisor]);
  assert.equal(ledger.state.obligations.size, 0);
  assert.equal(ledger.state.messages.size, 0);
  assert.equal(ledger.state.evidence.size, 0);
});

test("a base that moved under an integration is taken in again, on the same commit", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "done" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(2), parentHead: SHA(3) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(2),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  const evidence = [...ledger.state.evidence.values()][0]!.id;
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: [evidence] }));
  const refused = ledger.must(ledger.fact("record_integration", { scope: task, result: { refused: "moved" } }));
  assert.equal(refused[0]?.type, "integration_refused");
  const again = ledger.effects.filter((e) => e.body.kind === "workspace.candidate");
  assert.equal(again.length, 2);
  assert.equal(refusedBy(ledger.as(lead, "integrate", { scope: task, evidence: [evidence] })), "I4");
});

test("a small change: the Supervisor seats a Peer under the root and integrates it, with no Lead", () => {
  const ledger = new Ledger();
  ledger.must(ledger.human("open_project", { base: "main", profileHash: "p", model: "m" }));
  ledger.must(ledger.fact("record_workspace", { scope: "root", ok: true, branch: "main" }));
  ledger.must(
    ledger.as("a1", "open_scope", { parent: "root", role: "peer", paths: ["README.md"], brief: brief("Fix the typo") }),
  );
  ledger.must(ledger.as("a2", "hand_back", { commit: SHA(1), text: "fixed" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: "1", commit: SHA(1), result: { candidate: SHA(1), parentHead: SHA(7) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: "1",
      subject: SHA(1),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  ledger.must(ledger.as("a1", "integrate", { scope: "1", evidence: ["e1"] }));
  ledger.must(ledger.fact("record_integration", { scope: "1", result: { sha: SHA(1) } }));
  assert.deepEqual([...ledger.state.scopes.keys()], ["root"]);
});

test("a finding on the goal waits for the Human; the raiser's default stands; the answer resumes it", () => {
  const { ledger, supervisor, lead, lane } = team();
  const goal = ledger.state.scopes.get(lane)!.brief!.goal.id;
  ledger.must(
    ledger.as(lead, "raise_finding", {
      disputes: goal,
      text: "the net layer cannot ship without the server lane",
      default: "build the client half",
    }),
  );
  const finding = [...ledger.state.findings.values()][0]!;
  assert.equal(finding.answeredBy, "root");
  ledger.must(
    ledger.as(supervisor, "ask_human", {
      text: "Ship the client half alone?",
      about: { kind: "finding", id: finding.id },
    }),
  );
  assert.equal(ledger.state.findings.get(finding.id)?.status, "waiting");
  const question = [...ledger.state.questions.keys()][0]!;
  ledger.must(ledger.human("answer_question", { question, text: "Yes, client half first" }));
  assert.equal(ledger.state.findings.get(finding.id)?.status, "raised");
  assert.ok(ledger.effects.some((e) => e.body.kind === "deliver" && e.body.to === supervisor));
});

test("a scope with open children is not integrated, and dropping a lane closes what its tasks were owed", () => {
  const { ledger, supervisor, lead, peer, lane } = team();
  ledger.must(ledger.as(peer, "raise_finding", { text: "the socket API is async", default: "wrap it" }));
  ledger.must(ledger.as(lead, "hand_back", { commit: SHA(4), text: "lane" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: lane, commit: SHA(4), result: { candidate: SHA(5), parentHead: SHA(6) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: lane,
      subject: SHA(5),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  assert.equal(refusedBy(ledger.as(supervisor, "integrate", { scope: lane, evidence: ["e1"] })), "state");
  ledger.must(ledger.as(supervisor, "drop_scope", { scope: lane, reason: "the server lane changed the plan" }));
  assert.deepEqual([...ledger.state.scopes.keys()], ["root"]);
  assert.equal(ledger.state.obligations.size, 0);
  assert.equal(ledger.state.actors.size, 1);
});

test("a permission is answered by the owner above the asking agent, or the Human, never by another Peer", () => {
  const { ledger, lead, peer } = team();
  ledger.must(ledger.as(lead, "open_scope", { parent: "1", role: "peer", paths: ["src/ui/"], brief: brief("UI") }));
  ledger.must(ledger.fact("record_permission", { actor: peer, request: "r1", text: "rm -rf build/" }));
  const permission = [...ledger.state.permissions.keys()][0]!;
  assert.equal(
    refusedBy(ledger.as("a4", "answer_permission", { permission, allow: true, reason: "sure" })),
    "authority",
  );
  ledger.must(ledger.as(lead, "answer_permission", { permission, allow: true, reason: "a build dir" }));
  assert.ok(ledger.effects.some((e) => e.body.kind === "agent.permission" && e.body.allow));
  assert.equal(ledger.state.permissions.size, 0);
});

test("a permission answered in the agent's own prompt settles on the record, with no second answer sent", () => {
  const { ledger, lead, peer } = team();
  ledger.must(ledger.as(lead, "open_scope", { parent: "1", role: "peer", paths: ["src/ui/"], brief: brief("UI") }));
  ledger.must(ledger.fact("record_permission", { actor: peer, request: "r1", text: "rm -rf build/" }));
  const permission = [...ledger.state.permissions.keys()][0]!;
  const before = ledger.effects.length;
  ledger.must(ledger.fact("record_permission_settled", { actor: peer, request: "r1", allow: true }));
  const settled = ledger.effects.slice(before);
  assert.equal(ledger.state.permissions.size, 0);
  assert.ok(
    [...ledger.state.obligations.values()].every((o) => o.about.kind !== "permission"),
    "its answerer owes nothing",
  );
  assert.ok(!settled.some((e) => e.body.kind === "agent.permission"), "Paseo is not answered twice");
  assert.ok(
    settled.some(
      (e) =>
        e.body.kind === "deliver" &&
        e.body.to === lead &&
        e.body.item.kind === "note" &&
        /own prompt/.test(e.body.item.text),
    ),
    "its answerer is told",
  );
  assert.equal(
    refusedBy(ledger.as(lead, "answer_permission", { permission, allow: false, reason: "late" })),
    "unknown",
  );
  assert.deepEqual(
    ledger.must(ledger.fact("record_permission_settled", { actor: peer, request: "r1", allow: true })),
    [],
    "settled again, it has nothing left to close",
  );
});

test("a reseated Peer finds its undelivered mail waiting, and the Human may reseat the Supervisor", () => {
  const { ledger, lead, task } = team();
  ledger.must(ledger.as(lead, "send_message", { to: "a3", text: "one" }));
  ledger.must(ledger.as(lead, "send_message", { to: "a3", text: "two", asks: true }));
  ledger.must(ledger.as(lead, "reseat", { scope: task, reason: "fresh context" }));
  const waiting = [...ledger.state.messages.values()].filter((m) => m.to === "a4");
  assert.deepEqual(
    waiting.map((m) => m.text),
    ["one", "two"],
  );
  ledger.must(ledger.human("reseat", { scope: "root", reason: "compacted too often" }));
  assert.equal(ledger.state.scopes.get("root")?.owner, "a5");
});

test("a finding left open when its scope is integrated stays in memory with its obligation, until it is answered", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.as(peer, "raise_finding", { text: "the retry hides a race", default: "keep the retry" }));
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "done" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(2), parentHead: SHA(3) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(2),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: ["e1"] }));
  ledger.must(ledger.fact("record_integration", { scope: task, result: { sha: SHA(2) } }));
  assert.equal(ledger.state.findings.has("f1"), true);
  ledger.must(
    ledger.as(lead, "classify_finding", {
      finding: "f1",
      verdict: "minor",
      reason: "the race is covered by the lock in 1.2",
    }),
  );
  assert.equal(ledger.state.findings.has("f1"), false);
  assert.equal(ledger.state.scopes.has(task), false);
});

test("a turn's spend is the rise in what its agent reports, and all of it after the session started again", () => {
  const { ledger, peer, lane } = team();
  ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 100, usdSoFar: 1, seen: 0 }));
  ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 300, usdSoFar: 3, seen: 0 }));
  ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 50, usdSoFar: 0.5, seen: 0 }));
  assert.deepEqual(ledger.state.scopes.get(lane)?.spent, { usd: 3.5, tokens: 350 });
  assert.deepEqual(ledger.state.scopes.get("root")?.spent, { usd: 3.5, tokens: 350 });
});

test("a lane's spend counts its Peers' turns, still after they are integrated and let go", () => {
  const { ledger, lead, peer, lane, task } = team();
  ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 1000, usdSoFar: 1.5, seen: 0 }));
  ledger.must(ledger.fact("record_turn", { actor: lead, outcome: "done", tokensSoFar: 10, usdSoFar: 0.25, seen: 0 }));
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "done" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(1), parentHead: SHA(3) } }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(1),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: ["e1"] }));
  ledger.must(ledger.fact("record_integration", { scope: task, result: { sha: SHA(1) } }));
  assert.equal(ledger.state.scopes.has(task), false);
  assert.deepEqual(ledger.state.scopes.get(lane)?.spent, { usd: 1.75, tokens: 1010 });
  assert.deepEqual(ledger.state.scopes.get("root")?.spent, { usd: 1.75, tokens: 1010 });
});
