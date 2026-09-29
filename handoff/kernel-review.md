<!-- Review report as written on 2026-09-29, before the repository moved: read every `v3-redesign/` path as the repository root. -->

## Kernel, contracts and views review (read-only)

The kernel suite passes (36/36), but I found 13 real defects. Every "ran" finding below was reproduced with a probe driven through `test/kernel/ledger.ts`, the same parse, decide, fold and react path the shell uses. The probes are in `/tmp/claude-0/-home-user-seatworks/2bc2844f-0fa7-5902-ae3d-27b6ae3079de/scratchpad/review-kernel/` (`probe*.test.ts`, with output in `out*.txt`). I edited nothing in the repo.

### High

1. **`amend_brief` wipes every section it did not name.**
   - **Where:** `shared/contracts/commands.ts:63` (`set: BriefInput.partial()`) and `shared/kernel/decide/scopes.ts:105-116`.
   - **Defect:** in zod 4, `.partial()` still applies the inner `.default([])`, so absent sections parse as `[]`, not `undefined`.
   - **Failure:** in `team()`, the Lead amends only the Peer's goal. The brief's constraints go from 1 to 0, and choices and context are erased too. A second effect: every old line is counted as "touched", so if any of them is the Human's, a goal-only amendment is refused with I6 (probe P2: "a change to the Human's line l7").
   - **Verified:** ran P1, P2, and `parseBody` directly.
   - **Fix:** give `set` its own object with every field `.optional()` and no defaults.

2. **Permission obligations close when the answerer leaves, not the asker.**
   - **Where:** `shared/kernel/decide/seats.ts:183` and `scopes.ts:320-321`.
   - **Defect:** these obligations are owed by the answerer, yet `releaseSeat` and `reseat` close them "its asker left".
   - **Failure:** the Peer's `record_permission` puts an obligation on the Lead. The Supervisor then releases or reseats the Lead: the obligation closes, the permission is pruned, and the Peer is still seated and waiting. The Human's `answer_permission` is refused "unknown", so the Peer's harness prompt hangs.
   - **The reverse is also wrong:** when the asker leaves, nothing closes the obligation, which contradicts LEDGER §3.
   - **Verified:** ran P3 and P3b.
   - **Fix:** move these obligations like any other; close the ones whose `owedTo` is the leaving actor.

3. **Moved messages and attentions are never delivered.**
   - **Where:** `shared/kernel/react.ts` has no `message_moved` case. `evolve.ts:169-171` moves attentions on reseat with `delivered: null` and no new effect. The dispatcher batches by the effect's `to` (`server/bridge/dispatcher.ts:74-78`, `effects.ts:153-155`).
   - **Failure:** the Lead sends the Peer an asking message, then reseats the Peer. The only deliver effect still targets a3, which is released, so it is dropped. a4 never receives the message.
   - **Why tests miss it:** this contradicts CONFORMANCE (Delivery, "A Peer reseated with three messages queued") and LEDGER §8. `workflow.test.ts:226` checks only `m.to` in state, never the effects.
   - **Verified:** ran P5 and traced the dispatcher.
   - **Fix:** in react, have `message_moved` emit a deliver to `e.to` with key `<seq>:deliver:<id>`, and do the same for each attention a reseat moves (or add an event for it).

### Medium

4. **I4: a red gate can be passed without a reason by leaving it uncited.**
   - **Where:** `work.ts:99-111` only examines the evidence the caller cites.
   - **Failure:** a check on the candidate fails (e1). The Lead cites only a green verdict on the same candidate, gives no reason, and the integration is accepted (probe R1).
   - **Caveat:** this depends on reading I4's "a failing result" as any failing result on that commit, which is WORKFLOW's "over a red gate … with a reason".
   - **Fix:** also require a reason when any evidence recorded on `candidate.candidate` is failing.

5. **Pruning deletes verdict evidence that integration still needs.**
   - **Where:** `prune.ts:60` drops evidence by the scope it was recorded in.
   - **Failure:** a Reviewer on the candidate records a verdict (e1). The Lead drops the reading scope, then `integrate` citing e1 is refused "unknown: no evidence e1" (probe Q2). That refusal is not an invariant.
   - **Fix:** keep evidence while its subject is the candidate or claim commit of an open scope.

