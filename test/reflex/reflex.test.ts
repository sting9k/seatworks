import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import type { Delivery } from "../../server/bridge/dispatcher.ts";
import { type Wiring, handlersFor } from "../../server/bridge/effects.ts";
import { Project } from "../../server/bridge/project.ts";
import { Reflex } from "../../server/bridge/reflex.ts";
import type { PaseoHost } from "../../server/satellites/agent-host/host.ts";
import type { TurnItem } from "../../server/satellites/agent-host/items.ts";
import { loadReflex } from "../../server/satellites/reflex/config.ts";
import type { Jev } from "../../server/satellites/reflex/jev.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { type Caller, type CommandBody, parseBody } from "../../shared/contracts/commands.ts";
import { SHA, TEAM_STEPS, brief, plan, slpProfile, team } from "../kernel/ledger.ts";

const config = loadReflex(join(import.meta.dirname, "../../templates/slp"), {
  reflex: "reflex.yaml",
  watch: "watch.yaml",
})!;

/** Jev answering every question it is asked with the probability the test names, or only those `sure` picks. */
function fakeJev(p: number, sure: (name: string, state: Record<string, string>) => boolean = () => true) {
  const asked: string[][] = [];
  const read: Record<string, string>[] = [];
  const jev = {
    ask: (state: Record<string, string>, questions: Record<string, { labels?: Record<string, string> }>) => {
      asked.push(Object.keys(questions));
      read.push(state);
      const answers = Object.fromEntries(
        Object.entries(questions).map(([name, q]) => {
          const labels = Object.keys(q.labels ?? {});
          const yes = sure(name, state) ? p : 0.05;
          return [
            name,
            labels.length
              ? {
                  type: "choice",
                  choice: labels[0],
                  confidence: yes,
                  probabilities: Object.fromEntries(
                    labels.map((l, i) => [l, i === 0 ? yes : (1 - yes) / (labels.length - 1)]),
                  ),
                }
              : { type: "noul", noul: yes },
          ];
        }),
      );
      return Promise.resolve({ ok: true as const, model: "jev-1.13.0", answers, tokens: 100 });
    },
  } as unknown as Jev;
  return { jev, asked, read };
}

const settledNames = new Set(["addPoints", "User"]);

function wired(p: number | null) {
  const t = team();
  const alarms: (string | null)[] = [];
  const fake = p === null ? null : fakeJev(p);
  const observed: { question: string; answer: string }[] = [];
  const reflex = new Reflex(
    config,
    () => fake?.jev ?? null,
    (_project, body) => {
      observed.push(body);
      t.ledger.must(t.ledger.fact(body.type, body));
      return Promise.resolve();
    },
    (text) => alarms.push(text),
    {
      settled: (_project, _actor, names) => Promise.resolve(new Set(names.filter((n) => settledNames.has(n)))),
      diffs: () =>
        Promise.resolve([
          { path: "test/points.test.ts", text: "+++ b/test/points.test.ts\n+  expect(user.points).toBe(5);" },
          { path: "src/points.ts", text: "+++ b/src/points.ts\n@@ -1 +1 @@\n+export const points = () => 5;" },
        ]),
    },
  );
  return { ...t, reflex, alarms, observed, asked: fake?.asked ?? [], read: fake?.read ?? [] };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const thought = (text: string): TurnItem => ({ kind: "thought", text, failed: null, signature: null, path: null });
const failing = (call: string): TurnItem => ({
  kind: "ran",
  text: call,
  failed: "Error: port 3000 in use",
  signature: `${call} => port in use`,
  path: null,
});

test("a failing check is read as environment or code as a fact for the Lead, never as passing evidence on a red commit", async () => {
  const { ledger, reflex, lane, observed } = wired(0.1);
  const events = ledger.must(
    ledger.fact("record_evidence", {
      scope: lane,
      subject: SHA(2),
      ok: false,
      summary: "TypeError x is undefined",
      steps: [],
      heldMachine: false,
    }),
  );
  reflex.onEvents("p", events, ledger.state);
  await settle();
  assert.ok(
    observed.some((o) => o.question === "red-check"),
    "the answer is on the record",
  );
  assert.deepEqual(
    [...ledger.state.evidence.values()].filter((e) => e.kind === "judgement"),
    [],
    "a check that failed on the code never gains a passing judgement beside it",
  );
});

test("a moment in a Peer's thinking, past a threshold not yet earned, is a candidate for the Watcher and nothing more", async () => {
  const { ledger, reflex, supervisor, peer, asked } = wired(0.95);
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  reflex.onTurn("p", peer, [thought("I'll send the direction as int8 to save bandwidth")], ledger.state);
  await settle();
  assert.ok(asked.some((names) => names.includes("trades-the-goal")));
  assert.equal(ledger.state.attentions.size, 0);
  assert.ok([...ledger.state.obligations.values()].some((o) => o.owedBy === "a4" && o.about.kind === "candidate"));
});

test("the same failing call a third time is a candidate, a fifth an attention to the Lead, with no model asked", async () => {
  const { ledger, reflex, supervisor, lead, peer, asked } = wired(0.1);
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  for (let i = 0; i < 3; i++) reflex.onTurn("p", peer, [failing("npm test")], ledger.state);
  await settle();
  assert.ok([...ledger.state.obligations.values()].some((o) => o.about.kind === "candidate"));
  for (let i = 0; i < 2; i++) reflex.onTurn("p", peer, [failing("npm test")], ledger.state);
  await settle();
  const attention = [...ledger.state.attentions.values()].find((t) => t.moment === "going-in-circles");
  assert.equal(attention?.to, lead);
  assert.ok(asked.every((names) => !names.includes("going-in-circles")));
});

test("a lane whose spend crosses its appetite is told to the Supervisor once, as it crosses", async () => {
  const { ledger, reflex, supervisor, peer } = wired(0.1);
  let events = ledger.must(
    ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 10, usdSoFar: 30, seen: 0 }),
  );
  reflex.onEvents("p", events, ledger.state);
  events = ledger.must(
    ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 10, usdSoFar: 60, seen: 0 }),
  );
  reflex.onEvents("p", events, ledger.state);
  events = ledger.must(
    ledger.fact("record_turn", { actor: peer, outcome: "done", tokensSoFar: 10, usdSoFar: 90, seen: 0 }),
  );
  reflex.onEvents("p", events, ledger.state);
  await settle();
  const told = [...ledger.state.attentions.values()].filter((t) => t.moment === "past-appetite");
  assert.equal(told.length, 1);
  assert.equal(told[0]?.to, supervisor);
});

