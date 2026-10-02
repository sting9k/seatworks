---
name: proof-first
description: "Writes what will prove a behaviour before the behaviour. Use when the brief names a behaviour a check can observe; not for a discovery brief, where the answer is not known yet."
---

# Proof first

A check written after the code proves what the code does, not what was asked. Written first, it can fail.

1. Name the behaviour from the brief in one line.
2. Write the check, run it, and see it fail for the reason you expect.
3. Build until it passes, with no special case for the check's input.
4. In the hand-back, put the behaviour beside the check that proves it.
