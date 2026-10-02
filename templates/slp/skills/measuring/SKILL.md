---
name: measuring
description: "Measures performance so a number can be trusted: a fixed workload, a baseline with its spread, one change per measurement. Use when the goal names latency, throughput, memory or size, or before you claim something is faster; not for correctness, which is proven apart (`test-first`)."
---

# Measuring

A number without its spread and its conditions is an anecdote. Two runs on a busy machine can differ by more than the
change you are measuring.

1. **What, and on what.** The metric as the goal states it (p95 latency, frames per second, peak memory) and a
   workload like real use: real data sizes, a warm or cold start as users meet it. A micro-benchmark answers only for
   the code it isolates.
2. **Hold the machine** (`hold_machine`) for every run you will compare, so nothing the team starts runs beside it.
3. **Baseline the unchanged code.** Warm up, then enough runs to see the spread: median, p95, minimum and maximum.
4. **Profile before you change anything.** Find where the time or memory goes. A guessed bottleneck is usually wrong,
   and a speed-up where no time is spent is none.
5. **One change per measurement**, measured the same way. A gain inside the baseline's spread is no gain: run more, or
   say it cannot be told apart.
6. **Correctness apart.** The fast version passes the same tests as the slow one.

## Ends in

In your `hand_back`, beside the behaviour: before and after as distributions, the workload, the conditions and the
command that reproduces it. A goal the numbers show cannot be met is a finding with those numbers, never a quality
traded away quietly.

```text
p95 encode    before 4.1 ms (median 3.2, 2.9-5.0, 200 runs)   after 2.3 ms (median 1.9, 1.7-2.8, 200 runs)
Workload      the 10k-entity snapshot in fixtures/match-42.bin, warm, release build
Conditions    node 22.13, machine held, laptop on power
Reproduce     npm run bench -- encode --runs 200
```
