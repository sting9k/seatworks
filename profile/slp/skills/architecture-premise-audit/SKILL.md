---
name: architecture-premise-audit
description: "Judges whether a whole project is built around the right kind of system: derives what the product needs before trusting the repository's own account, compares the two, and returns one verdict with ranked findings, each of which can be proved wrong. Use when the Human asks, or evidence across lanes points there: fixes that keep failing in one place, cost that follows the wrong variable, lanes that keep bending code around one foundation. Not for reviewing a change, for one design question (a Lead's `blind-design`), or for finding bugs."
---

# Architecture premise audit

Build the expected map from the product before you read the repository's account of itself. Its names, docs, tests
and benchmarks describe what was built, not what should have been; read first, they become the frame you judge in.

The question is whether the shape is right, not where the defects are. What breaks in production is usually local and
dull, and an outcome that needs bugs found wants a lane and a review. The audit reads: it changes nothing and becomes
no second review.

## Procedure

1. **The claim.** The product's category, its boundary, the outcome it must reach, your assumptions, and when you are
   done.
2. **The expected map**, from what the product needs and the domain's established mechanisms, sliced by product
   responsibility, not by module. Each slice: its job and who consumes it; who owns its state and that state's
   lifecycle; its inputs, outputs and trust boundaries; the variable it scales with, or that an adversary controls;
   what it does on failure and under load.
3. **The observed map.** Production entry points, the state that is authoritative, durable effects, expensive
   operations, queues and schedulers, what leaves the system, deployment boundaries, and the proof cited for each.
   Never take the repository's decomposition untested.
4. **Compare slice by slice.** Which demonstrated need forces each mechanism? Does cost follow useful work? Are the
   normal and exceptional paths the right way round? What is lost if it goes or moves?
5. **Deep-check the serious candidates.** Trace the real callers, name how the cost amplifies, build the plainer
   counterfactual and the machinery it removes, and give the strongest counterargument and the evidence that would
   prove the finding wrong.
6. **Stop on coverage:** every entry point, state family, durable effect, expensive operation and output is on the
   map, or excluded by name.

Complexity is a finding only when it lacks a product need, an owner, a lifecycle, a consumer, a scaling contract or a
failure contract. A candidate nobody could prove wrong is an open question, not a ranked finding: an audit read as
noise is set aside whole.

## Lenses

Where to look, not a list every design must pass. Report only what the code you read supports.

- **Wrong category:** every module is strong, but the whole behaves like another kind of product than its goal,
  scale, latency or cost calls for.
- **Imported completeness:** a capability mature systems omit, approximate or precompute is built in full.
- **A name with no mechanism:** prediction without history, reconciliation without an authoritative correction,
  idempotency without identity, durability without a durable commit.
- **A homemade proxy:** a timer, counter, retry or partial copy of state standing in for admission, backpressure,
  reconciliation or a transaction.
- **Wrong archetype:** exact work kept as latest state, supersedable state journaled as exact work, a transition that
  needs total order enforced over eventual snapshots.
- **Bent around a weak foundation:** wrappers, fallbacks, retries or flags owning a lifecycle the dependency should
  own; special cases bridging two owners that disagree; a workaround that outlived its reason.
- **Proof laundering:** a send, an ACK or a log line taken as the outcome; mocks or isolated green suites cited for a
  production chain they never reach.
- **Local excellence:** would the whole still look strange with every detail excellent? What disappears on the boring
  route?

Clear a mechanism, as standard or as a justified deviation, when it has the information and the owner it needs and
any deviation serves a named constraint at a proportionate cost. Custom is not wrong, and complexity the domain
requires is not overengineering.

## A project too large to read alone

Open a lane to map it. Its goal is the observed map for the slices you name. What must hold: no change to the code,
every row with its file and line, and each slice read by a reader who sees no other reader's answer. How it meets
that is its Lead's. Leave your suspicion out of the brief, so each reader stays an independent judgment. Its report
carries the rows; then drop the lane and release its Lead.

## Ends in

One verdict first: `KEEP_FOUNDATION`, `REPAIR_FIRST`, `REDIRECT_RECOMMENDED`, `STOP_AND_REDIRECT` or
`INSUFFICIENT_EVIDENCE`. Then only what supports it: the expected map against the observed one, coverage and
exclusions, ranked findings with file and line, the hidden premise and how it amplifies, the counterfactual,
counterarguments and what would prove each finding wrong, what to stop optimizing, and the decisions it asks for. Give
the best judgment the evidence supports, never an unranked menu. A supported finding reads like this:

> Architecture defect, high. Every page view rebuilds all of a customer's reports synchronously
> (`server/render.ts:88`, called from the request handler), so cost follows traffic, while a reporting product needs
> a report built once per data change and served from storage. The counterfactual builds on write and removes the
> render pool. Proved wrong if traffic shows each report is viewed about once per data change.

Take the verdict, the top findings and the decisions to the Human, what you observed kept apart from what you infer.
Ask only when one missing fact would reverse the verdict and no stated assumption can bound it. What the Human decides
goes into the plan as their lines. Work that follows reaches a Lead as a brief that quotes the findings it rests on,
with file and line, since the Lead does not read your audit.
