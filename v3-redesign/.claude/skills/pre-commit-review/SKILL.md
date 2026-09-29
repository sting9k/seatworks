---
name: pre-commit-review
description: "An adversarial review of your own diff before every commit in v3: the governing rule, the concept's musts and must-nots, the invariants, layering, idempotency, spec sync, tests that failed first, and the commit message. Use before each commit; not a substitute for npm run check, which runs after it."
---

# Pre-commit review

Read the whole diff (`git diff --staged`) as a reviewer who wants it rejected. Fix what you find, then run
`npm run check`, then commit.

## The governing rule

- [ ] Does the change add a constraint on how SLP works, or take one off? An added one names its reason in the commit
      message; a removed one is deleted, never switched off.
- [ ] Would the plugin still make sense to a team that dropped SLP? No role's name in `shared/` or `server/`.
- [ ] Is there a decision in it the spec does not settle? Stop and ask the owner.

## The concept

- [ ] Nothing decides acceptance, judges evidence, picks a result or ranks messages (N1, KERNEL §9).
- [ ] Nothing narrows what an agent may read (N2).
- [ ] A new refusal is an invariant with its CONCEPT-V2 clause; any other refusal is removed.
- [ ] Every line written carries the origin the kernel set; nothing takes an origin from arguments.
- [ ] Nothing closes an obligation by time or cleanup (I11).
- [ ] The reflex's answers only note, evidence or state a fact (I12).
- [ ] A word to a Peer from outside its lane still reaches its Lead (I7).

## The code

- [ ] `shared/` has no I/O, clock, random id or runtime import. `react` keys every effect.
- [ ] Only `agent-host/` and the bridge import `@getpaseo/*`; no satellite imports another.
- [ ] Every effect is idempotent by its key or by checking before it acts.
- [ ] Every new `Map`, `Set`, timer, subscription and child process has its removal path.
- [ ] Every promise is awaited or caught with a log.
- [ ] No dormant option, abstraction or export; no dual path or fallback; no comment that restates the code.
- [ ] The simplify pass of `clean-code` is done.

## The proof

- [ ] Each behaviour has its conformance row, and its test was seen failing without the change.
- [ ] The property test still holds every invariant; replay fixtures fold, or were re-recorded with the reason.
- [ ] No sleep, no hand-written log, no mock that does the behaviour.

## The spec

- [ ] Where the change does what the spec says, nothing to do. Where it changes what the spec says, the spec changes
      in the same commit: `KERNEL.md` tables, `PORTS.md` signatures, `CONFORMANCE.md` rows.
- [ ] A "to check" the change resolved is moved out of that list, with what was found.

## The commit

- [ ] The subject is one imperative sentence on the change in behaviour, sentence case, no prefix, no file name.
- [ ] The body says why, and names any constraint added and its reason.
- [ ] No model identifier, key or secret anywhere in the diff; a scan for OpenRouter's key prefix finds nothing.
- [ ] It ends with the session's attribution lines.
