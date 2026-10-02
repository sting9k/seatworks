import assert from "node:assert/strict";
import { test } from "node:test";
import { HUMAN } from "../../shared/contracts/ids.ts";
import { humanView } from "../../shared/views/human.ts";
import { Ledger, SHA, brief, refusedBy, slpProfile, team } from "./ledger.ts";

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

  assert.equal(ledger.state.scopes.get("root")?.head, SHA(5), "the landing moved the recorded base head");
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

test("an amended brief changes only the sections it names: a Human's constraint left alone needs no word from them", () => {
  const { ledger, lead } = team();
  ledger.must(ledger.human("send_message", { to: lead, text: "keep the wire at int16" }));
  const said = [...ledger.state.messages.values()].find((m) => m.from === "human")!.id;
  ledger.must(
    ledger.as(lead, "open_scope", {
      parent: "1",
      role: "peer",
      paths: ["src/io/"],
      brief: brief("Read frames", {
        constraints: [{ text: "int16 on the wire", via: { kind: "message", id: said } }],
        context: [{ text: "frames arrive at 120 Hz" }],
      }),
    }),
  );
  const before = ledger.state.scopes.get("1.2")!.brief!;
  assert.equal(before.constraints[0]?.origin, "human");
  ledger.must(
    ledger.as(lead, "amend_brief", { scope: "1.2", set: { goal: { text: "Read and check frames" } }, reason: "r" }),
  );
  const after = ledger.state.scopes.get("1.2")!.brief!;
  assert.equal(after.version, 2);
  assert.equal(after.goal.text, "Read and check frames");
  assert.deepEqual(after.constraints, before.constraints);
  assert.deepEqual(after.context, before.context);
});

test("publish names the head the record last saw on the base; a moved tip is recorded so asking again works", () => {
  const early = new Ledger();
  early.must(early.human("open_project", { base: "main", profile: "slp", profileHash: "p1", model: "slp-supervisor" }));
  assert.equal(
    refusedBy(early.human("publish", { remote: "origin" })),
    "state",
    "before the workspace reports the head, there is nothing to expect",
  );

  const { ledger } = team();
  const asked = ledger.must(ledger.human("publish", { remote: "origin" }));
  const requested = asked.find((e) => e.type === "publish_requested");
  assert.ok(requested?.type === "publish_requested");
  assert.equal(requested.sha, SHA(0));
  const effect = ledger.effects.find((e) => e.body.kind === "workspace.publish");
  assert.ok(effect?.body.kind === "workspace.publish");
  assert.equal(effect.body.expectedSha, SHA(0));

  ledger.must(
    ledger.fact("record_publish", { result: { refused: "main moved since the publish was asked", at: SHA(9) } }),
  );
  const again = ledger.must(ledger.human("publish", { remote: "origin" }));
  assert.equal(
    again.find((e) => e.type === "publish_requested")?.sha,
    SHA(9),
    "the refusal told the record the tip it found",
  );
});

test("a hand-back from the root owes the Human, who sends it back or publishes over it", () => {
  // The shipped SLP profile does not give the root's role hand_back; the contract must hold for a profile that does.
  const slp = slpProfile();
  const sup = slp.roles.get("supervisor");
  assert.ok(sup);
  const roles = new Map(slp.roles);
  const handed = { ...sup, tools: new Set([...sup.tools, "hand_back"]) };
  roles.set("supervisor", handed);
  const profile = { roles, root: slp.root.name === "supervisor" ? handed : slp.root };
  const claimsOnHuman = (ledger: Ledger) =>
    [...ledger.state.obligations.values()].filter((o) => o.owedBy === HUMAN && o.about.kind === "claim");

  {
    const { ledger, supervisor } = team(new Ledger(profile));
    ledger.must(ledger.as(supervisor, "hand_back", { commit: SHA(9), text: "the project is done" }));
    assert.equal(claimsOnHuman(ledger).length, 1, "the root's claim waits on its parent's owner");
    const view = humanView(ledger.state);
    assert.equal(view.claims.length, 1, "the Human sees what is claimed of them");
    ledger.must(ledger.human("send_back", { scope: "root", reason: "not what I asked for" }));
    assert.equal(claimsOnHuman(ledger).length, 0);
  }
  {
    const { ledger, supervisor } = team(new Ledger(profile));
    ledger.must(ledger.as(supervisor, "hand_back", { commit: SHA(9), text: "the project is done" }));
    assert.equal(claimsOnHuman(ledger).length, 1);
    ledger.must(ledger.human("publish", { remote: "origin" }));
    ledger.must(ledger.fact("record_publish", { result: { sha: SHA(9) } }));
    assert.equal(claimsOnHuman(ledger).length, 0, "publishing the claim settles it");
  }
});