test("with no key the reflex asks nothing and raises one standing alarm; the team goes on", async () => {
  const { ledger, reflex, peer, alarms } = wired(null);
  reflex.onTurn("p", peer, [thought("I'm not sure what 'direction' means here")], ledger.state);
  await settle();
  assert.equal(ledger.state.attentions.size, 0);
  assert.match(alarms.at(-1) ?? "", /no key/);
  assert.equal(
    ledger.must(ledger.as(peer, "raise_finding", { text: "unclear term", default: "guess" })).length > 0,
    true,
  );
});

const edit = (path: string, diff: string): TurnItem => ({
  kind: "edit",
  text: diff,
  failed: null,
  signature: null,
  path,
});
const said = (text: string): TurnItem => ({ kind: "said", text, failed: null, signature: null, path: null });

test("a candidate is given to the Watcher with the item and two either side, the facts counted, the scope's brief and what came of each earlier attention on that agent; one already answered is not sent", async () => {
  const store = new ProjectStore(":memory:");
  const project = Project.open("p", store, slpProfile());
  let n = 0;
  const submit = async (caller: Caller, body: CommandBody) => {
    const at = new Date(Date.UTC(2026, 8, 29, 0, 0, ++n)).toISOString();
    const done = await project.submit({ id: `c${n}`, at, caller, body });
    assert.ok(done.ok, done.ok ? "" : done.refused.says);
  };
  const send = (caller: Caller, type: string, args: Record<string, unknown>) => {
    const parsed = parseBody(type, args);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.says);
    return submit(caller, parsed.body);
  };
  const bridge: Caller = { kind: "bridge" };
  for (const [caller, type, args] of TEAM_STEPS) await send(caller, type, args);
  await send({ kind: "agent", actor: "a1" }, "open_scope", { parent: "root", role: "watcher", over: "all" });
  await send(bridge, "record_agent", { actor: "a4", host: "h-watcher" });
  // An earlier attention about the Peer, which its Lead said needs nothing.
  await send(bridge, "record_observation", {
    question: "struggling",
    actor: "a3",
    scope: "1.1",
    source: "code",
    answer: "unsure",
    level: "tell",
    route: { kind: "attention", why: "unsure what a direction is", urgency: "later" },
  });
  const earlier = [...project.view.attentions.keys()][0]!;
  await send({ kind: "agent", actor: "a2" }, "acknowledge", { attention: earlier });

  const { jev } = fakeJev(
    0.95,
    (name, state) => name === "trades-the-goal" && /to save bandwidth/.test(state.text ?? ""),
  );
  const reflex = new Reflex(
    config,
    () => jev,
    (_project, body) => submit(bridge, body),
    () => undefined,
    { settled: () => Promise.resolve(new Set()), diffs: () => Promise.resolve([]) },
  );
  for (let i = 0; i < 2; i++) reflex.onTurn("p", "a3", [failing("npm test")], project.view);
  reflex.onTurn(
    "p",
    "a3",
    [
      said("Three items before it: not shown."),
      thought("The goal names aim precision on mobile."),
      said("Reading encode.ts."),
      thought("I'll send the direction as int8 to save bandwidth"),
      edit("src/net/encode.ts", "+const dir = toInt8(angle);"),
      said("Encoded as int8."),
      said("Three items after it: not shown."),
    ],
    project.view,
  );
  await settle();

  const sent: string[] = [];
  const host = {
    send: (_host: string, text: string) => {
      sent.push(text);
      return Promise.resolve("sent" as const);
    },
  } as unknown as PaseoHost;
  const { deliver } = handlersFor({ host, recorded: (scope: string) => store.about(scope) } as unknown as Wiring);
  const queued = () =>
    store
      .pending()
      .flatMap((e) => (e.body.kind === "deliver" && e.body.to === "a4" ? [e.body] : [])) satisfies Delivery[];
  assert.equal((await deliver(queued(), { project: "p", state: project.view, key: "k1" })).status, "done");
  const text = sent[0] ?? "";
  const candidate = /^CANDIDATE (v\d+) · trades-the-goal · 0\.95 · a3 \(peer, scope 1\.1\)$/m.exec(text)?.[1];
  assert.ok(candidate, text);
  assert.match(
    text,
    /before: thought: The goal names aim precision on mobile\.\nbefore: said: Reading encode\.ts\.\nitem: thought: I'll send the direction as int8 to save bandwidth\nafter: edit src\/net\/encode\.ts: \+const dir = toInt8\(angle\);\nafter: said: Encoded as int8\./,
  );
  assert.doesNotMatch(text, /not shown/, "only two items either side");
  assert.match(text, /^facts: the same call failed the same way 2 times$/m);
  assert.match(text, /^Goal: \[l\d+\] Encode directions$/m, "the scope's brief");
  assert.match(text, /^- \[l\d+\] int16 precision$/m);
  assert.match(
    text,
    new RegExp(`^earlier about a3: ${earlier} \\(struggling\\) to a2: acknowledged by a2$`, "m"),
    "what came of the earlier attention",
  );
  assert.match(text, new RegExp(`\`attend\` or \`pass\` it with candidate ${candidate}\\.`));

  await send({ kind: "agent", actor: "a4" }, "pass", { candidate, reason: "the brief allows int8 here" });
  assert.equal(
    (await deliver(queued(), { project: "p", state: project.view, key: "k2" })).status,
    "dropped",
    "a candidate already passed has nothing left to say",
  );
  project.dispose();
});

