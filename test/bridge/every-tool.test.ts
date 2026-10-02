import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { crew, git } from "./crew.ts";

// Each case is a row of spec/CONFORMANCE.md, Tools: every tool called as an agent's tool server sends it, by a team
// of plain roles each given every tool, and its job read back from where it shows.

type Crew = Awaited<ReturnType<typeof crew>>;
type Tools = Awaited<ReturnType<Crew["tools"]>>;
const crews: Crew[] = [];
after(async () => {
  for (const c of crews) await c.plugin.dispose();
});
async function started(): Promise<Crew> {
  const c = await crew();
  crews.push(c);
  return c;
}
/** A call that must be taken, with everything it set going settled before the next. */
async function did(c: Crew, who: Tools, name: string, args: Record<string, unknown>): Promise<string> {
  const reply = await who.call(name, args);
  assert.ok(reply.ok, `${name}: ${reply.text}`);
  await c.plugin.idle();
  await c.plugin.idle();
  return reply.text;
}
/** A call the kernel must refuse, with why. */
async function refused(who: Tools, name: string, args: Record<string, unknown>, why: RegExp): Promise<void> {
  const reply = await who.call(name, args);
  assert.equal(reply.ok, false, `${name} was taken: ${reply.text}`);
  assert.match(reply.text, why);
}
const brief = (goal: string, more: Record<string, unknown> = {}) => ({
  goal: { text: goal },
  kind: "verification",
  ...more,
});
const status = async (who: Tools, scope?: string) => (await who.call("status", scope ? { scope } : {})).text;

test("the scope tools: open, amend a brief, handover, hold and resume, reseat, release, drop; each shows where it is read and reaches whom it changes something for", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief: brief("Lane") });
  const keeper = await c.tools(1);
  await did(c, keeper, "open_scope", {
    parent: "1",
    role: "maker",
    paths: ["src/a/"],
    commit: git(c.repo, "rev-parse", "main"),
    brief: brief("A", { constraints: [{ text: "Stay small" }] }),
  });
  const opened = await status(keeper, "1.1");
  assert.match(opened, /^Branch: sw\/[0-9a-f]+\/1\.1$/m, "a writer works on a branch of its own");
  assert.doesNotMatch(opened, /Reads commit/, "a commit named for it is no seat: only a reader is seated on one");
  await did(c, keeper, "open_scope", { parent: "1", role: "maker", paths: ["src/b/", "src/c/"], brief: brief("B") });
  assert.match(
    await status(keeper),
    /Children:\n- 1\.1 open · a3 \(maker\) · src\/a\/\n- 1\.2 open · a4 \(maker\) · src\/b\/, src\/c\//,
  );
  await refused(
    keeper,
    "open_scope",
    { parent: "1", role: "maker", paths: ["docs/"], brief: brief("C") },
    /^Refused \(I3\): docs\/ is outside scope 1's paths/,
  );

  await did(c, keeper, "handover", { from: "1.2", to: "1.1", paths: ["src/c/"], reason: "A needs c" });
  assert.match(await status(keeper, "1.1"), /^Paths: src\/a\/, src\/c\/$/m);
  assert.match(await status(keeper, "1.2"), /^Paths: src\/b\/$/m);
  const moved = /src\/c\/ moved from scope 1\.2 to scope 1\.1: A needs c/;
  assert.match(c.told(2).join("\n"), moved, "the writer that gained the paths is told");
  assert.match(c.told(3).join("\n"), moved, "and so is the one that lost them");

  await refused(
    keeper,
    "amend_brief",
    { scope: "1.1", set: {}, reason: "nothing" },
    /^The arguments do not fit amend_brief: .*an amendment changes one section at least/s,
  );
  await did(c, keeper, "amend_brief", {
    scope: "1.1",
    set: { constraints: [{ text: "Stay tiny" }] },
    reason: "smaller still",
  });
  assert.match(
    await status(keeper, "1.1"),
    /Brief v2 \(verification\)\nGoal: \[l\d+\] A\nMust hold:\n- \[l\d+\] Stay tiny/,
  );
  assert.match(c.told(2).join("\n"), /Your brief is now version 2/);

  await did(c, keeper, "hold_scope", { scope: "1.1", reason: "wait for the design" });
  assert.match(await status(keeper, "1.1"), /^Scope 1\.1 · work · open · held · a3/);
  assert.match(c.told(2).join("\n"), /Scope 1\.1 is held: wait for the design/, "the agent working in it is told");
  await refused(keeper, "reseat", { scope: "1.1", reason: "fresh" }, /scope 1\.1 is held: nothing new is seated in it/);
  await did(c, keeper, "resume_scope", { scope: "1.1", reason: "the design is in" });
  assert.match(c.told(2).join("\n"), /Scope 1\.1 is no longer held: the design is in/);

  await did(c, keeper, "reseat", { scope: "1.1", reason: "a fresh pair of eyes" });
  assert.match(await status(keeper, "1.1"), /^Scope 1\.1 · work · open · a5 \(maker\)/);
  assert.ok(c.paseo.archived.includes(c.paseo.created[2]!.host), "the agent that left is archived");
  assert.equal(c.paseo.created[4]?.title, "1.1 · maker", "and a new one is made for the same scope");

  await did(c, keeper, "release", { actor: "a4", reason: "B is not needed yet" });
  assert.match(await status(keeper, "1.2"), /^Scope 1\.2 · work · open · nobody seated/);
  assert.ok(c.paseo.archived.includes(c.paseo.created[3]!.host));
  await did(c, keeper, "drop_scope", { scope: "1.2", reason: "B is not needed at all" });
  assert.doesNotMatch(await status(keeper), /1\.2/, "a dropped scope is no longer among its parent's children");
  assert.match(
    (await keeper.call("record", { scope: "1.2" })).text,
    / dropped: B is not needed at all$/,
    "a dropped scope's record says so",
  );

  assert.match(
    (await keeper.call("record", { scope: "1.1" })).text,
    / src\/c\/ moved from scope 1\.2 to scope 1\.1: A needs c\n.* brief v2 \(smaller still\): A\n.* held: wait for the design\n.* resumed: the design is in\n.* reseated, a3 to a5: a fresh pair of eyes$/m,
    "a scope's record keeps what its owner above did to it, in order",
  );
  assert.match(
    (await chief.call("record", { scope: "1" })).text,
    / scope 1\.1 opened under it: a maker on src\/a\/\n.* scope 1\.2 opened under it: a maker on src\/b\/, src\/c\/\n.* scope 1\.2 dropped: B is not needed at all$/m,
    "and a scope's record keeps each scope opened under it and what came of it, which outlasts the child itself",
  );

  const made = c.paseo.created.length;
  await did(c, keeper, "open_scope", {
    parent: "1",
    role: "maker",
    paths: ["src/d/"],
    after: ["1.1"],
    brief: brief("D"),
  });
  assert.match(await status(keeper, "1.3"), /^Waits for: 1\.1$/m);
  assert.match(await status(keeper), /^- 1\.3 open · a\d+ \(maker\) · src\/d\/ · no agent yet$/m);
  assert.equal(
    c.paseo.created.length,
    made,
    "a scope that waits for a sibling has no agent until that sibling is closed",
  );
  await did(c, keeper, "drop_scope", { scope: "1.1", reason: "D goes first after all" });
  assert.equal(c.paseo.created.at(-1)?.title, "1.3 · maker", "and starts once it is");
  assert.doesNotMatch(await status(keeper), /no agent yet/);
  for (const t of [chief, keeper]) t.close();
});

