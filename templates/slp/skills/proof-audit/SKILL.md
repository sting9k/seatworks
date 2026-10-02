---
name: proof-audit
description: "Judges whether a proof proves its claim and whether a test earns its place: would it fail with the behaviour gone. Use on the tests you are about to hand back, on a claim a brief names, or when reading a change or a lane's proofs. Not for finding bugs in the code itself, nor for writing a test (`test-first`)."
---

# Proof audit

A proof is worth what it would notice. Of each one ask: would it fail if the behaviour it claims were gone? One that
would not is a claim dressed as evidence, and work accepted on it is accepted on a claim.

Audit what you were given: your own tests, the claim a brief names, or the change or lane you read. Report a weak
proof only when you can name the scenario where it passes with the behaviour broken. An audit read as noise is set
aside whole, and one entry you cannot show costs every entry you can.

## One proof

1. **Claim.** The behaviour in a caller's words, and the production code that makes it true.
2. **Proof.** The test, check, benchmark or measurement cited for it.
3. **What it observes:** the behaviour at a seam a caller uses, a machine-readable contract, a number, or only a proxy
   (a call made, a string present, a file existing, a log line).
4. **Deletion.** Would it pass with the behaviour gone? When reading does not settle it, stub the production line in
   a scratch copy and run the proof.
5. **Independence.** Do its expected values come from the spec or a worked example, or from the code or artifact
   under test?
6. **Disposition.** Keep; repair the assertion; replace it with a proof at the right seam; narrow the claim to what
   the proof observes; delete it, only when step 4 shows it passes with the behaviour gone, naming what still proves
   the claim; or escalate, when no proof can exist without a decision that is not yours.

A mock proves only its own boundary, a proxy never proves runtime behaviour, and a measurement proves only under the
conditions it names. Weak proof is a reason to replace the proof, not to redesign the code.

## One test

Before a test is added or kept, four answers. A missing one means it has not earned its place yet:

1. What behaviour, invariant or independent contract does it protect?
2. What credible regression makes it fail?
3. Why does no existing test catch that? One contract has one owner test, at the strongest seam; a test at another
   layer needs a risk the owner cannot reach, such as a crash between two writes.
4. Does it need an export, flag or hook no production caller uses? Then it tests the wrong boundary.

A test that breaks under a refactor that keeps the behaviour asserts the implementation. A regression test is seen
failing on the code before the fix, for the reason it names; one never seen red proves its mock, not the fix.

## Patterns that pass broken

| Pattern                                                        | Better route                                              |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| No assertion, or a value compared with itself                  | Assert what a caller sees                                 |
| Expected value computed by the code under test, or copied from its output, for a claim beyond "unchanged" | A worked example, an invariant, an independent source |
| A mock that does the behaviour being asserted                  | The real collaborator, or a fake at the far side of a port |
| A call asserted as made, never what it did                     | The effect: the rows written, the bytes sent              |
| A fixture that writes the state the code should produce        | Let the workflow produce it                               |
| A grep of source, a string, heading or label taken as proof    | Run the behaviour, or parse the machine-readable output   |
| A negative case pinning a retired width, tag, field or version | Cases at the current boundary, such as its width ± 1      |
| A refusal asserted without saying which rule refused           | Assert the rule, so an unrelated refusal cannot pass      |
| Two tests of one contract at different layers                  | The one at the strongest seam                             |
| A name that promises more than its inputs exercise             | Rename it, or add the inputs                              |
| A benchmark on a mock or replica cited for production          | Measure the production path, or narrow the claim          |

Never grow a proxy with more strings or patterns: replace, narrow or delete it. Slow or static is no reason to delete,
and neither is a count to raise.

## Ends in

- **Working a task.** Every proof in your `hand_back` is one you would keep, and a gap you could not close is named
  beside its behaviour.
- **Reading a change or a lane.** A proof that passes with the behaviour broken is an entry in your verdict:

```text
Location      test/export.test.ts:41 "exports every row"
Claim         the CSV export writes one line per order
Observes      that the file writer was called, never the lines it wrote
Passes broken yes: an export that writes the header and no rows still calls the writer
Disposition   replace
Replacement   export three fixture orders to a temporary file and assert its three data lines
```
