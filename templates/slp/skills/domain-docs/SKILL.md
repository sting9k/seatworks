---
name: domain-docs
description: "Reads and keeps the project's glossary and its records of decisions. Use before you plan or build in an area, when your work settles a word the glossary lacks, or when you make a decision that is hard to reverse, surprising without its reason, and a real trade-off; not for how a lane is built, which its code and record already say."
---

# Domain docs

The project's docs outlive every lane and every agent. Each word or decision written here once is one no later
agent has to rediscover, and one it will not quietly undo.

## Before you plan or build

- Read `GLOSSARY.md` and the ADRs in `docs/adr/` that touch your area. A file not there holds nothing yet: go on.
- Name things with the glossary's words, in code, tests and what you write to others, and never with a word it lists
  under _Avoid_. A concept it lacks is a signal: either you are inventing a word the project does not use, or there
  is a gap worth filling. A word marked as the Human's is theirs; one the team settled is a choice like any other,
  and a word that no longer fits what the code does is a finding.
- An ADR, and every line of a plan or a brief that is not the Human's, is a choice someone made, not a requirement:
  what must hold is only what the Human set. Work that contradicts a choice is a finding, raised with its evidence, never
  a silent override and never a workaround that keeps the choice alive; its owner reopens it on evidence, or keeps it
  with a reason you can argue with.

Only an agent that writes code writes here. A Lead that settles a word or makes such a decision puts it in the brief
of the task it concerns, and that Peer writes it with the code.

## Glossary

A word the glossary lacks goes in with your own commit when your work settles it, or uses one the plan settled.
Write that one as the plan has it, and say after its definition when it is the Human's:

```md
**Order**:
A request from a customer for goods, placed once and fulfilled in parts.
_Avoid_: Purchase, transaction
```

One or two sentences on what it is, not what it does. Only words of this project's domain, never general
programming ones. One word for one thing: pick the best and list the others under _Avoid_.

## ADR

Write one only when all three hold; if one is missing, the code and the record say enough.

1. **Hard to reverse**: changing your mind later costs something real.
2. **Surprising without its reason**: a later reader would wonder why, and might "fix" it.
3. **A real trade-off**: there were sound alternatives, and you chose one for reasons.

`docs/adr/NNNN-slug.md`, numbered one past the highest there, in your own commit so it lands with the code it
explains:

```md
# Orders are event-sourced

What the context was, what was decided, and why, in one to three sentences.
```

Add a `Considered` line only when the rejected option is one someone will suggest again. A decision that supersedes
an earlier ADR says so in both.