test("the work tools: checks a writer runs itself, a hand-back sent back and handed back again, a reader's verdict, integration on evidence, and a publish", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "set_checks", { checks: [{ name: "done", run: ["sh", "check.sh"] }] });
  await did(c, chief, "open_scope", { parent: "root", role: "maker", paths: ["src/"], brief: brief("Make a") });
  const maker = await c.tools(1);
  const copy = c.paseo.created[1]!.cwd;
  mkdirSync(join(copy, "src/a"), { recursive: true });
  writeFileSync(join(copy, "src/a/half.txt"), "half\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "half");
  const half = git(copy, "rev-parse", "HEAD");

  assert.equal(
    await did(c, maker, "run_checks", { scope: "1", commit: half }),
    "Recorded: evidence requested, and you are told its result when it has run.",
  );
  assert.match(await status(maker), new RegExp(`Evidence:\\n- e1 check by a2 on ${half}: failing · done failed`));
  assert.match(
    c.told(1).join("\n"),
    new RegExp(`^Checks a2 asked for on ${half} for scope 1 \\(done\\): failed \\(evidence e1\\)`, "m"),
    "the writer that asked is told: whose checks, which ran by name, and the evidence it may cite",
  );

  await did(c, maker, "hand_back", {
    commit: half,
    text: "half of it",
    behaviours: [{ behaviour: "a exists", proof: "check.sh" }],
  });
  assert.match(await status(chief, "1"), new RegExp(`Handed back: ${half} · half of it · candidate [0-9a-f]{40}`));
  await did(c, chief, "send_back", { scope: "1", reason: "the check fails" });
  assert.match(c.told(1).at(-1) ?? "", /^Your hand-back was sent back: the check fails$/);
  assert.match(
    c.told(0).join("\n"),
    /failed \(evidence e1\)/,
    "the owner above reads of the writer's own check with its next delivery",
  );
  await refused(chief, "integrate", { scope: "1", evidence: ["e1"] }, /scope 1 has no candidate commit/);

  writeFileSync(join(copy, "src/a/done.txt"), "done\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "done");
  const head = git(copy, "rev-parse", "HEAD");
  await did(c, maker, "hand_back", { commit: head, text: "all of it" });
  assert.match(
    c.told(0).join("\n"),
    new RegExp(
      `^Scope 1 handed back ${head}: all of it\\nThe project's checks run on its candidate now, and you are told their result\\.$`,
      "m",
    ),
    "whoever takes it in reads that a result is on its way, and need not ask for the same checks",
  );
  const passing = new RegExp(`- (e\\d+) check on ${head}: ok`).exec(await status(chief, "1"))?.[1];
  assert.ok(passing, "the hand-back's own checks ran on the commit handed back");
  assert.match(
    c.told(0).join("\n"),
    new RegExp(`^The project's checks on ${head} for scope 1 \\(done\\): passed \\(evidence ${passing}\\)`, "m"),
    "and their result says they are the project's own, apart from those anyone asked for",
  );

  await did(c, chief, "open_scope", { parent: "root", role: "reader", commit: head, brief: brief("Read it") });
  const reader = await c.tools(2);
  await did(c, reader, "record_verdict", { ok: false, text: "done.txt holds one word" });
  const verdict = new RegExp(
    `Verdict on ${head} from scope 2: it does not stand \\((e\\d+)\\)\\. done\\.txt holds one word`,
  ).exec(c.told(0).join("\n"))?.[1];
  assert.ok(verdict, "whoever seated the reader is told its verdict, with the evidence it is");
  await refused(
    chief,
    "integrate",
    { scope: "1", evidence: [passing] },
    /a failing result is integrated only with a reason/,
  );

  await did(c, chief, "run_checks", {
    scope: "1",
    commit: head,
    steps: [{ name: "mine", run: ["sh", "-c", "exit 0"] }],
  });
  const taken = { scope: "1", evidence: [passing, verdict], reason: "one word is what was asked" };
  assert.equal(
    await did(c, chief, "integrate", taken),
    "Recorded: integration started, and you are told when it is made or refused.",
  );
  assert.equal(git(c.repo, "rev-parse", "main"), head, "the base holds the commit");
  assert.equal(c.told(0).at(-1), `Scope 1 is integrated: main is at ${head}.`, "whoever asked for it is told it is in");
  assert.ok(c.paseo.archived.includes(c.paseo.created[1]!.host), "and its writer's agent is let go");
  await refused(chief, "send_back", { scope: "1", reason: "too late" }, /no scope 1/);
  assert.match(
    (await chief.call("record", { scope: "1" })).text,
    new RegExp(
      ` handed back ${half}: half of it\\n.* sent back: the check fails\\n.* handed back ${head}: all of it\\n.* integrated at ${head}$`,
      "m",
    ),
    "a scope's record keeps each hand-back and what came of it, after the scope is closed too",
  );

  assert.equal(
    await did(c, chief, "publish", { remote: "origin" }),
    "Recorded: publish requested, and you are told when it is pushed or refused.",
  );
  assert.equal(git(c.remote, "rev-parse", "main"), head);
  assert.equal(c.told(0).at(-1), `Published main to origin at ${head}.`, "and that it is on the remote");
  assert.match((await c.plugin.view(c.project))!.activity.at(-1) ?? "", /published main to origin$/);
  for (const t of [chief, maker, reader]) t.close();
});

