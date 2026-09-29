---
name: testing
description: "Writes Seatworks' tests: a conformance case at the boundary an agent or the Human uses, property tests of the kernel with fast-check, replay of recorded logs, and the shell's crash and retry edges, each proved by failing first. Use when adding or changing any behaviour, and before trusting a green suite."
---

# Testing

A green suite here has agreed with bugs before. A test counts only once it has been seen to fail for the right reason.

## Before writing one

Answer four questions, or write no test:

1. Which contract does it protect? Name the `spec/CONFORMANCE.md` row, or add the row first.
2. What regression turns it red?
3. Why do the existing tests miss it?
4. Does it need an export only tests use? Then test through the boundary instead.

## The four kinds

**Conformance.** One test per row, through the boundary: commands sent as a tool sends them (with a caller and a
command id), facts fed as a satellite returns them, the log and views read back. Set the workflow up once and assert
each step, rather than one test per step with its own setup.

```ts
test("I7: a message that directs a Peer gives its Lead a copy and an obligation", () => {
  const team = lane(); // a helper that runs the real commands: open the root, a lane, a Peer
  const sent = team.send({ from: team.supervisor, to: team.peer, text: "Use int16", directs: true });
  assert.equal(sent.ok, true);
  assert.deepEqual(team.copiesFor(team.lead), [sent.messageId]);
  assert.equal(team.openObligations(team.lead).length, 1);
});
```

**Properties of the kernel.** fast-check generates command sequences from a model of the team; after each command,
every invariant holds on the folded state, and folding the log again gives the same state.

```ts
fc.assert(fc.property(fc.array(anyCommand(), { maxLength: 60 }), (commands) => {
  let state = initial;
  const log: Event[] = [];
  for (const command of commands) {
    const d = decide(stamp(command), state, profile);
    if (!d.ok) continue; // a refusal names an invariant: checked by its own conformance case
    for (const e of d.events) { state = evolve(state, e); log.push(e); }
    for (const check of invariants) assert.equal(check(state), null);
  }
  assert.deepEqual(log.reduce(evolve, initial), state);
}));
```

Generate commands that are mostly valid (callers drawn from actors that exist, scopes from those open) or the run
tests only refusals. A counterexample fast-check shrinks goes into the conformance tests as a named case.

**Replay.** Logs recorded from real runs live in `test/fixtures/logs/`. New code folds each and compares with the
recorded state. A change that folds an old log differently fails here; before 3.0.0 the fixture is re-recorded in the
same commit, with the reason.

**Shell edges.** A crash between commit and dispatch (the effect goes out once on restart), a fact delivered twice
(recorded once), a command retried with the same id (the earlier result, nothing appended), a busy reader (delivered
at the next turn's end). A race is decided by a gate the test holds and releases, never a sleep or a tick count:

```ts
let release!: () => void;
const gate = new Promise<void>((resolve) => (release = resolve));
fakeHost.onSend = () => gate; // the delivery waits inside the satellite
const pending = bridge.dispatch();
fakeHost.endTurn(agent);      // the event the race is about
release();
await pending;
```

## Fail first

- For a new rule: write the test, run it before the code, see it fail on the missing behaviour, not on a typo.
- For a fix: put the old behaviour back, watch the test fail, restore.
- For a moved contract: mutate a copy of the file so the rule is gone, see the new test fail, restore from the copy,
  and only on a green suite.

## Fakes

A fake records what it was asked and returns what the test tells it to. It never reimplements the behaviour under
test. The Paseo fake implements the port, not Paseo.

## Never

A test with no assertion; an expected value computed by the code under test; a copied inventory; a source grep (one
exception: the scan for role names in `shared/` and `server/`); a second test of one contract; a log or ledger written
by hand where the workflow would produce it; a sleep; a test that invents an interface the spec has not settled.

## Running

`node --test` with the setup file every test imports: each test gets a HOME of its own, git's own binary first on
PATH, and a `console.error` the test did not ask for fails it. One file: `node --test --import ./test/setup.ts <file>`.
