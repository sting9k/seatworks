import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger, SHA, brief, plan, refusedBy, team } from "./ledger.ts";

// Each case is a row of spec/CONFORMANCE.md, Invariants, sent as a tool sends it.

test("I1: a scope's writer changes only by a reseat, which leaves no moment with two writers", () => {
  const { ledger, lead, task } = team();
  const events = ledger.must(ledger.as(lead, "reseat", { scope: task, reason: "stuck" }));
  assert.deepEqual(
    events.slice(0, 2).map((e) => e.type),
    ["reseated", "actor_seated"],
  );
  const scope = ledger.state.scopes.get(task);
  assert.equal(scope?.writer, "a4");
  assert.notEqual(ledger.state.actors.get("a3")?.status, "seated");
});

test("I2: a Lead's scope has no writer, so the Lead hands back its lane's head and never writes its Peers' paths", () => {
  const { ledger, lead } = team();
  assert.equal(ledger.state.scopes.get("1")?.writer, null);
  assert.equal(refusedBy(ledger.as(lead, "hand_back", { commit: SHA(1), text: "done" })), null);
});

test("I3: open siblings that hold the same path are refused until one waits for the other, and waiting never cycles", () => {
  const { ledger, lead } = team();
  const peer = (after: string[]) =>
    ledger.as(lead, "open_scope", {
      parent: "1",
      role: "peer",
      paths: ["src/net/wire.ts"],
      after,
      brief: brief("Wire"),
    });
  assert.equal(refusedBy(peer([])), "I3");
  ledger.must(peer(["1.1"]));
  assert.equal(
    refusedBy(ledger.as(lead, "add_edge", { scope: "1.1", edge: "after", target: "1.2", reason: "try" })),
    "I3",
  );
});

test("I3: a child holds only paths inside its parent's", () => {
  const { ledger, lead } = team();
  assert.equal(
    refusedBy(ledger.as(lead, "open_scope", { parent: "1", role: "peer", paths: ["docs/"], brief: brief("Docs") })),
    "I3",
  );
});

test("I4: integrating needs evidence on the very commit being integrated, and a reason over a failing check", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "encoded" }));
  ledger.must(
    ledger.fact("record_candidate", { scope: task, commit: SHA(1), result: { candidate: SHA(2), parentHead: SHA(3) } }),
  );
  ledger.must(
    ledger.as(lead, "run_checks", { scope: task, commit: SHA(1), steps: [{ name: "unit", run: ["npm", "test"] }] }),
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
  const onOld = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(1))!.id;
  assert.equal(refusedBy(ledger.as(lead, "integrate", { scope: task, evidence: [onOld] })), "I4");

  ledger.must(
    ledger.fact("record_evidence", {
      scope: task,
      subject: SHA(2),
      ok: false,
      summary: "1 failing",
      steps: [],
      heldMachine: false,
    }),
  );
  const failing = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(2))!.id;
  assert.equal(refusedBy(ledger.as(lead, "integrate", { scope: task, evidence: [failing] })), "I4");
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
  const passing = [...ledger.state.evidence.values()].find((e) => e.subject === SHA(2) && e.ok)!.id;
  assert.equal(
    refusedBy(ledger.as(lead, "integrate", { scope: task, evidence: [passing] })),
    "I4",
    "the failing check is on the commit, cited or not",
  );
  ledger.must(
    ledger.as(lead, "integrate", {
      scope: task,
      evidence: [failing],
      reason: "the failing test is the old flaky one, tracked in f9",
    }),
  );
  assert.equal(ledger.state.scopes.get(task)?.integrating, true);
});

test("I5: a Peer does not amend its own brief, and a Reviewer holds no paths", () => {
  const { ledger, peer, lead, task } = team();
  assert.equal(
    refusedBy(
      ledger.as(peer, "amend_brief", { scope: task, set: { goal: { text: "Something easier" } }, reason: "easier" }),
    ),
    "authority",
  );
  assert.equal(
    refusedBy(
      ledger.as(lead, "open_scope", {
        parent: "1",
        role: "reviewer",
        paths: ["src/net/"],
        commit: SHA(9),
        brief: brief("Review"),
      }),
    ),
    "I5",
  );
});