test("the finding tools: raised on a line, kept, reopened on new evidence, carried by the change that answers it, and withdrawn", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief: brief("Lane") });
  const keeper = await c.tools(1);
  await did(c, keeper, "open_scope", {
    parent: "1",
    role: "maker",
    paths: ["src/a/"],
    brief: brief("A", { choices: [{ text: "Use a map" }] }),
  });
  const maker = await c.tools(2);
  const choice = /Chosen so far[^]*?\[(l\d+)\] Use a map/.exec(await status(maker))?.[1];

  assert.equal(
    await did(c, maker, "raise_finding", { disputes: choice, text: "A map loses order", default: "keep the map" }),
    "Recorded: finding raised (f1); obligation opened.",
  );
  assert.match(c.told(1).join("\n"), /Finding f1 from a3: A map loses order\nMeanwhile: keep the map/);
  await refused(keeper, "classify_finding", { finding: "f1", verdict: "changes", reason: "right" }, /^Refused \(I8\)/);
  await did(c, keeper, "classify_finding", { finding: "f1", verdict: "minor", reason: "order does not matter here" });
  assert.match(c.told(2).join("\n"), /Finding f1 was classified minor: order does not matter here/);
  assert.match(await status(keeper), /^- f1 kept from a3/m);

  await refused(
    maker,
    "reopen_finding",
    { finding: "f1", evidence: [], text: "it does" },
    /The arguments do not fit reopen_finding/,
  );
  const base = git(c.paseo.created[2]!.cwd, "rev-parse", "HEAD");
  await did(c, maker, "run_checks", {
    scope: "1.1",
    commit: base,
    steps: [{ name: "order", run: ["sh", "-c", "exit 1"] }],
  });
  await did(c, maker, "reopen_finding", { finding: "f1", evidence: ["e1"], text: "the order test fails" });
  assert.match(
    c.told(1).at(-1) ?? "",
    /Finding f1 from a3 is reopened: the order test fails\nNew evidence: e1\nIt said: A map loses order/,
    "whoever answers it reads what is new, not the finding as it first was",
  );

  await did(c, keeper, "amend_brief", {
    scope: "1.1",
    set: { choices: [{ text: "Use a list" }] },
    reason: "order matters",
    carries: "f1",
  });
  await did(c, keeper, "classify_finding", { finding: "f1", verdict: "changes", reason: "you were right" });
  assert.match(await status(keeper), /^- f1 carried from a3/m);
  assert.match(
    (await keeper.call("record", { scope: "1.1" })).text,
    /f1 from a3: A map loses order\n {2}classified minor: order does not matter here\n {2}reopened: the order test fails \(e1\)\n {2}carried by brief amended \(a2\)\n {2}classified changes: you were right/,
    "the record keeps the whole chain, the reopening too",
  );

  await did(c, maker, "raise_finding", { text: "the tests are slow", default: "go on" });
  await did(c, maker, "withdraw_finding", { finding: "f2", reason: "my machine was busy" });
  assert.match(await status(keeper), /^- f2 withdrawn from a3/m);
  await did(c, maker, "send_message", { to: "a2", text: "What next?", asks: true });
  assert.match(
    c.told(1).at(-1) ?? "",
    /Finding f2 was withdrawn by a3: my machine was busy/,
    "whoever owed it an answer reads that it is owed none, with its next delivery",
  );
  await refused(
    keeper,
    "classify_finding",
    { finding: "f2", verdict: "minor", reason: "late" },
    /finding f2 is withdrawn/,
  );

  await did(c, maker, "raise_finding", { about: "1", text: "the lane's plan names no cache", default: "go on" });
  await did(c, keeper, "set_plan", {
    scope: "1",
    plan: { goal: { text: "Lane" }, appetite: { line: { text: "A day" } } },
  });
  await did(c, keeper, "amend_plan", {
    scope: "1",
    add: [{ section: "limits", text: "A cache holds what was read" }],
    reason: "the cache was missing",
    carries: "f3",
  });
  await did(c, keeper, "classify_finding", { finding: "f3", verdict: "changes", reason: "the plan has it now" });
  const laneHead = git(c.repo, "rev-parse", "main");
  assert.equal(
    await did(c, keeper, "hand_back", { commit: laneHead, text: "the lane, for a first look" }),
    "Recorded: claim made (c1), though scope 1.1 is still open under it and a scope is taken in only once none under it is; obligation opened.",
    "a hand-back of a scope with work still open under it is taken, and says what will keep it from being taken in",
  );
  assert.match(
    c.told(0).at(-1) ?? "",
    /^Scope 1 handed back [0-9a-f]{40}: the lane, for a first look\nStill open under it: 1\.1\.\nNo check is set/,
    "and whoever is to take it in reads the same",
  );
  const chain =
    "f3 from a3: the lane's plan names no cache\n  carried by plan amended (a2)\n  classified changes: the plan has it now";
  const lane = (await keeper.call("record", { scope: "1" })).text;
  assert.ok(lane.endsWith(chain), "a finding about another scope is read in that scope's record, with what came of it");
  assert.doesNotMatch(lane, /\bf[12]\b/, "and no other scope's findings are");
  assert.ok(
    (await maker.call("record", {})).text.endsWith(
      `f2 from a3: the tests are slow\n  withdrawn: my machine was busy\n${chain}`,
    ),
    "the scope it was raised in keeps it too, beside the one withdrawn",
  );
  for (const t of [chief, keeper, maker]) t.close();
});

