import assert from "node:assert/strict";
import { test } from "node:test";
import { humanView } from "../../shared/views/human.ts";
import { refusedBy, team } from "./ledger.ts";

const seen = (actor: string, scope: string, level: "tell" | "consider", moment = "trades-the-goal") => ({
  question: moment,
  actor,
  scope,
  source: "reflex",
  answer: "0.95",
  level,
  route: { kind: "attention", why: '"drop to int8" while the goal names precision', urgency: "now" },
});

function delivered(ledger: ReturnType<typeof team>["ledger"], attention: string) {
  ledger.must(ledger.fact("record_delivery", { attentions: [attention] }));
}

test("an attention about a Peer goes to its Lead, not the Supervisor, and nothing reaches the Peer", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell")));
  const [attention] = [...ledger.state.attentions.values()];
  assert.equal(attention?.to, lead);
  assert.ok(!ledger.effects.some((e) => e.body.kind === "deliver" && e.body.to === peer));
});

test("an attention about a Lead goes to the Supervisor", () => {
  const { ledger, supervisor, lead, lane } = team();
  ledger.must(ledger.fact("record_observation", seen(lead, lane, "tell", "big-decision")));
  assert.equal([...ledger.state.attentions.values()][0]?.to, supervisor);
});

test("left past its reader's next turn it climbs, with the silence beside it; past the root it stays in the Human's view", () => {
  const { ledger, supervisor, lead, peer, task } = team();
  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell")));
  const first = [...ledger.state.attentions.keys()][0]!;
  ledger.must(ledger.fact("record_turn", { actor: lead, outcome: "done", tokensSoFar: 10, usdSoFar: 0, seen: 0 }));
  assert.equal(ledger.state.attentions.has(first), true, "not delivered yet, so not left");
  delivered(ledger, first);
  ledger.must(ledger.fact("record_turn", { actor: lead, outcome: "done", tokensSoFar: 10, usdSoFar: 0, seen: 0 }));
  const climbed = [...ledger.state.attentions.values()];
  assert.equal(climbed.length, 1);
  assert.equal(climbed[0]?.to, supervisor);
  assert.match(climbed[0].facts.join(" "), /a2 did not act on it/);

  delivered(ledger, climbed[0].id);
  ledger.must(
    ledger.fact("record_turn", { actor: supervisor, outcome: "done", tokensSoFar: 10, usdSoFar: 0, seen: 0 }),
  );
  assert.ok(ledger.log.some((e) => e.type === "attention_climbed" && e.to.to === "human"));
  const shown = humanView(ledger.state).attentions;
  assert.deepEqual(
    shown.map((t) => [t.actor, t.scope]),
    [[peer, task]],
    "it stops in the Human's view",
  );
  ledger.must(ledger.human("acknowledge", { attention: shown[0]!.id }));
  assert.equal(humanView(ledger.state).attentions.length, 0, "and the Human settles it");
});

test("the Lead acting on the Peer, saying nothing of the attention, settles it; so does acknowledge", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell")));
  const first = [...ledger.state.attentions.keys()][0]!;
  delivered(ledger, first);
  ledger.must(ledger.as(lead, "send_message", { to: peer, text: "What does the goal promise the player?" }));
  assert.equal(ledger.state.attentions.size, 0);

  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell", "mints-an-api")));
  const second = [...ledger.state.attentions.keys()][0]!;
  assert.equal(refusedBy(ledger.as(peer, "acknowledge", { attention: second })), "authority");
  ledger.must(ledger.as(lead, "acknowledge", { attention: second }));
  delivered(ledger, second);
  ledger.must(ledger.fact("record_turn", { actor: lead, outcome: "done", tokensSoFar: 1, usdSoFar: 0, seen: 0 }));
  assert.equal(ledger.state.attentions.size, 0);
});

test("a moment marked noise for a Peer is not told again for that Peer and scope", () => {
  const { ledger, lead, peer, task } = team();
  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell")));
  ledger.must(ledger.as(lead, "mark_noise", { attention: [...ledger.state.attentions.keys()][0]! }));
  ledger.must(ledger.fact("record_observation", seen(peer, task, "tell")));
  assert.equal(ledger.state.attentions.size, 0);
});

test("between thresholds it is a candidate owed by the watcher, closed by attend or pass", () => {
  const { ledger, supervisor, lead, peer, task } = team();
  ledger.must(ledger.fact("record_observation", seen(peer, task, "consider")));
  assert.equal(ledger.state.obligations.size, 0, "no watcher seated: recorded only");

  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  const watcher = "a4";
  assert.ok(ledger.effects.some((e) => e.body.kind === "agent.create" && e.body.actor === watcher));
  ledger.must(ledger.fact("record_observation", seen(peer, task, "consider")));
  const candidate = [...ledger.state.obligations.values()].find((o) => o.owedBy === watcher)!;
  ledger.must(
    ledger.as(watcher, "attend", {
      candidate: candidate.about.id,
      actor: peer,
      moment: "trades-the-goal",
      why: "int8",
      urgency: "now",
    }),
  );
  assert.equal(ledger.state.obligations.has(candidate.id), false);
  assert.equal([...ledger.state.attentions.values()][0]?.to, lead);
});

test("a failed turn and a gone agent are told to the owner above", () => {
  const { ledger, lead, peer } = team();
  ledger.must(
    ledger.fact("record_turn", {
      actor: peer,
      outcome: "failed",
      why: "529 overloaded",
      tokensSoFar: 0,
      usdSoFar: 0,
      seen: 0,
    }),
  );
  ledger.must(ledger.fact("record_gone", { actor: peer, why: "the process exited" }));
  const notes = ledger.effects.filter(
    (e) => e.body.kind === "deliver" && e.body.to === lead && e.body.item.kind === "note",
  );
  assert.equal(notes.length >= 2, true);
  assert.equal(ledger.state.scopes.get("1.1")?.owner, null);
});

test("an attention about the root's own agent goes to the Human, who sees it and may mark it noise", () => {
  const { ledger, supervisor } = team();
  ledger.must(ledger.fact("record_observation", seen(supervisor, "root", "tell", "big-decision")));
  const [shown] = humanView(ledger.state).attentions;
  assert.equal(shown?.actor, supervisor);
  ledger.must(ledger.human("mark_noise", { attention: shown.id }));
  assert.equal(humanView(ledger.state).attentions.length, 0);
});
