---
name: test-audit
description: "Invoke whenever writing, changing, reviewing or sweeping tests in Seatworks. An authoring gate every new or changed test must pass, and an audit for low-value, implementation-coupled or duplicate tests and the test-only seams they keep alive. Adapted from OpenClaw's test-audit skill (MIT)."
---

# Test audit

Two modes, one value bar. The **authoring gate** runs on every new or changed test as it is written. The **audit**
sweeps existing tests for ones that re-assert source, duplicate stronger proof, couple to implementation, or keep a
test-only seam alive. Optimize for confidence, not for deleting.

## Authoring gate

Before adding a test, answer four questions; a missing answer means do not add it yet:

1. What observable behaviour, invariant or independent contract does it protect? In Seatworks, name the
   `spec/CONFORMANCE.md` row or the KERNEL invariant.
2. What credible regression makes it fail?
3. Why does existing coverage not already catch that? Each contract has one owner test at the strongest boundary
   (for the kernel: a command sent as a tool sends it; for a satellite: its port with a fake far side). Another layer
   needs a distinct risk the owner cannot reach, such as a crash between commit and dispatch. Extend a table case or a
   shared fixture before writing a near-duplicate.
4. Does it need a production seam (an export, flag, wrapper or hook) that no production caller needs? Then move the
   test to the real boundary.

Then check it against every junk pattern below; a match fails the gate unless the retention bar names the contract
it independently guards. A test that would break under a refactor that keeps behaviour asserts implementation:
rewrite it at the owning boundary.

A regression test must fail on the code before the fix, for the intended reason, and pass after. One that never
failed proves the mock, not the fix. One regression at the owner boundary covers a bug; do not replay it at every
layer it crosses.

## Junk patterns

- assertion-free coverage probes;
- self-comparisons and identity copiers;
- copied fixtures, inventories, manifests or export lists (a copied list of commands or events is one);
- exact source, import or string greps (one exception in Seatworks: the scan for role names in `shared/` and `server/`);
- tests of a private predicate or call shape that a real boundary already proves;
- two invocations of the same contract;
- tests whose only purpose is keeping a test-only export, global or wrapper alive;
- dead production code whose only callers are tests;
- expected values produced by the code under test;
- mocks that implement the asserted behaviour, or one mock standing in for different APIs;
- fixtures that supply what the owner should produce: a hand-written log where commands would write it, an effect
  result the satellite never returns, or persistence asserted against a store the path never writes;
- capability tests that restate a declared flag or profile property instead of exercising what it promises;
- negative controls that pass for an unrelated reason, such as a refusal from a different invariant than the one
  named, or a rejection the production path never reaches (assert which invariant refused);
- names that promise more than the input exercises.

## Value bar

A test earns its upkeep by protecting behaviour, a credible regression or an independently meaningful contract.
Before judging one, read the whole test and its production owner, the entry point, callers, callees, overlapping
tests and history; read `AGENTS.md` first. When a test claims behaviour of a dependency (Paseo, node:sqlite, git),
read that dependency's source or types.

## Retention bar

Keep a test that independently guards a public contract: a kernel invariant or command, a port, the log's shape,
the profile schema, a Paseo boundary fact, security (the git shim, the caller key), a default, or the architecture
(layers, no role names). Also keep:

- ordering, when order is observable (delivery order, integrations one at a time);
- regressions with a credible failure mode;
- a source check when it is the cheapest independent guard and survives renaming identifiers;
- a kept test that fails on the baseline: treat it as a possible product bug, reproduce it, and fix the owner.

Static or slow is not a reason to delete.

## Audit

Read-only discovery first, evidence before any edit. Record for each candidate:

- the test's name and place;
- what failure it can actually detect;
- the non-test callers of what it covers;
- the stronger proof that remains, or why none is needed;
- why it exists (history);
- what production or test-support code its removal unlocks;
- the risk, and the focused command that validates the change.

Mark each: **R** retain (name the contract), **F** retain and repair the assertion, **C** consolidate (name the owner
that absorbs it), **D** delete (name the remaining proof). Judge a test by its assertions, not its name.

Edit in one coherent batch per owner. Delete obsolete test-only exports and dead paths rather than aliasing them.
Prefer fewer production lines. Never turn an uncertain candidate into cleanup to raise a count.

## Validation

1. Run the owner and sibling tests: `node --test --import ./test/setup.ts <files>`.
2. `npm run check`, then `git diff --check`.
3. Look at `git diff --numstat`, production apart from tests.
4. Report: what was removed and why, what stayed and why, what proof ran.
