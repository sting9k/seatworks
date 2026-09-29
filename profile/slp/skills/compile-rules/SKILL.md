---
name: compile-rules
description: "Turns the project's instruction files into rules.yaml, the questions every edit is asked against those files. Use when told the instruction files changed, or when the look back marks a rule weak or noisy; not for rules a linter can check, and not to write new rules of your own."
---

# Compile rules

Each imperative line in the project's instruction files that a linter cannot check becomes one question, asked of
every edit on the paths it covers. The writer who breaks one is told at once, with the rule quoted, and repairs it.
A rule you invent, or word past what the file says, is enforced as if the Human wrote it: compile what is there.

## For each rule

- **Keep it.** Only a line that tells an agent what to do or not do in the code. Descriptions, history and advice
  that names no act are not rules.
- **Send the rest to the linter.** A rule the project's linter or type checker already catches, or could with a
  setting, is not compiled. Say which.
- **Quote the source.** The file and line it came from, word for word.
- **Scope it.** The paths it covers, as globs. A rule about API routes is not asked of a stylesheet.
- **Pick its phase.** `edit` when one hunk can show it broken; `turn` when only the whole change can ("added more
  than was asked", "left a file over its size").
- **One condition.** A line with two demands is two rules.
- **Write the question** as a yes or no on `hunk`, yes meaning broken, in the rule's own terms. Give each outcome an
  example: a line of code that breaks it, and one that keeps it.

## Then

- Every new or rewritten rule is asked of recent hunks from the project's history before any agent meets it.
- **Weak** (answers in the middle, nothing clearly yes): the condition is vague. Name the concrete shape, split it,
  or add an example.
- **Noisy** (passes on most hunks): it is too broad. Narrow its paths or its wording.
- Leave every rule that came out decisive exactly as it is: its thresholds hold only for its wording.
- Tell the Human, in two or three sentences, how many rules were compiled, how many went to the linter, and which
  came out weak or noisy.
