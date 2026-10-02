---
name: tidy-first
description: "Makes a change easy before making it: small structural steps committed apart from the behaviour change, each keeping the tests green. Use when the change is hard to make in the code as it stands, or the brief asks for a refactor; not for cleanup the task does not need."
---

# Tidy first

Make the change easy, then make the easy change. A diff that mixes moving code with changing what it does hides the
behaviour change from every reader, your Lead and its Reviewer included.

1. **Know what must not change.** The existing tests at the seam; where they are thin, characterization tests that
   pin what the code does now, their expected values taken from running it, before you move anything.
2. **Tidy in small steps**, each green, each its own commit: a name that says what a thing is, a function extracted
   or inlined, code moved next to what it works with, dead code removed, a function doing two jobs split. A step that
   turns a test red is undone, not fixed forward.
3. **Only where the change passes through.** Debt beyond it goes in your hand-back, or in a finding when it blocks
   you: wider tidying is a change nobody asked for, in paths others may hold.
4. **Then the behaviour change**, as its own commit, now small.
5. **The final shape.** Every caller moved, nothing kept alive under the old name: no alias, shim or adapter for a
   caller inside the repository.

## Smells, as places to look

A function that reaches into another module's data more than its own; the same few fields passed together
everywhere; one change that needs edits in many places; a layer that only forwards; generality nothing uses yet.
Each is a question, would the change be easier without it, never a violation to report.

## Ends in

Commits whose messages say which are structure and which behaviour, so a reader can take the first kind on the tests
and read the second closely. The `hand_back` names the structural commits as such.
