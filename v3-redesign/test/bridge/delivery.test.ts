import assert from "node:assert/strict";
import { test } from "node:test";
import type { Delivery } from "../../server/bridge/dispatcher.ts";
import { type Wiring, handlersFor } from "../../server/bridge/effects.ts";
import type { PaseoHost } from "../../server/satellites/agent-host/host.ts";
import { team } from "../kernel/ledger.ts";

/** The delivery handler alone, over an agent host that records what it was sent and says whether the reader is busy. */
function delivery(busy: () => boolean) {
  const sent: { host: string; text: string; key: string }[] = [];
  const host = {
    send: (h: string, text: string, key: string) => {
      if (busy()) return Promise.resolve("busy" as const);
      sent.push({ host: h, text, key });
      return Promise.resolve("sent" as const);
    },
  } as unknown as PaseoHost;
  const handlers = handlersFor({ host } as unknown as Wiring);
  return { deliver: handlers.deliver, sent };
}

test("what asks nothing waits; a delivery that asks carries everything queued, numbered, oldest first", async () => {
  const { ledger, supervisor, lead, peer } = team();
  ledger.must(ledger.fact("record_agent", { actor: peer, host: "h-peer" }));
  ledger.must(ledger.as(supervisor, "send_message", { to: peer, text: "FYI the base moved" }));
  ledger.must(ledger.as(lead, "send_message", { to: peer, text: "Why int16?", asks: true }));
  const queued = ledger.effects.filter(
    (e): e is typeof e & { body: Delivery } => e.body.kind === "deliver" && e.body.to === peer,
  );
  const { deliver, sent } = delivery(() => false);

  const context = { project: "p", state: ledger.state, key: "k1" };
  assert.deepEqual(await deliver([queued[0]!.body], context), { status: "wait" });
  assert.equal(sent.length, 0);

  const done = await deliver(
    queued.map((q) => q.body),
    context,
  );
  assert.equal(done.status, "done");
  assert.equal(sent.length, 1);
  assert.match(
    sent[0]!.text,
    /^1 of 2 · m\d+ from a1[\s\S]*FYI the base moved[\s\S]*2 of 2 · m\d+ from a2[\s\S]*it asks an answer/,
  );
});

test("a reader inside its turn is not sent anything: the delivery waits for the turn's end", async () => {
  const { ledger, lead, peer } = team();
  ledger.must(ledger.fact("record_agent", { actor: peer, host: "h-peer" }));
  ledger.must(ledger.as(lead, "send_message", { to: peer, text: "Stop and look at the goal", asks: true }));
  const queued = ledger.effects.filter(
    (e): e is typeof e & { body: Delivery } => e.body.kind === "deliver" && e.body.to === peer,
  );
  const { deliver, sent } = delivery(() => true);
  assert.deepEqual(
    await deliver(
      queued.map((q) => q.body),
      { project: "p", state: ledger.state, key: "k" },
    ),
    { status: "wait" },
  );
  assert.equal(sent.length, 0);
});