test("the talk tools: a message that asks is owed until answered, a direction from above reaches the owner between, a question reaches the Human and its answer the asker, a report its sections", async () => {
  const c = await started();
  const chief = await c.tools(0);
  assert.equal(
    await did(c, chief, "open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief: brief("Lane") }),
    "Recorded: scope opened (1); actor seated (a2); brief issued.",
    "a reply names what was made by the id it is called by from then on",
  );
  const keeper = await c.tools(1);
  await did(c, keeper, "open_scope", { parent: "1", role: "maker", paths: ["src/a/"], brief: brief("A") });
  const maker = await c.tools(2);

  assert.equal(
    await did(c, keeper, "send_message", { to: "a3", text: "How far are you?", asks: true }),
    "Recorded: message sent (m1 to a3); obligation opened.",
  );
  assert.match(
    c.told(2).at(-1) ?? "",
    /^m1 from a2 \(keeper, scope 1\) · it asks an answer: `answer` with replyTo m1\nHow far are you\?$/,
  );
  assert.match(await status(maker), /You owe:\n- message m1 to a2: How far are you\?$/m);
  await did(c, maker, "answer", { replyTo: "m1", text: "Half way" });
  assert.match(c.told(1).at(-1) ?? "", /^m2 from a3 \(maker, scope 1\.1\) · answering m1\nHalf way$/);
  assert.doesNotMatch(await status(maker), /You owe/);
  await refused(maker, "send_message", { to: "a1", text: "hello" }, /^Refused \(I10\): a maker does not speak to a1/);

  await did(c, chief, "send_message", { to: "a3", text: "Switch to int8", directs: true });
  assert.match(c.told(2).at(-1) ?? "", /^m3 from a1 \(chief, scope root\) · it directs\nSwitch to int8$/);
  assert.match(
    c.told(1).at(-1) ?? "",
    /a copy of m3 to a3 \(maker, scope 1\.1\) · it directs\nSwitch to int8$/,
    "the owner between them gets a copy",
  );
  assert.match(await status(keeper), /You owe:\n- direction m3 to a1: Switch to int8$/m);

  const question = { text: "int8 or int16?", options: ["int8", "int16"], recommend: "int8, it is enough" };
  assert.equal(await did(c, chief, "ask_human", question), "Recorded: question asked (q1); obligation opened.");
  const asked = (await c.plugin.view(c.project))!.human.questions;
  assert.deepEqual(asked, [
    { id: "q1", from: "a1", text: "int8 or int16?", options: ["int8", "int16"], recommend: "int8, it is enough" },
  ]);
  await refused(keeper, "ask_human", { text: "?" }, /^Refused \(I10\)/);
  assert.ok((await c.plugin.human(c.project, { type: "answer_question", question: "q1", text: "int8" })).ok);
  await c.plugin.idle();
  assert.match(c.told(0).at(-1) ?? "", /^The Human answered question q1: int8$/);

  await refused(
    keeper,
    "report",
    {},
    /^The arguments do not fit report: .*a report says a line under one section at least/s,
  );
  await refused(keeper, "report", { done: [] }, /^The arguments do not fit report/);
  await did(c, keeper, "report", { unsure: ["The load"], done: ["Half the lane"] });
  assert.match(c.told(0).at(-1) ?? "", /^Report from scope 1\.\ndone:\n- Half the lane\nunsure:\n- The load$/);

  await did(c, chief, "send_message", { to: "a2", text: "Which of the two\ndo you keep?", asks: true });
  await did(c, chief, "reseat", { scope: "1", reason: "a fresh owner for the lane" });
  const fresh = c.paseo.created.at(-1)!;
  assert.match(
    fresh.prompt,
    /You owe:\n- direction m3 to a1: Switch to int8\n- message m5 to a1: Which of the two\n {2}do you keep\?/,
    "a new holder of the seat reads what it owes, in the words it is owed for",
  );
  assert.match(
    c.paseo.sent.filter((s) => s.host === fresh.host).at(-1)?.text ?? "",
    /^m5 from a1 \(chief, scope root\) · it asks an answer: `answer` with replyTo m5\nWhich of the two\ndo you keep\?$/,
    "and the question the one before it read and left unanswered is sent to it",
  );

  for (const t of [chief, keeper, maker]) t.close();
});

test("the plan tools: a plan set once, then amended line by line; its goal changes only on the Human's word", async () => {
  const c = await started();
  const chief = await c.tools(0);
  const plan = {
    goal: { text: "Ship it" },
    limits: [{ text: "No new deps" }],
    unknowns: [{ line: { text: "The load" }, check: "measure it" }],
    appetite: { line: { text: "A day" }, usd: 5 },
    terms: [{ name: "lane", line: { text: "A slice" }, avoid: ["track"] }],
  };
  await did(c, chief, "set_plan", { scope: "root", plan });
  const set = await status(chief);
  assert.match(
    set,
    /Plan\nGoal: \[l1\] Ship it\nLimit: \[l2\] No new deps\nUnknown: \[l3\] The load · checked by: measure it\nAppetite: \[l4\] A day\nTerm lane: \[l5\] A slice · not: track/,
  );
  assert.match(set, /of an appetite of \$5$/m);
  await refused(chief, "set_plan", { scope: "root", plan }, /scope root has a plan: amend it/);

  await did(c, chief, "amend_plan", {
    scope: "root",
    remove: ["l2"],
    add: [
      { section: "limits", text: "One new dep at most" },
      { section: "unknowns", text: "The memory", check: "profile it" },
      { section: "terms", term: "lane", text: "A vertical slice" },
    ],
    reason: "learned more",
  });
  assert.match(
    await status(chief),
    /Limit: \[l6\] One new dep at most\nUnknown: \[l3\] The load · checked by: measure it\nUnknown: \[l7\] The memory · checked by: profile it\nAppetite: \[l4\] A day\nTerm lane: \[l8\] A vertical slice$/m,
  );
  await refused(
    chief,
    "amend_plan",
    { scope: "root", goal: { text: "Ship it twice" }, reason: "more" },
    /^Refused \(I6\)/,
  );
  await refused(
    chief,
    "amend_plan",
    { scope: "root", reason: "nothing" },
    /^The arguments do not fit amend_plan: .*an amendment changes one line at least/s,
  );

  const said = {
    type: "send_message",
    to: "a1",
    text: "Ship it twice",
    asks: true,
    directs: false,
    replyTo: null,
  } as const;
  assert.ok((await c.plugin.human(c.project, said)).ok);
  await c.plugin.idle();
  const word = /(m\d+) from the Human/.exec(c.told(0).join("\n"))?.[1];
  assert.ok(word, c.told(0).join("\n"));
  await did(c, chief, "amend_plan", {
    scope: "root",
    goal: { text: "Ship it twice", via: { kind: "message", id: word } },
    reason: "the Human said so",
    cites: { kind: "message", id: word },
  });
  assert.match(await status(chief), /Goal: \[l\d+, the Human's\] Ship it twice/);
  chief.close();
});

test("the attention tools: a watcher's attention reaches the owner above the agent watched, who settles it or marks its kind noise; a permission is answered by that owner; the machine is held by one at a time", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief: brief("Lane") });
  const keeper = await c.tools(1);
  await did(c, keeper, "open_scope", { parent: "1", role: "maker", paths: ["src/a/"], brief: brief("A") });
  const maker = await c.tools(2);
  await did(c, chief, "open_scope", { parent: "root", role: "guard", over: "all" });
  const guard = await c.tools(3);
  assert.match(await status(guard), /^Watches over: every scope$/m, "a watcher reads what it watches");

  await did(c, guard, "attend", {
    actor: "a3",
    moment: "going-in-circles",
    why: "It said 'again' three times",
    urgency: "now",
  });
  assert.match(
    c.told(1).at(-1) ?? "",
    /^ATTENTION t1 · a3 \(maker, scope 1\.1\) · going-in-circles · attend · now\nwhy: It said 'again' three times/,
  );
  assert.deepEqual(c.told(2), [], "the agent watched is told nothing");
  await refused(guard, "acknowledge", { attention: "t1" }, /attention t1 was not sent to you/);
  assert.match(
    (await keeper.call("record", { scope: "1.1" })).text,
    / attention t1 \(going-in-circles\) to a2$/m,
    "the record of the scope it is about keeps it",
  );
  await did(c, keeper, "acknowledge", { attention: "t1" });
  await refused(keeper, "acknowledge", { attention: "t1" }, /no open attention t1/);

  await did(c, guard, "attend", { actor: "a3", moment: "going-in-circles", why: "again", urgency: "later" });
  await did(c, keeper, "mark_noise", { attention: "t2" });
  const before = c.told(1).length;
  assert.equal(
    await did(c, guard, "attend", { actor: "a3", moment: "going-in-circles", why: "a third time", urgency: "now" }),
    "Recorded: attended, and nobody was told: this kind is marked noise for that agent and scope.",
  );
  assert.equal(c.told(1).length, before, "a kind marked noise for that agent and scope is not told again");
  await refused(guard, "pass", { candidate: "o9", reason: "nothing" }, /no candidate o9 waiting on you/);
  await refused(
    maker,
    "attend",
    { actor: "a2", moment: "x", why: "y", urgency: "now" },
    /only a role that watches attends/,
  );

  c.paseo.pending.set(c.paseo.created[2]!.host, new Set(["r1"]));
  await c.plugin.permissionAsked(c.paseo.created[2]!.host, "r1", "git push origin main");
  await c.plugin.idle();
  assert.match(c.told(1).at(-1) ?? "", /^a3 asks leave \(permission p1\): git push origin main$/);
  await refused(
    maker,
    "answer_permission",
    { permission: "p1", allow: true, reason: "mine" },
    /only a2 or the Human answers a3's permission/,
  );
  await did(c, keeper, "answer_permission", { permission: "p1", allow: false, reason: "never push" });
  assert.deepEqual(c.paseo.responded, ["r1"], "the answer reaches the agent's own prompt");

  await did(c, maker, "hold_machine", { hold: true, why: "measuring" });
  await refused(keeper, "hold_machine", { hold: true, why: "me too" }, /the machine is held by a3/);
  await refused(keeper, "hold_machine", { hold: false, why: "stop" }, /only it or the Human releases it/);
  await did(c, maker, "hold_machine", { hold: false, why: "done" });

  await did(c, maker, "hold_machine", { hold: true, why: "measuring again" });
  const base = git(c.repo, "rev-parse", "main");
  await did(c, keeper, "run_checks", { scope: "1.1", commit: base, steps: [{ name: "t", run: ["true"] }] });
  const held = await status(keeper, "1.1");
  assert.match(held, /^The machine is held by a3, measuring: checks and new copies wait until it is let go\.$/m);
  assert.doesNotMatch(held, /Evidence:/, "a check asked for while the machine is held waits");
  await did(c, keeper, "release", { actor: "a3", reason: "its measuring is over" });
  const freed = await status(keeper, "1.1");
  assert.match(
    freed,
    /Evidence:\n- e1 check by a2 on/,
    "a holder that leaves its seat lets the machine go, and the check runs",
  );
  assert.doesNotMatch(freed, /The machine is held/);
  for (const t of [chief, keeper, maker, guard]) t.close();
});

