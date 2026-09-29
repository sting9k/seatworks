---
name: acceptance-walk
description: "Checks a lane as a user or caller meets it before it is reported: the goal turned into clauses someone could observe, each exercised on the lane's head through its real surface, with probes a fake success would not survive. Use before reporting a lane whose goal is behaviour a user or caller sees; not for a lane with no such surface, such as an internal refactor, whose tests are its proof."
---

# Acceptance walk

Parts that pass alone can fail together, and each Peer's proof shows what its author thought of. The walk is the lane
seen from outside, the way whoever asked for it will meet it.

1. **Clauses before code.** Turn the goal and the Human's lines in the plan into clauses a user or caller could
   observe: "a second POST with the same key returns the first order, not a new one". Write them before you read the
   diff, so the code does not frame them.
2. **Exercise each on the lane's head** through the real surface: the command line, the API, the UI, the files it
   writes. For a run that should stand as evidence on that very commit, or where your reading of the code would frame
   what you look at, seat a Reviewer on the head with the clauses alone: its verdict is evidence on that commit.
3. **Probes a fake success fails.** Other data than the tests use; the same action twice; a restart between steps,
   then what persisted; empty, invalid and oversized input; the effect itself (the row, the file, the message sent)
   rather than a success message.
4. **Mark each clause** passed, failed with its repro, or not checked and why.

## Ends in

A failed clause goes to the scope that owns it with its repro, by `send_back` while its hand-back is open or as a new
scope once it is integrated. One you could not check goes in your report as "X, unchecked". Your `hand_back` of the
lane puts each clause beside what proves it.

```text
Clause    an order placed twice with the same key is charged once
Ran       two identical POST /orders with Idempotency-Key k1, then GET /charges?order=<id>
Saw       two orders, two charges: failed
Repro     scripts/repro-double-charge.sh on 3f2a9c1
```