6. **`after` is recorded but nothing makes a scope wait.**
   - **Where:** `react.ts:24-33` creates the agent at once; nothing in `server/` reads `.after`.
   - **Failure:** scope 1.2 on `src/net/` opened `after` 1.1 gets `agent.create` as soon as its workspace is ready (probe Q1). Both write the same path at once, breaking I3's "so two never write the same path at once".
   - **Fix:** defer `agent.create` while any `after` sibling is open, and emit it on that sibling's `integrated` or `scope_dropped`.

7. **An attention about the root's actor reaches the Human nowhere and can never be settled.**
   - **Where:** `evolve.ts:257-262` keeps it; `HUMAN_COMMANDS` (`commands.ts:267`) lacks `acknowledge` and `mark_noise`; `humanView` has no attentions field; `activityLine` gives no line for `attention_opened`.
   - **Failure:** the watcher attends about a1. The attention goes to the Human, the Human's `acknowledge` is refused "authority", and the attention stays in state forever (probe P7). LEDGER §7 says the Human's view shows it.
   - **Fix:** add both commands to `HUMAN_COMMANDS`, and add attentions to `humanView`.

### Low

8. **`drop_scope` closes one obligation several times** (`scopes.ts:268-271`): it closes once per doomed scope. Dropping lane 1 with a finding open on it emits `obligation_closed` o1 twice (ran P4). Fix: run that loop once, outside the per-scope loop.
9. **`reviewsThatChanged` can never count a verdict** (`record.ts:118-126`): verdicts are keyed to the reading scope, but `sent_back` and `brief_amended` name the reviewed scope. Result is `[0,1]` after a red verdict followed by a send-back (ran P6). Fix: match on the subject commit.
10. **Citing the copy of a direction does not carry it in** (`decider.ts:67`, and `answer` in `talk.ts`). The Lead receives copy m2, but the obligation is about m1. Amending with `via` m2 leaves the direction open, and `answer` to m2 closes nothing (ran Q3). Fix: resolve `copyOf`.
11. **`activity.ts:219` has "was left by the Supervisor" hard-coded.** It is a role name in `shared/`, and it is wrong when an attention climbs from a vacant parent. The architecture test only catches quoted names.
12. **A Peer cannot raise a finding while its Lead's seat is empty** (`findings.ts:37-38`): refused "state" (ran Q4), which is not an invariant. Fix: route it to the next seated owner up, or to the Human.
13. **`chainOf` and `mapText` keep the old verdict after `finding_reopened`** (`record.ts:48`, `docs.ts:262`). This is unreachable today, because no SLP role has `reopen_finding`.

### Spec vs code

- **`handover` moves paths only, never the writer.** KERNEL §6 and I1, WORKFLOW "Decided 2" and CONFORMANCE I1 row 2 all say the writer moves by handover. The test `invariants.test.ts:7` asserts the writer "changes only by a reseat".
- **KERNEL §3 says a gone actor's seat, obligations and mail stay.** The code, like LEDGER §5, empties the seat and moves them. The two spec files contradict each other.
- **`reseat` is accepted on a held scope** (ran Q5). KERNEL §4.8 says nothing new is seated in a held scope.
- **I6 is applied only to the root plan's goal and appetite** (`scopes.ts:160`). CONFORMANCE I6 ("The Lead amends the goal with no answer → Refused") is accepted for a lane plan or a brief goal.
- **LEDGER §3 closes a permission when "the asking actor gone";** the code does not.
- **Argument and effect shapes differ from LEDGER:** `publish_requested`'s effect lacks `expectedSha`; LEDGER names `amend_brief`'s argument `via`, the code `cites`; LEDGER gives `attend` a `scope` argument, the code has none.
- **`HumanViewSchema.lanes.owes` says it counts attentions** (`rpc.ts`); `human.ts:154` counts obligations only.
- **No role in `profile/slp/profile.yaml` has `reopen_finding`,** so the kept → raised move in KERNEL §4.4 is unreachable.

### Unverified

- **Nothing wakes a Lead waiting on checks.** Check results are notes that ask nothing (`react.ts:120-126`), so a Lead that is woken by a hand-back before its checks finish, or that called `run_checks`, is not woken when the result lands. That conflicts with COMMUNICATION's "an answer it is waiting on" wakes the reader.
- **`drop_scope` can land between `integration_started` and `record_integration`.** The branch is already moved, but the fact is then ignored, so the ledger says dropped while the code is merged.
- **If the root's owner hands back, the Human owes the claim,** and only `send_back` can close it.
