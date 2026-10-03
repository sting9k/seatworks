import assert from "node:assert/strict";
import { test } from "node:test";
import { setupOf } from "../../client/state/setup.ts";
import { pillOf, seatsOf } from "../../client/state/team.ts";
import { humanView } from "../../shared/views/human.ts";
import { SHA, team } from "../kernel/ledger.ts";

test("a seat says one word for what it is doing now: the Human's turn, held, handed back, then working or idle", () => {
  const { ledger, supervisor, peer } = team();
  const says = (...running: string[]) =>
    seatsOf(humanView(ledger.state), new Set(running)).map((seat) => [seat.scope, seat.depth, seat.says]);

  assert.deepEqual(says(peer), [
    ["root", 0, "idle"],
    ["1", 1, "idle"],
    ["1.1", 2, "working"],
  ]);
  ledger.must(ledger.as(peer, "hand_back", { commit: SHA(1), text: "encoded" }));
  ledger.must(ledger.as(supervisor, "hold_scope", { scope: "1", reason: "the wire format is not settled" }));
  ledger.must(ledger.as(supervisor, "ask_human", { text: "int8 or int16?", options: [], recommend: null }));
  assert.deepEqual(says(peer, supervisor), [
    ["root", 0, "needs you"],
    ["1", 1, "held"],
    ["1.1", 2, "handed back"],
  ]);
});

test("the pill says the most pressing thing: what is stuck, then the Human's turn, then held, then who works", () => {
  const { ledger, supervisor, peer } = team();
  const pill = (stuck: number, ...running: string[]) => {
    const human = humanView(ledger.state);
    return pillOf(human, stuck, seatsOf(human, new Set(running)), 0).label;
  };

  assert.equal(pill(0), "Team · idle");
  assert.equal(pill(0, peer, supervisor), "Team · 2 working");
  ledger.must(ledger.human("hold_scope", { scope: "root", reason: "back after lunch" }));
  assert.equal(pill(0, peer), "Team · held");
  ledger.must(ledger.as(supervisor, "ask_human", { text: "int8 or int16?", options: [], recommend: null }));
  assert.equal(pill(0, peer), "1 needs you");
  assert.equal(pill(2, peer), "2 stuck");
});

test("once the record holds what landed and no work is open under the root, the pill says all landed", () => {
  const { ledger, supervisor } = team();
  const pill = (landed: number) => {
    const human = humanView(ledger.state);
    return pillOf(human, 0, seatsOf(human, new Set()), landed).label;
  };

  assert.equal(pill(1), "Team · idle", "a lane is still open: there is work left to land");
  ledger.must(ledger.as(supervisor, "drop_scope", { scope: "1", reason: "out of appetite" }));
  ledger.must(ledger.as(supervisor, "open_scope", { parent: "root", role: "watcher", over: "all" }));
  assert.equal(pill(1), "Team · all landed", "a watch still open is no work left to land");
  assert.equal(pill(0), "Team · idle", "a team that has landed nothing has not landed it all");
});

test("matching agents is not done before a template is installed, whatever else is", () => {
  const done = (templates: number, unmatched: number) =>
    setupOf({ templates, unmatched, classifierSettled: true, projects: 0 }).map((step) => step.done);
  assert.deepEqual(done(0, 0), [false, false, true, false]);
  assert.deepEqual(done(1, 2), [true, false, true, false]);
  assert.deepEqual(done(1, 0), [true, true, true, false]);
});
