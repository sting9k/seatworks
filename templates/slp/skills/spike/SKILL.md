---
name: spike
description: "Answers one question of fact with throwaway code. Use on a discovery brief, or when your work rests on a fact only running something can give; not for code that will be kept, which is built with `test-first`."
---

# Spike

A spike buys one answer, not code. It is worth what it could have said no to: a probe built to confirm what you
already think finds a way to confirm it.

1. **The question first**, with the answer that would change the plan: "Does the SDK stream partial results? If not,
   the UI waits for the whole reply."
2. **The smallest probe that can say no.** The real library, a real shape of the data, the real service where you
   may reach it. Nothing stands in for the thing the question is about: a fake answers for the fake. No polish, no
   tests, no abstraction.
3. **Run it** and keep the command and its output, with the conditions: versions, data size, machine, what else was
   running.
4. **Say what it did not check.** A yes on ten rows is not a yes on ten million.
5. **Keep it a probe.** It stays on your branch so a reader can rerun it, never as the product's code: it was written
   to answer, not to last. Where some of it is worth keeping, say so, and the Lead briefs it as work.

## Ends in

`hand_back` on the commit that holds the probe: the answer (yes, no, or not settled and why), the command, its output
and the conditions, and what it did not check. A premise the answer contradicts is a `raise_finding` with the probe
as its evidence.
