---
name: repo-refresh
description: "Realigns a repository's docs, plans, tests, scripts and generated files with what the code does now: every suspect inventoried and classified before anything changes, then coherent cuts made by Peers so one truth has one owner. Use when the lane's brief asks for a refresh, or when drift between docs, tests and code keeps misleading the team; not for housekeeping inside one change, nor for redesigning working architecture."
---

# Repository refresh

Stale docs and dead proof mislead every agent that reads them, and agents read everything. A refresh takes away: two
sources of one truth become one, and proof that proves nothing goes.

The brief sets the mode: **audit**, inspect and report, unless it says refresh, clean, fix, remove or consolidate,
which is **apply**.

## Procedure

1. **The current contract.** Entry points and their owners, the documents that describe product and process, active
   plans, which tests and checks own which behaviour, generated files and what produces them, and the commands that
   define acceptance. Check names and "authoritative" labels against code and consumers before trusting them.
2. **Suspects.** Duplicate or superseded docs, plans done or orphaned, tests and checks, scripts, fixtures, snapshots,
   reports, tracked build output, dead links and commands. For each: its owner, its consumer, any truth only it
   holds, and what deleting it would break.
3. **Classify before anything changes.** `KEEP`: current truth it alone owns, or proof worth its cost. `MERGE`: its
   truth belongs with another owner. `REWRITE`: the owner is right, its history obscures it. `DEMOTE`: useful only as
   a diagnostic nobody waits on. `DELETE`: stale, duplicated, generated, dead proof, or history git already keeps.
   `BLOCKED`: removing it crosses a product, compatibility, legal or operational decision. Age, size and ugliness are
   signals, never a disposition. Tests and checks are weighed with a Reviewer on `proof-audit`.
4. **Cut coherently** (apply). A scope per coherent group, briefed with its rows: the truth merged into its owner,
   what refers to it updated, and the old sources deleted in the same scope, so the repository never holds two truths.
5. **Verify in proportion.** Links and references resolve, each contract has one owner, generated files match their
   producers, and the acceptance commands whose contract changed pass. No new framework to prove the cleanup.

A row reads like this: `docs/deploy.md`, DELETE after a MERGE. It documents a deploy script removed last year and
nothing reads it, but its release-tag rule is still true, so that rule moves into `RELEASING.md` in the same scope.

## Ends in

`BLOCKED` rows go to the Supervisor with the decision each needs. The report says what was merged, deleted,
rewritten and kept on purpose, the proof removed and why, what you ran to verify, and the debt left. A refresh is not
done while a live reference points at removed material, or two documents own one contract.