test("a test that calls only settled names asks nothing; one that invents a field asks whether it uses or fakes it", async () => {
  const settledOnly = wired(0.95);
  settledOnly.reflex.onTurn(
    "p",
    settledOnly.peer,
    [edit("test/points.test.ts", "+  const u = new User();\n+  addPoints(u, 5);")],
    settledOnly.ledger.state,
  );
  await settle();
  assert.ok(!settledOnly.asked.some((names) => names.some((n) => n.startsWith("mints-an-api"))));

  const minting = wired(0.95);
  minting.reflex.onTurn(
    "p",
    minting.peer,
    [edit("test/points.test.ts", "+  const u = new User();\n+  expect(u.points).toBe(5);")],
    minting.ledger.state,
  );
  await settle();
  const asked = minting.asked.find((names) => names.includes("mints-an-api.uses"));
  assert.deepEqual(asked?.sort(), ["mints-an-api.fakes", "mints-an-api.uses"]);

  const product = wired(0.95);
  product.reflex.onTurn("p", product.peer, [edit("src/points.ts", "+  u.points += 5;")], product.ledger.state);
  await settle();
  assert.ok(
    !product.asked.some((names) => names.some((n) => n.startsWith("mints-an-api"))),
    "only edits to tests are read",
  );
});

test("a hand-back whose tests use a name nobody settled carries judgement evidence on its commit for the Lead", async () => {
  const { ledger, reflex, peer } = wired(0.92);
  const events = ledger.must(ledger.as(peer, "hand_back", { commit: SHA(7), text: "points" }));
  reflex.onEvents("p", events, ledger.state);
  await settle();
  const judged = [...ledger.state.evidence.values()].filter(
    (e) => e.kind === "judgement" && e.subject === SHA(7) && e.summary.startsWith("mints-an-api"),
  );
  assert.deepEqual(judged.map((e) => e.summary.split(":")[0]).sort(), ["mints-an-api.fakes", "mints-an-api.uses"]);
  assert.ok(judged.every((e) => !e.ok));
});