test("a small change: the Supervisor seats a Peer under the root and integrates it, with no Lead", () => {
  const ledger = new Ledger();
  ledger.must(ledger.human("open_project", { base: "main", profile: "slp", profileHash: "p", model: "m" }));
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
  const dropped = ledger.must(
    ledger.as(supervisor, "drop_scope", { scope: lane, reason: "the server lane changed the plan" }),
  );
  const closed = dropped.flatMap((e) => (e.type === "obligation_closed" ? [e.obligation] : []));
  assert.deepEqual(closed, [...new Set(closed)], "each obligation is closed once");
  assert.deepEqual([...ledger.state.scopes.keys()], ["root"]);
  assert.equal(ledger.state.obligations.size, 0);
  assert.equal(ledger.state.actors.size, 1);
});

test("a scope being integrated cannot be dropped before the merge's result lands", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(4), text: "wired" }));
  ledger.must(
    ledger.fact("record_candidate", {
      scope: task,
      commit: SHA(4),
      result: { candidate: SHA(5), parentHead: SHA(6) },
    }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(5),
      ok: true,
      summary: "",
      steps: [],
      heldMachine: false,
    }),
  );
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: ["e1"] }));
  assert.equal(
    refusedBy(ledger.as(lead, "drop_scope", { scope: task, reason: "changed the plan" })),
    "state",
    "the merge was already asked for; the record cannot say dropped while the branch holds it",
  );
  const landed = ledger.must(ledger.fact("record_integration", { scope: task, result: { sha: SHA(7) } }));
  assert.ok(landed.some((e) => e.type === "integrated"));
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

test("a permission moves with the seat that answers it, and closes when the agent that asked leaves", () => {
  const { ledger, supervisor, peer, lane } = team();
  const owedBy = (permission: string) =>
    [...ledger.state.obligations.values()].find((o) => o.about.kind === "permission" && o.about.id === permission)
      ?.owedBy;
  ledger.must(ledger.fact("record_permission", { actor: peer, request: "r1", text: "rm -rf build/" }));
  ledger.must(ledger.as(supervisor, "reseat", { scope: lane, reason: "fresh context" }));
  assert.equal(owedBy("p1"), "a4");
  ledger.must(ledger.as("a4", "answer_permission", { permission: "p1", allow: true, reason: "a build dir" }));
  assert.ok(ledger.effects.some((e) => e.body.kind === "agent.permission" && e.body.actor === peer && e.body.allow));

  ledger.must(ledger.fact("record_permission", { actor: peer, request: "r2", text: "git clean -fdx" }));
  ledger.must(ledger.as(supervisor, "release", { actor: "a4", reason: "the lane is the Supervisor's now" }));
  assert.equal(owedBy("p2"), supervisor, "the Peer still waits, and whoever left the seat empty owes the answer");
  ledger.must(ledger.as(supervisor, "answer_permission", { permission: "p2", allow: false, reason: "not now" }));

  ledger.must(ledger.fact("record_permission", { actor: peer, request: "r3", text: "npm install" }));
  assert.equal(owedBy("p3"), "human");
  ledger.must(ledger.fact("record_gone", { actor: peer, why: "the process died" }));
  assert.equal(owedBy("p3"), undefined, "nothing is owed to an agent that is gone");
  assert.equal(ledger.state.permissions.size, 0);
});

test("the Human may reseat the Supervisor: they stand as the root's parent", () => {
  const { ledger } = team();
  ledger.must(ledger.human("reseat", { scope: "root", reason: "compacted too often" }));
  assert.equal(ledger.state.scopes.get("root")?.owner, "a4");
});

