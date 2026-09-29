---
name: pre-mortem
description: "Finds how a lane fails while changing its directive is still free, by stories written in the past tense from a lane that already failed. Use for a lane that is expensive, touches money, credentials or data that cannot be recovered, leaves this machine, or rests on one untested assumption; not for a routine lane."
---

# Pre-mortem

Every story is written in the past tense, and no story sees another. Asked what could go wrong, a model returns a
polite list of generic risks; asked what did go wrong, it returns the specific failure nobody wanted to raise.

1. **Fix the plan.** Write the goal, constraints, choices and appetite exactly as `open_scope` will state them.
2. **Name the failure.** A date and a failure the Human would recognise: "eight weeks on, the migration shipped and a
   week of orders cannot be rebuilt", not "the project failed".
3. **Two stories, three at most, one lens each**, each finished before the next begins:
   - **Mechanism:** what state was wrong, which owner did not hold it, what ordering or rollback broke.
   - **Assumption:** which premise turned out false, and what would have shown it early.
   - **Coordination**, when the work spans several scopes: where ownership overlapped, which decision nobody made.

   When the code must be read to tell them, seat a Peer per lens on a discovery brief that holds only the plan, the
   named failure and its lens.
4. **Merge, dropping nothing for being unlikely.**
5. **One row per cause.** A cause the directive cannot act on is a worry, not a risk.

   ```text
   R1  Failure       what had happened, one sentence, past tense
       Cause         the mechanism, assumption or gap behind it
       First signal  the earliest thing someone could observe, and where
       Mitigation    the smallest change to the plan, or none
       Disposition   accepted | mitigated | no-go | the Human's
   ```

   A mitigated row becomes a constraint or a line of the goal; a no-go row goes out of scope; an accepted row whose
   first signal the Lead can watch goes into the directive as the point where it stops and asks. A row is the Human's
   only when its mitigation changes the goal or the cost.

The output may shrink the goal, add a limit, or stop the lane. It never enlarges the appetite.