test("what looks like a secret in an agent's words is masked in what the record keeps", async () => {
  const { ledger, reflex, supervisor, peer } = wired(0.1);
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  for (let i = 0; i < 5; i++)
    reflex.onTurn("p", peer, [failing("curl -H 'Authorization: sk-abcdefghijklmnopqrstuvwxyz0123'")], ledger.state);
  await settle();
  const attention = [...ledger.state.attentions.values()].find((t) => t.moment === "going-in-circles");
  assert.ok(attention);
  assert.ok(!attention.why.includes("sk-abcdefghij"), attention.why);
});

test("each use in REFLEX.md's table is asked on its own event, and only there", async () => {
  const { ledger, reflex, supervisor, lead, peer, lane, asked, read } = wired(0.1);
  const on = async (events: Parameters<typeof reflex.onEvents>[1]) => {
    const from = asked.length;
    reflex.onEvents("p", events, ledger.state);
    await settle();
    return asked.slice(from).flat().sort();
  };
  ledger.must(ledger.as(supervisor, "set_plan", { scope: "root", plan: plan("Ship the game's net layer", 100) }));
  const opened = ledger.must(
    ledger.as(lead, "open_scope", {
      parent: lane,
      role: "peer",
      paths: ["src/ui/"],
      brief: brief("Find why clients drift"),
    }),
  );
  assert.deepEqual(await on(opened), [
    "asks-interim-state",
    "cause-as-fact",
    "closed-options",
    "names-method",
    "reads-as-kind",
    "unobservable-goal",
  ]);
  const settled = ledger.must(
    ledger.as(lead, "open_scope", {
      parent: lane,
      role: "peer",
      paths: ["src/store/"],
      brief: brief("Add the retry button the design shows", { kind: "verification" }),
    }),
  );
  assert.deepEqual(
    await on(settled),
    ["asks-interim-state", "cause-as-fact", "dictates-inside", "reads-as-kind", "unobservable-goal"],
    "a brief to a settled contract is asked how it frames the inside, not whether it names a method",
  );
  const raised = ledger.must(ledger.as(peer, "raise_finding", { text: "int16 is too slow", default: "int8" }));
  assert.deepEqual(await on(raised), ["touches-goal-or-cost"]);
  const finding = [...ledger.state.findings.keys()].at(-1)!;
  assert.deepEqual(
    await on(ledger.must(ledger.as(lead, "classify_finding", { finding, verdict: "minor", reason: "keep it" }))),
    ["kept-without-answer"],
  );
  const reported = { open: ["Who owns the cache"], decided: ["Sessions live in the gateway"] };
  assert.deepEqual(await on(ledger.must(ledger.as(lead, "report", reported))), ["unrecorded-structure"]);
  assert.equal(
    read.at(-1)?.report,
    "decided:\n- Sessions live in the gateway\nopen:\n- Who owns the cache",
    "a report is read whole, each section under its name",
  );
  assert.deepEqual(await on(ledger.must(ledger.as(peer, "hand_back", { commit: SHA(9), text: "done" }))), [
    "bends-product",
    "claim-gap",
    "leaves-stand-in",
    "loosens-assertion",
    "mints-an-api.fakes",
    "mints-an-api.uses",
  ]);
  assert.deepEqual(
    await on(ledger.must(ledger.fact("record_permission", { actor: peer, request: "r1", text: "git push origin" }))),
    ["cannot-be-undone"],
  );
  assert.deepEqual(await on(ledger.must(ledger.human("send_message", { to: peer, text: "Use int8 after all" }))), [
    "human-words",
  ]);
  assert.deepEqual(await on(ledger.must(ledger.as(supervisor, "send_message", { to: lead, text: "status?" }))), []);
});

