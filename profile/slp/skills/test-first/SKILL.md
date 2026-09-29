---
name: test-first
description: "Settles the contract, sees a test fail at the seam, then writes the code. Use when the brief settles the interface you build to and a failing check can come first; not when the interface is still undecided, which is a question for your Lead."
---

# Test-first

Settle the contract, see the test fail at the seam, then write the code. A test you never saw fail proves nothing,
and a test that invents the contract becomes the spec.

## Choose the proof

| Change                        | Evidence before code changes                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| A bug                         | A failing repro of the reported symptom (`diagnosing-bugs`)                          |
| New behaviour at a seam       | A failing test through the seam                                                     |
| A protocol, format or schema  | A failing round-trip on real records or bytes                                       |
| A refactor                    | The existing tests; where weak, characterization tests at the seam (`tidy-first`)   |
| Performance                   | A baseline over enough runs to show its spread, correctness proven apart (`measuring`) |
| Layout, copy, docs, config    | The smallest check that the artifact is valid, never a unit test for wording        |

## Settle the seam and the contract

1. **Seam.** An interface the brief names, or an existing public entry point, and what a caller sees there, in one
   line such as `parseHeader(bytes) -> Header | ParseError`. With neither, ask your Lead: a test at a guessed seam
   makes your guess the contract.
2. **Contract.** Every type, field, function, route and table a test uses, and every field a fake in it carries,
   exists in the code at your base or is named in your brief:

   ```sh
   git grep -n -w 'NAME' "$BASE" -- . ':(exclude,glob)**/test*/**' ':(exclude,glob)**/*[._]test.*' ':(exclude,glob)**/*[._]spec.*'
   ```

   A missing name is a minted API: the test decides the contract, and the code is bent to fit it later. Ask your Lead
   with the names. For a name the brief defines that does not exist yet, declare its signature first, so the test
   fails on an assertion rather than an import.
3. **Baseline.** Run the fastest test command on the unchanged code, so a later red is known to be yours.

## The loop

For each behaviour, one sentence in a caller's words:

1. One test through the seam. The expected value comes from the spec or a worked example, never from the code under
   test; if hard-coding it would pass, add a second example with other values.
2. See it fail on an assertion that the behaviour is missing. An import or fixture error is not the right red.
3. The least code that implements the rule: no branch no test asked for, no special case for the test's inputs.
4. Tidy, rerun, commit.

No API, flag or state whose only consumer is a test. A test that is hard to write is design feedback. When the check
and the brief disagree, the brief settles the contract: say so in your hand-back rather than bend the code.

## Before handing back

Would a wrong constant, a swapped branch or a missing side effect fail some test? Add it when the behaviour is in the
acceptance or risky; otherwise name the gap in your hand-back.
