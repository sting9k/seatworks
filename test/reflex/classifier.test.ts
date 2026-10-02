import assert from "node:assert/strict";
import { test } from "node:test";
import { Classifier } from "../../server/satellites/reflex/classifier.ts";

const route = {
  endpoint: "https://classifier.test/v1/systemone",
  model: "jev-1.13.0",
  budget: 2000,
  body: { provider: { data_collection: "deny" } },
};
const question = { noul: "Does `text` drop a quality `goal` names?", yes: "It lowers precision", no: "It keeps it" };

function server(...answers: (() => Response)[]) {
  const bodies: string[] = [];
  const fetcher = ((_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    const next = answers.shift();
    return Promise.resolve(next ? next() : new Response("no more", { status: 500 }));
  }) as typeof fetch;
  return { fetcher, bodies };
}

const ok = () =>
  Response.json({
    model: "jev-1.13.0",
    answers: { trades: { type: "noul", noul: 0.93 } },
    usage: { input_tokens: 120 },
  });

test("a call sends each question with the route's own fields, masks secrets first, and reads the answers", async () => {
  const { fetcher, bodies } = server(ok);
  const classifier = new Classifier(route, "key", [/\bsk-[A-Za-z0-9_-]{20,}/g], fetcher);
  const r = await classifier.ask(
    { text: "use sk-abcdefghijklmnopqrstuvwx to send int8", goal: "precision" },
    { trades: question },
  );
  assert.deepEqual(r, {
    ok: true,
    model: "jev-1.13.0",
    answers: { trades: { type: "noul", noul: 0.93 } },
    tokens: 120,
  });
  const sent = JSON.parse(bodies[0]!) as {
    provider: unknown;
    state: { text: string };
    questions: { trades: { type: string; criteria: unknown } };
  };
  assert.deepEqual(sent.provider, { data_collection: "deny" });
  assert.equal(sent.state.text, "use [masked] to send int8");
  assert.deepEqual(sent.questions.trades.criteria, { true: "It lowers precision", false: "It keeps it" });
});

test("a refused key is not retried; a rate limit is asked once more; a state past the budget is never sent", async () => {
  const refused = server(() => new Response("no", { status: 401 }), ok);
  assert.equal(
    (await new Classifier(route, "k", [], refused.fetcher).ask({ text: "x" }, { trades: question })).ok,
    false,
  );
  assert.equal(refused.bodies.length, 1);

  const limited = server(() => new Response("slow down", { status: 429, headers: { "retry-after": "0.01" } }), ok);
  assert.equal(
    (await new Classifier(route, "k", [], limited.fetcher).ask({ text: "x" }, { trades: question })).ok,
    true,
  );
  assert.equal(limited.bodies.length, 2);

  const huge = server(ok);
  const r = await new Classifier(route, "k", [], huge.fetcher).ask({ text: "x".repeat(20_000) }, { trades: question });
  assert.deepEqual(r.ok ? null : r.why, "too large");
  assert.equal(huge.bodies.length, 0);
});

test("an answer missing a question fails the whole call", async () => {
  const partial = server(() => Response.json({ model: "m", answers: {} }));
  const r = await new Classifier(route, "k", [], partial.fetcher).ask({ text: "x" }, { trades: question });
  assert.equal(r.ok ? null : r.why, "broken");
});