test("I6: a goal the Human approved changes only on their word, and a line is theirs only through what they said", () => {
  const { ledger, supervisor } = team();
  ledger.must(ledger.as(supervisor, "set_plan", { scope: "root", plan: plan("A game that feels fair") }));
  const change = (cites: unknown) =>
    ledger.as(supervisor, "amend_plan", {
      scope: "root",
      goal: { text: "A game that ships Friday" },
      reason: "time",
      cites,
    });
  assert.equal(refusedBy(change(null)), "I6");

  ledger.must(ledger.human("send_message", { to: supervisor, text: "Friday matters more than fairness now" }));
  const said = [...ledger.state.messages.values()].find((m) => m.from === "human")!.id;
  ledger.must(change({ kind: "message", id: said }));

  ledger.must(
    ledger.as(supervisor, "amend_plan", {
      scope: "root",
      add: [{ section: "limits", text: "No servers", via: { kind: "message", id: "m999" } }],
      reason: "r",
    }),
  );
  const limit = ledger.state.scopes.get("root")!.plan!.limits.at(-1)!;
  assert.equal(limit.origin, supervisor);

  const settle = (text: string, via?: unknown) =>
    ledger.as(supervisor, "amend_plan", {
      scope: "root",
      add: [{ section: "terms", term: "Match", text, avoid: ["Game"], ...(via ? { via } : {}) }],
      reason: "a word settled",
      cites: via ?? null,
    });
  ledger.must(settle("One game between two players, won by the first to three", { kind: "message", id: said }));
  const terms = () => ledger.state.scopes.get("root")!.plan!.terms;
  assert.equal(terms()[0]!.line.origin, "human", "a word the Human settled is theirs");
  assert.equal(refusedBy(settle("A best of five")), "I6", "and settled again under the same word only on their word");
  ledger.must(settle("A best of five", { kind: "message", id: said }));
  assert.deepEqual(
    terms().map((t) => [t.name, t.line.text]),
    [["Match", "A best of five"]],
  );
});

test("I7: a word from outside a Peer's lane gives its Lead a copy; one that directs also leaves the Lead an obligation", () => {
  const { ledger, supervisor, lead, peer } = team();
  ledger.must(ledger.as(supervisor, "send_message", { to: peer, text: "What does int16 buy us?" }));
  const copies = () => [...ledger.state.messages.values()].filter((m) => m.to === lead && m.copyOf !== null);
  assert.equal(copies().length, 1);
  assert.equal([...ledger.state.obligations.values()].filter((o) => o.owedBy === lead).length, 0);

  ledger.must(ledger.as(supervisor, "send_message", { to: peer, text: "Use int8", directs: true }));
  const owed = [...ledger.state.obligations.values()].filter((o) => o.owedBy === lead && o.about.kind === "direction");
  assert.equal(owed.length, 1);
  const direction = owed[0]!.about.id;
  ledger.must(
    ledger.as(lead, "amend_brief", {
      scope: "1.1",
      set: { choices: [{ text: "int8", via: { kind: "message", id: direction } }] },
      reason: "the Supervisor's call",
    }),
  );
  assert.equal([...ledger.state.obligations.values()].filter((o) => o.about.kind === "direction").length, 0);
});

test("I7: what the Human types into a Peer's chat reaches its Lead as a direction to carry in or decline", () => {
  const { ledger, lead, peer } = team();
  ledger.must(ledger.fact("record_human_words", { actor: peer, text: "stop using protobuf" }));
  const owed = [...ledger.state.obligations.values()].find((o) => o.owedBy === lead && o.about.kind === "direction");
  assert.ok(owed);
  ledger.must(
    ledger.as(lead, "answer", { replyTo: owed.about.id, text: "Kept: the wire format is shared with the server lane" }),
  );
  assert.equal(ledger.state.obligations.has(owed.id), false);
});

test("I8: a finding classified as a change points to the change that carried it; one kept carries a reason", () => {
  const { ledger, lead, peer, task } = team();
  const line = ledger.state.scopes.get(task)!.brief!.constraints[0]!.id;
  ledger.must(
    ledger.as(peer, "raise_finding", {
      disputes: line,
      text: "int16 is not enough at 120 Hz",
      default: "keep int16 for now",
    }),
  );
  const finding = [...ledger.state.findings.keys()][0]!;
  assert.equal(refusedBy(ledger.as(lead, "classify_finding", { finding, verdict: "changes", reason: "yes" })), "I8");
  ledger.must(
    ledger.as(lead, "amend_brief", {
      scope: task,
      set: { constraints: [{ text: "int32 precision" }] },
      reason: "the finding",
      carries: finding,
    }),
  );
  ledger.must(ledger.as(lead, "classify_finding", { finding, verdict: "changes", reason: "measured" }));
  assert.equal(ledger.state.findings.get(finding)?.status, "carried");
});

