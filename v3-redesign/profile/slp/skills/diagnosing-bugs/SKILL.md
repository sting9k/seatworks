---
name: diagnosing-bugs
description: "Goes from a symptom to its cause and proves the fix with a command that fails before and passes after. Use when the cause of a failure is unknown; not when the brief already names a settled fix."
---

# Diagnosing bugs

1. **A red command first.** One command that fails with the reported symptom before you theorize: a failing test at
   a seam that reaches the bug, a run diffed against expected output, a replayed request, or a bisect between two
   known commits, in a throwaway clone of your copy. Intermittent: rerun it alone until you know its rate. Failing
   only while another process holds the same port or database: say so and change nothing. No red command, no
   diagnosis: hand back what you tried and what would unblock you.
2. **Shrink it** until removing anything else turns it green.
3. **Three to five hypotheses before testing any**, each with a prediction ("if X, changing Y makes it vanish"). Run
   the cheapest check that separates the top two.
4. **Trace backward.** The line that throws is where the damage surfaced. Walk the bad value to where it first went
   wrong; the fix belongs there, since a guard at the symptom hides the bug from every other caller.
5. **Fix with a regression test** at a seam with the real callers: see it fail, fix at the source, see it pass, revert
   the fix to see it fail again, restore it.

**A failure that comes and goes.** Measure its rate alone and in the full suite: a gap between the two points at order
or a shared resource. Look first at time (clocks, timeouts, dates), then at leftovers from another test (bisect the
order to find the one that pollutes), a shared port, file, database or machine, randomness (seed it and print the
seed), and concurrency. Wait for the condition, never for a duration: a sleep that passes on your machine fails on a
loaded one.

After the third failed fix on one symptom, stop patching and look for the mechanism behind the chain; where it lies
outside your paths, raise it as a finding with what each fix revealed. A cause you call environmental or timing is
stated with what you checked; a retry or timeout added without that hides the bug.

Hand back the cause with its evidence, the hypotheses ruled out, and the red command before and after.