test("a brief read as the other kind is weighed on that kind, not on the label listed first", async () => {
  const { ledger, reflex, lead, lane, observed } = wired(0.95);
  const events = ledger.must(
    ledger.as(lead, "open_scope", {
      parent: lane,
      role: "peer",
      paths: ["src/ui/"],
      brief: brief("Add the retry button the design shows", { kind: "verification" }),
    }),
  );
  reflex.onEvents("p", events, ledger.state);
  await settle();
  const read = observed.find((o) => o.question === "reads-as-kind");
  assert.equal(read?.answer, "verification (0.05)");
});

test("a turn that ends in words with no command is asked what its last words do; one with a command is not", async () => {
  const { ledger, reflex, lead, peer, asked } = wired(0.1);
  const said = (text: string): TurnItem => ({ kind: "said", text, failed: null, signature: null, path: null });
  reflex.onTurn("p", peer, [said("Done: the encoder is in, ready for review.")], ledger.state);
  await settle();
  assert.ok(asked.flat().includes("words-only"));
  const from = asked.length;
  reflex.onEvents("p", ledger.must(ledger.as(peer, "send_message", { to: lead, text: "ready" })), ledger.state);
  reflex.onTurn("p", peer, [said("Sent it.")], ledger.state);
  await settle();
  assert.ok(!asked.slice(from).flat().includes("words-only"));
});

test("turns that spend and record nothing, a finding left unclassified, and a changed assertion reach the owner above", async () => {
  const { ledger, reflex, supervisor, lead, peer } = wired(0.1);
  const turn = (actor: string, usdSoFar: number) => {
    reflex.onEvents(
      "p",
      ledger.must(ledger.fact("record_turn", { actor, outcome: "done", tokensSoFar: 10, usdSoFar, seen: 0 })),
      ledger.state,
    );
  };
  for (let i = 1; i <= 3; i++) turn(peer, i);
  reflex.onEvents(
    "p",
    ledger.must(
      ledger.as(peer, "raise_finding", { text: "the brief contradicts the codec", default: "follow the codec" }),
    ),
    ledger.state,
  );
  turn(lead, 1);
  turn(lead, 2);
  reflex.onTurn(
    "p",
    peer,
    [
      {
        kind: "edit",
        text: "--- a/src/net/encode.test.ts\n+++ b/src/net/encode.test.ts\n-  expect(dir).toBe(16);\n+  expect(dir).toBe(8);",
        failed: null,
        signature: null,
        path: "src/net/encode.test.ts",
      },
    ],
    ledger.state,
  );
  await settle();
  const told = [...ledger.state.attentions.values()].map((t) => `${t.moment} → ${t.to}`).sort();
  assert.deepEqual(told, [
    `check-made-to-pass → ${lead}`,
    `findings-waiting → ${supervisor}`,
    `silent-without-progress → ${lead}`,
  ]);
});

test("a Watcher is woken by a sweep once its agents' new work passes the size the profile names, never by a clock", async () => {
  const { ledger, reflex, supervisor, peer } = wired(0.1);
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  const watcher = [...ledger.state.actors.values()].find((a) => a.role === "watcher")!.id;
  const sweeps = () =>
    [...ledger.state.messages.values()].filter((m) => m.to === watcher && m.wakes && m.text.startsWith("A sweep"));
  const work = (n: number) => thought(`step ${n}: ${"x".repeat(1400)}`);
  for (let i = 0; i < 10; i++) reflex.onTurn("p", peer, [work(i)], ledger.state);
  await settle();
  assert.equal(sweeps().length, 0);
  for (let i = 10; i < 30; i++) reflex.onTurn("p", peer, [work(i)], ledger.state);
  await settle();
  assert.equal(sweeps().length, 1);
  assert.match(sweeps()[0]!.text, new RegExp(`${peer} \\(peer, scope 1\\.1\\): \\d+ items`));
  assert.ok(sweeps()[0]!.text.length <= 18_000);
});

test("what the watch counted and the record did not take is said in the log, and nothing is thrown for it", async () => {
  const { ledger, peer } = team();
  const said: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = (text: string) => said.push(text) > 0;
  try {
    const reflex = new Reflex(
      config,
      () => null,
      () => Promise.reject(new Error("the log is at 9, not 8")),
      () => undefined,
      { settled: () => Promise.resolve(new Set()), diffs: () => Promise.resolve([]) },
    );
    for (let i = 0; i < 3; i++) reflex.onTurn("p", peer, [failing("npm test")], ledger.state);
    await settle();
  } finally {
    process.stderr.write = write;
  }
  assert.match(
    said.join(""),
    /project p: what the watch saw of going-in-circles could not be recorded: .*the log is at 9/,
  );
});