test("a held scope seats nobody new until it is resumed", () => {
  const { ledger, lead, task } = team();
  ledger.must(ledger.as(lead, "hold_scope", { scope: task, reason: "waiting on the API" }));
  assert.equal(refusedBy(ledger.as(lead, "reseat", { scope: task, reason: "stuck" })), "state");
  ledger.must(ledger.as(lead, "resume_scope", { scope: task, reason: "the API is back" }));
  ledger.must(ledger.as(lead, "reseat", { scope: task, reason: "stuck" }));
});

test("a check result wakes whoever waited on it: its asker, or the integrator weighing a claim", () => {
  const { ledger, lead, peer, task } = team();
  const asks = (to: string) => {
    const d = ledger.effects
      .filter(
        (e) =>
          e.body.kind === "deliver" &&
          e.body.to === to &&
          e.body.item.kind === "note" &&
          e.body.item.text.startsWith("Checks on"),
      )
      .at(-1);
    return d?.body.kind === "deliver" && d.body.item.kind === "note" ? d.body.item.asks : undefined;
  };

  ledger.must(
    ledger.as(peer, "run_checks", { scope: task, commit: SHA(7), steps: [{ name: "unit", run: ["npm", "test"] }] }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(7),
      ok: true,
      summary: "green",
      steps: [],
      heldMachine: false,
    }),
  );
  assert.equal(asks(peer), true, "the Peer asked for the run and waits on its answer");
  assert.equal(asks(lead), false, "the owner above is told without waking");

  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(8), text: "wired" }));
  ledger.must(
    ledger.fact("record_candidate", {
      scope: task,
      commit: SHA(8),
      result: { candidate: SHA(9), parentHead: SHA(0) },
    }),
  );
  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(9),
      ok: true,
      summary: "green",
      steps: [],
      heldMachine: false,
    }),
  );
  assert.equal(asks(lead), true, "the claim's checks are an answer the integrator was waiting on");
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

test("a Reviewer's verdict on the candidate is still citable once its reading scope is dropped", () => {
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
  ledger.must(ledger.as("a4", "record_verdict", { ok: true, text: "reads right" }));
  const verdict = [...ledger.state.evidence.values()].find((e) => e.kind === "verdict")!.id;
  ledger.must(ledger.as(lead, "drop_scope", { scope: "1.2", reason: "read" }));
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: [verdict] }));
  assert.equal(ledger.state.scopes.get(task)?.integrating, true);
});

test("a scope opened after its sibling gets no copy and no agent until that sibling is integrated", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(
    ledger.as(lead, "open_scope", {
      parent: "1",
      role: "peer",
      paths: ["src/net/"],
      after: [task],
      brief: brief("Decode"),
    }),
  );
  const creates = (scope: string) =>
    ledger.effects.filter((e) => e.body.kind === "workspace.create" && e.body.scope === scope).length;
  assert.equal(creates("1.2"), 0, "no copy while 1.1 is open");
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "encoded" }));
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
  const green = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(2))!.id;
  ledger.must(ledger.as(lead, "integrate", { scope: task, evidence: [green] }));
  assert.equal(creates("1.2"), 0, "none while it is being integrated");
  ledger.must(ledger.fact("record_integration", { scope: task, result: { sha: SHA(2) } }));
  assert.equal(creates("1.2"), 1, "its copy once 1.1 is in");
  ledger.must(ledger.fact("record_workspace", { scope: "1.2", ok: true, branch: "sw/1.2" }));
  assert.ok(ledger.effects.some((e) => e.body.kind === "agent.create" && e.body.actor === "a4"));
});

test("a project opened is on the record with the profile it runs, by name and by the hash of its files then", () => {
  const ledger = new Ledger();
  const events = ledger.must(
    ledger.human("open_project", { base: "main", profile: "crew", profileHash: "abc123", model: "slp-supervisor" }),
  );

  assert.deepEqual(
    events.filter((e) => e.type === "project_opened").map((e) => [e.profile, e.profileHash]),
    [["crew", "abc123"]],
  );
  assert.equal(ledger.state.project?.profile, "crew");
});
