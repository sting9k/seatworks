---
name: open-code-review
description: "Use this skill when your brief asks for a review of a commit or of a lane's head. It holds how to review a change file by file against the rules that apply to each file: Open Code Review's `ocr` picks the files and the rules, and you do the reading. Not for a brief that asks one open question."
---

# Review by rule, with Open Code Review

`ocr` does what needs no judgement: which changed files are worth a review, and which review rules apply to each. Run
this way it calls no model. The reading is yours and so is every finding: a rule is a place to look, never a verdict.

## Steps

1. **What to review.** For the commit you were given, `ocr delegate preview --commit <sha>`; for a lane's head against
   its base, `ocr delegate preview --from <base> --to <head>`. It lists each changed file with what was added and
   removed, and strikes out the ones it leaves out, with why: a generated file, a lock file, a kind it has no rules
   for. A file it left out that an acceptance behaviour rests on is still yours to read.
2. **The rules.** `ocr delegate rule <path> <path> ...` with the files it kept. Files under the same rules come as one
   group, so read the rules once a group. A project's own rules are in `.opencodereview/rule.json`; where a file
   fell under the default rules alone, say so in your verdict.
3. **The change, a file at a time.** `git show <sha> -- <path>` for a commit, `git diff <merge_base>..<head> -- <path>`
   for a range. Read the file around the change, and its callers where a rule asks what a caller meets. Take the
   group's rules as a checklist, then look once more for what no rule names.
4. **Doubt each finding.** Before you report one, read it against the diff alone, as someone who has not seen your
   notes. Drop it if the diff contradicts it, or if it needs a caller that neither the code nor the brief has. Add
   none at this step: it only takes away. A review that reports what is not there costs its Lead the trust the next
   true finding needs.
5. **Report** as your role says: each finding with where it is (`path:line`), what a user or caller meets, and whether
   you ran something or only read. `ocr`'s own scale ranks by kind; yours ranks by what a user meets.

| `ocr` calls it | Here                                 |
| -------------- | ------------------------------------ |
| critical       | P0 or P1                             |
| high           | P1 or P2                             |
| medium         | P2 or P3                             |
| low            | nothing, unless it changes behaviour |

## When `ocr` is not there

`command not found`, or it says the git here is too old for it: review by the diff without it, and say in your
verdict that no rules were applied. The review is still owed.