test("I10: only the role with the Human's door asks them, and Peers do not message each other", () => {
  const { ledger, lead } = team();
  assert.equal(refusedBy(ledger.as(lead, "ask_human", { text: "Which one?" })), "authority");
  ledger.must(ledger.as(lead, "open_scope", { parent: "1", role: "peer", paths: ["src/ui/"], brief: brief("UI") }));
  assert.equal(refusedBy(ledger.as("a3", "send_message", { to: "a4", text: "hi" })), "I10");
});

test("I11: what a Peer was asked moves to whoever is reseated in its place, and never closes by itself", () => {
  const { ledger, lead, task } = team();
  ledger.must(ledger.as(lead, "send_message", { to: "a3", text: "Why int16?", asks: true }));
  const owed = [...ledger.state.obligations.values()].find((o) => o.owedBy === "a3")!;
  ledger.must(ledger.fact("record_gone", { actor: "a3", why: "the process died" }));
  assert.equal(ledger.state.obligations.get(owed.id)?.owedBy, lead);
  ledger.must(ledger.as(lead, "reseat", { scope: task, reason: "gone" }));
  assert.equal(ledger.state.scopes.get(task)?.writer, "a4");
});

test("I12: an observation past its threshold on a finding changes no finding, line or obligation", () => {
  const { ledger, peer, task } = team();
  ledger.must(ledger.as(peer, "raise_finding", { text: "the API is async", default: "wrap it" }));
  const before = {
    findings: ledger.state.findings,
    obligations: ledger.state.obligations,
    scope: ledger.state.scopes.get(task),
  };
  ledger.must(
    ledger.fact("record_observation", {
      question: "reason-meets-evidence",
      actor: peer,
      scope: task,
      source: "reflex",
      answer: "0.93",
      level: "tell",
      route: { kind: "note", to: "root", text: "The finding's reason may not meet its evidence." },
    }),
  );
  assert.deepEqual([...ledger.state.findings.values()], [...before.findings.values()]);
  assert.deepEqual([...ledger.state.obligations.values()], [...before.obligations.values()]);
  assert.deepEqual(ledger.state.scopes.get(task), before.scope);
});

test("the kernel adds nothing: a hundred findings to one Lead are all kept, none merged or capped", () => {
  const { ledger, peer } = team();
  for (let i = 0; i < 100; i++)
    ledger.must(ledger.as(peer, "raise_finding", { text: `finding ${i}`, default: "go on" }));
  assert.equal(ledger.state.findings.size, 100);
});

test("a profile with every role renamed behaves the same", () => {
  const base = new Ledger();
  const renamed = new Map(
    [...base.profile.roles].map(([name, role]) => [
      `x-${name}`,
      { ...role, name: `x-${name}`, spawns: new Set([...role.spawns].map((s) => `x-${s}`)) },
    ]),
  );
  const profile = { roles: renamed, root: renamed.get("x-supervisor")! };
  const other = new Ledger(profile);
  other.must(other.human("open_project", { base: "main", profileHash: "p1", model: "m" }));
  other.must(other.fact("record_workspace", { scope: "root", ok: true, branch: "main" }));
  other.must(other.as("a1", "open_scope", { parent: "root", role: "x-lead", paths: ["src/"], brief: brief("Net") }));
  other.must(other.as("a2", "open_scope", { parent: "1", role: "x-peer", paths: ["src/net/"], brief: brief("Enc") }));
  const { ledger } = team();
  const shape = (l: Ledger) =>
    l.log.filter((e) => e.type !== "plan_set" && e.type !== "workspace_ready").map((e) => e.type);
  assert.deepEqual(shape(other).slice(0, 6), shape(ledger).slice(0, 6));
});

test("I7: the Lead carries a direction in by citing, or answering, the copy it was given", () => {
  const { ledger, supervisor, lead, peer } = team();
  const copyTo = () => [...ledger.state.messages.values()].filter((m) => m.to === lead && m.copyOf !== null).at(-1)!;
  const directions = () => [...ledger.state.obligations.values()].filter((o) => o.about.kind === "direction");
  ledger.must(ledger.as(supervisor, "send_message", { to: peer, text: "Use int8", directs: true }));
  ledger.must(
    ledger.as(lead, "amend_brief", {
      scope: "1.1",
      set: { choices: [{ text: "int8", via: { kind: "message", id: copyTo().id } }] },
      reason: "the Supervisor's call",
    }),
  );
  assert.equal(directions().length, 0, "carried in through its copy");

  ledger.must(ledger.as(supervisor, "send_message", { to: peer, text: "Drop protobuf", directs: true }));
  ledger.must(ledger.as(lead, "answer", { replyTo: copyTo().id, text: "Kept: the server lane shares it" }));
  assert.equal(directions().length, 0, "declined through its copy");
});