test("a commit named by an abbreviation is that commit: handed back, checked, read, integrated and published as one", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "maker", paths: ["src/"], brief: brief("Make a") });
  const maker = await c.tools(1);
  const copy = c.paseo.created[1]!.cwd;
  mkdirSync(join(copy, "src/a"), { recursive: true });
  writeFileSync(join(copy, "src/a/done.txt"), "done\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "done");
  const head = git(copy, "rev-parse", "HEAD");
  const short = head.slice(0, 9);

  await did(c, maker, "hand_back", { commit: short, text: "all of it" });
  assert.match(await status(chief, "1"), new RegExp(`candidate ${head}$`, "m"), "the candidate is by its whole name");
  await did(c, maker, "run_checks", { scope: "1", commit: short, steps: [{ name: "t", run: ["true"] }] });
  await did(c, chief, "open_scope", { parent: "root", role: "reader", commit: short, brief: brief("Read it") });
  await did(c, await c.tools(2), "record_verdict", { ok: true, text: "it is one word, as asked" });
  await did(c, chief, "drop_scope", { scope: "2", reason: "its verdict is in" });
  await did(c, chief, "integrate", { scope: "1", evidence: ["e1", "e2"] });
  assert.equal(git(c.repo, "rev-parse", "main"), head, "evidence on the abbreviation is evidence on the commit");
  await did(c, chief, "publish", { remote: "origin" });
  assert.equal(git(c.remote, "rev-parse", "main"), head, "and the publish finds the head the record has");
  chief.close();
});

