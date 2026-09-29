---
name: planning-lanes
description: "Plans a high-risk lane before any Peer starts: the final contract first, splits only for a reason you can name, and a way back out. Use when the lane materially changes auth, secrets, data (migration, deletion, retention), money, an external effect that cannot run twice, a contract others call, or concurrency and lifecycle; not for a normal lane, whose directive is its plan."
---

# Planning a high-risk lane

Write the final contract first, split only where you can name the reason, and plan no lane you cannot get back out
of.

## Find out first

The plan rests on what the code shows. Send a scout, a discovery Peer that changes nothing, before the plan is
written: what it found are the plan's known lines, what it could not check are its unknowns, each with the scope that
checks it first. A finding that contradicts the directive goes to the Supervisor before anything rests on it.

## Split

- Split only for a reason you can name: paths that do not meet and can run at once, a mechanical fan-out too big for
  one sitting, separately accepted parts, or live state that needs a staged change.
- Never by layer, to show progress, or into phases that keep a half-built state compiling: one writer changes a
  contract with all its callers and tests.
- Scopes resting on the same unchecked assumption: run one first and the rest `after` it, so a wrong assumption costs
  one scope.
- For a lane heavy on one contract, a scope of its own may write the acceptance tests from the settled contract alone,
  so the tests are not fitted to the code.
- A compatibility layer only for a named shipped consumer (a published API, stored production data, a separately
  deployed client), recorded with when it goes.

## Settle design first

Settle every choice that changes ownership, public behaviour, safety, compatibility or data, or is expensive to
reverse, before a scope that rests on it starts. Several defensible answers: `blind-design`. One only the Human can
make: to the Supervisor, with your default.

## Getting back

A lane that migrates data, writes outside the repository, or makes a call nobody can take back says how it is undone
before it starts. A lane that leaves nothing behind says so in one line.

## Ends in

The plan's lines with `set_plan`, then the scopes it names with `open_scope`, each with what it waits for and the paths
it holds, as narrow as you know them.
