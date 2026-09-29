import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Reflex } from "../../server/bridge/reflex.ts";
import type { TurnItem } from "../../server/satellites/agent-host/items.ts";
import { loadReflex } from "../../server/satellites/reflex/config.ts";
import type { Jev } from "../../server/satellites/reflex/jev.ts";
import { SHA, team } from "../kernel/ledger.ts";

const config = loadReflex(join(import.meta.dirname, "../../profile/slp"))!;

/** Jev answering every question it is asked with the probability the test names. */
function fakeJev(p: number) {
  const asked: string[][] = [];
  const jev = {
    ask: (_state: Record<string, string>, questions: Record<string, { labels?: Record<string, string> }>) => {
      asked.push(Object.keys(questions));
      const answers = Object.fromEntries(
        Object.entries(questions).map(([name, q]) => {
          const labels = Object.keys(q.labels ?? {});
          return [
            name,
            labels.length
              ? {
                  type: "choice",
                  choice: labels[0],
                  confidence: p,
                  probabilities: Object.fromEntries(
                    labels.map((l, i) => [l, i === 0 ? p : (1 - p) / (labels.length - 1)]),
                  ),
                }
              : { type: "noul", noul: p },
          ];
        }),
      );
      return Promise.resolve({ ok: true as const, model: "jev-1.13.0", answers, tokens: 100 });
    },
  } as unknown as Jev;
  return { jev, asked };
}

function wired(p: number | null) {
  const t = team();
  const alarms: (string | null)[] = [];
  const fake = p === null ? null : fakeJev(p);
  const reflex = new Reflex(
    config,
    () => fake?.jev ?? null,
    (_project, body) => {
      t.ledger.must(t.ledger.fact(body.type, body));
      return Promise.resolve();
    },
    (text) => alarms.push(text),
  );
  return { ...t, reflex, alarms, asked: fake?.asked ?? [] };
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

test("a failing check is read as environment or code, and shown to the Lead as judgement evidence with its probability", async () => {
  const { ledger, reflex, lane } = wired(0.87);
  const events = ledger.must(
    ledger.fact("record_evidence", {
      scope: lane,
      subject: SHA(2),
      ok: false,
      summary: "EADDRINUSE? no: TypeError x is undefined",
      steps: [],
      heldMachine: false,
    }),
  );
  reflex.onEvents("p", events, ledger.state);
  await settle();
  const judged = [...ledger.state.evidence.values()].filter((e) => e.kind === "judgement");
  assert.equal(judged.length, 1);
  assert.match(judged[0]!.summary, /red-check: environment \(0\.87\)/);
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
  let events = ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokens: 10, usd: 30 }));
  reflex.onEvents("p", events, ledger.state);
  events = ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokens: 10, usd: 30 }));
  reflex.onEvents("p", events, ledger.state);
  events = ledger.must(ledger.fact("record_turn", { actor: peer, outcome: "done", tokens: 10, usd: 30 }));
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