test("a publish the remote or a moved base refuses wakes the root's owner with why", async () => {
  const c = await started();
  const chief = await c.tools(0);
  writeFileSync(join(c.repo, "theirs.txt"), "the Human's\n");
  git(c.repo, "add", ".");
  git(c.repo, "commit", "-q", "-m", "the Human's own commit");
  await did(c, chief, "publish", { remote: "origin" });
  assert.equal(c.told(0).at(-1), "Publishing main to origin was refused: main moved since the publish was asked");
  await did(c, chief, "publish", { remote: "origin" });
  assert.equal(git(c.remote, "rev-parse", "main"), git(c.repo, "rev-parse", "main"), "asked again, it finds the tip");
  chief.close();
});

test("with no check set, a hand-back is given no evidence: a run of nothing is nothing to integrate on", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "maker", paths: ["src/"], brief: brief("Make a") });
  const maker = await c.tools(1);
  const copy = c.paseo.created[1]!.cwd;
  mkdirSync(join(copy, "src/a"), { recursive: true });
  writeFileSync(join(copy, "src/a/done.txt"), "done\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "done");
  const head = git(copy, "rev-parse", "HEAD");

  await did(c, maker, "hand_back", { commit: head, text: "all of it" });
  assert.equal(
    c.told(0).at(-1),
    `Scope 1 handed back ${head}: all of it\nNo check is set for the project: nothing is run on it.`,
    "whoever takes it in reads that no result is on its way",
  );
  const handed = await status(chief, "1");
  assert.match(
    handed,
    /^Handed back: .* · candidate [0-9a-f]{40}\nNo check is set for the project: nothing was run on it\.$/m,
  );
  assert.doesNotMatch(handed, /Evidence:/, "nothing ran, so nothing is evidence");
  await refused(chief, "integrate", { scope: "1", evidence: ["e1"] }, /no evidence e1/);
  await refused(
    chief,
    "run_checks",
    { scope: "1", commit: head },
    /the project has no checks set, and none were named/,
  );

  await did(c, chief, "run_checks", {
    scope: "1",
    commit: head,
    steps: [{ name: "there", run: ["test", "-f", "src/a/done.txt"] }],
  });
  const ran = new RegExp(`- (e\\d+) check by a1 on ${head}: ok · 1 check passed`).exec(await status(chief, "1"))?.[1];
  assert.ok(ran, "a check the owner above names is evidence");
  await did(c, chief, "integrate", { scope: "1", evidence: [ran] });
  assert.equal(git(c.repo, "rev-parse", "main"), head);
  for (const t of [chief, maker]) t.close();
});

test("an integration that could not be made is told to whoever asked: over a base the Human is editing its candidate stands, over one that moved another is made", async () => {
  const c = await started();
  const chief = await c.tools(0);
  const heads: string[] = [];
  for (const dir of ["a", "b"]) {
    await did(c, chief, "open_scope", { parent: "root", role: "maker", paths: [`src/${dir}/`], brief: brief(dir) });
    const copy = c.paseo.created.at(-1)!.cwd;
    mkdirSync(join(copy, "src", dir), { recursive: true });
    writeFileSync(join(copy, "src", dir, "x.txt"), `${dir}\n`);
    git(copy, "add", ".");
    git(copy, "commit", "-q", "-m", dir);
    heads.push(git(copy, "rev-parse", "HEAD"));
  }
  const step = [{ name: "t", run: ["true"] }];
  for (const [n, head] of heads.entries()) {
    await did(c, await c.tools(n + 1), "hand_back", { commit: head, text: `the work of ${n + 1}` });
    await did(c, chief, "run_checks", { scope: `${n + 1}`, commit: head, steps: step });
  }

  writeFileSync(join(c.repo, "check.sh"), "the Human is editing this\n");
  await did(c, chief, "integrate", { scope: "1", evidence: ["e1"] });
  assert.equal(
    c.told(0).at(-1),
    `Scope 1 was not integrated: main is checked out with uncommitted changes. Its candidate ${heads[0]} stands.`,
  );
  git(c.repo, "checkout", "check.sh");
  await did(c, chief, "integrate", { scope: "1", evidence: ["e1"] });
  assert.equal(git(c.repo, "rev-parse", "main"), heads[0], "the same integrate is taken once the base is clean");

  await did(c, chief, "integrate", { scope: "2", evidence: ["e2"] });
  assert.match(
    c.told(0).at(-1) ?? "",
    /^Scope 2 was not integrated: its parent's branch moved after its candidate was made\. A candidate on the new head is being made\.$/,
    "whoever asked is told, and woken: nothing else would say the scope is still not in",
  );
  const candidate = /candidate ([0-9a-f]{40})/.exec(await status(chief, "2"))?.[1];
  assert.ok(candidate && candidate !== heads[1], "the candidate is another commit now, with the new head taken in");
  await refused(chief, "integrate", { scope: "2", evidence: ["e2"] }, new RegExp(`evidence e2 is on ${heads[1]}`));
  await did(c, chief, "run_checks", { scope: "2", commit: candidate, steps: step });
  await did(c, chief, "integrate", { scope: "2", evidence: ["e3"] });
  assert.equal(git(c.repo, "rev-parse", "main"), candidate);
  chief.close();
});

test("a scope whose copy could not be made says so, and a reseat asks for the copy again", async () => {
  const c = await started();
  const chief = await c.tools(0);
  const elsewhere = mkdtempSync(join(tmpdir(), "sw-elsewhere-"));
  git(elsewhere, "clone", "-q", c.repo, ".");
  writeFileSync(join(elsewhere, "late.txt"), "late\n");
  git(elsewhere, "add", ".");
  git(elsewhere, "commit", "-q", "-m", "late");
  const late = git(elsewhere, "rev-parse", "HEAD");

  await did(c, chief, "open_scope", { parent: "root", role: "reader", commit: late, brief: brief("Read it") });
  assert.match(c.told(0).at(-1) ?? "", /^The copy for scope 1 could not be made: /, "the owner above is told");
  assert.equal(c.paseo.created.length, 1, "with no copy there is no agent");
  assert.match(await status(chief, "1"), /^Its copy could not be made: no agent works in it\.$/m);
  assert.match(await status(chief), /^- 1 open · a2 \(reader\) · no copy$/m);

  git(c.repo, "fetch", "-q", elsewhere, "main");
  await did(c, chief, "reseat", { scope: "1", reason: "the commit is in the repository now" });
  assert.equal(c.paseo.created.at(-1)?.title, "1 · reader", "the copy is made this time, and its agent with it");
  assert.doesNotMatch(await status(chief, "1"), /could not be made/);
  chief.close();
});

test("the edge tools: a wait changed before a scope starts, a scope that must tell another of what changes in it, and one given leave to change another's brief", async () => {
  const c = await started();
  const chief = await c.tools(0);
  await did(c, chief, "open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief: brief("Lane") });
  const keeper = await c.tools(1);
  const task = (dir: string, more: Record<string, unknown> = {}) => ({
    parent: "1",
    role: "maker",
    paths: [`src/${dir}/`],
    brief: brief(dir),
    ...more,
  });
  await did(c, keeper, "open_scope", task("a"));
  await did(c, keeper, "open_scope", task("b"));
  await did(c, keeper, "open_scope", task("c", { after: ["1.1"] }));
  await did(c, keeper, "open_scope", task("d", { after: ["1.3"] }));
  const makerA = await c.tools(2);
  const makerB = await c.tools(3);
  const agents = () => c.paseo.created.map((agent) => agent.title);
  assert.deepEqual(agents().slice(2), ["1.1 · maker", "1.2 · maker"], "the two that wait have no agent");

  const edge = (scope: string, kind: string, target: string, reason = "so") => ({ scope, edge: kind, target, reason });
  await refused(
    keeper,
    "add_edge",
    edge("1.2", "after", "1.1"),
    /scope 1\.2 has started: a wait is added before a scope starts/,
  );
  await did(c, keeper, "add_edge", edge("1.3", "after", "1.2", "c reads what b writes"));
  assert.match(await status(keeper, "1.3"), /^Waits for: 1\.1, 1\.2$/m);
  await refused(keeper, "add_edge", edge("1.3", "after", "1.4"), /^Refused \(I3\): scope 1\.\d would wait for itself/);
  await did(c, keeper, "remove_edge", edge("1.3", "after", "1.1"));
  assert.equal(agents().length, 4, "it still waits for the other");
  await did(c, keeper, "remove_edge", edge("1.3", "after", "1.2"));
  assert.equal(agents().at(-1), "1.3 · maker", "with its last wait gone it starts: no other event would start it");

  await did(c, keeper, "add_edge", edge("1.1", "mustTell", "1.2", "b builds on a's shape"));
  assert.match(await status(keeper, "1.1"), /^Must tell: 1\.2$/m);
  assert.match(await status(makerB), /^Is told of what changes in: 1\.1$/m);
  await did(c, keeper, "amend_brief", {
    scope: "1.1",
    set: { constraints: [{ text: "Keep it int16" }] },
    reason: "the wire is int16",
  });
  assert.match(
    c.told(3).at(-1) ?? "",
    /^Scope 1\.1 must tell scope 1\.2: its brief is now version 2 \(the wire is int16\)$/,
  );
  const copy = c.paseo.created[2]!.cwd;
  mkdirSync(join(copy, "src/a"), { recursive: true });
  writeFileSync(join(copy, "src/a/shape.txt"), "int16\n");
  git(copy, "add", ".");
  git(copy, "commit", "-q", "-m", "shape");
  const head = git(copy, "rev-parse", "HEAD");
  await did(c, makerA, "hand_back", { commit: head, text: "the shape is int16" });
  assert.match(
    c.told(3).at(-1) ?? "",
    new RegExp(`^Scope 1\\.1 must tell scope 1\\.2: it handed back ${head}: the shape is int16$`),
  );

  const reword = { scope: "1.2", set: { choices: [{ text: "Read int16" }] }, reason: "the shape is int16" };
  await refused(makerA, "amend_brief", reword, /^Refused \(I5\)/);
  await refused(
    makerA,
    "add_edge",
    edge("1.1", "mayChange", "1.2"),
    /only the owner of scope 1\.2's parent \(a2\) may do this/,
  );
  await did(c, keeper, "add_edge", edge("1.1", "mayChange", "1.2", "a settles the shape b reads"));
  assert.match(await status(makerA), /^May change the brief of: 1\.2$/m);
  assert.match(await status(makerB), /^Its brief may also be amended by the owner of: 1\.1$/m);
  await did(c, makerA, "amend_brief", reword);
  assert.match(await status(makerB), /Brief v2 \(verification\)[^]*Chosen so far[^]*Read int16/);
  assert.match(c.told(3).at(-1) ?? "", /^Your brief is now version 2/, "the agent whose brief it is reads it changed");
  assert.match(
    c.told(1).at(-1) ?? "",
    /Scope 1\.2's brief is now version 2, amended by a3 from scope 1\.1, which may change it: the shape is int16$/,
    "and so does the owner above it, who takes its work in",
  );
  await did(c, keeper, "remove_edge", edge("1.1", "mayChange", "1.2", "the shape is settled"));
  await refused(makerA, "amend_brief", reword, /^Refused \(I5\)/);

  await did(c, keeper, "drop_scope", { scope: "1.1", reason: "a is done another way" });
  assert.match(c.told(3).at(-1) ?? "", /^Scope 1\.1 must tell scope 1\.2: it was dropped: a is done another way$/);
  for (const t of [chief, keeper, makerA, makerB]) t.close();
});
