---
name: grilling
description: "Settles with the Human what new work should do before any lane opens: numbered rounds of questions, each with a recommended answer, until nothing the project does or how it behaves is assumed, and every settled answer is a line of the plan in the Human's words. Use when the Human brings new work or a change the plan does not answer; not for a small change, a question the plan settles, or work already settled."
---

# Grilling

Facts are yours to find; what the project does is the Human's to say; no lane opens until the Human agrees you have
understood.

## What goes to the Human

- Only what changes what the project does or how it behaves: who it is for, what happens in the cases that matter,
  the rules its logic follows, what it will not do, the words it is spoken of in, and what it may cost.
- Stack and architecture across lanes are yours. Decide them and list them under **Assumed**, one line each, so the
  Human can overturn one. How a lane is built is its Lead's.
- **Assumed** holds only what no user or caller would notice. A line that changes what a caller sends or gets back,
  how long something lasts, or what a repeat does is behaviour, so it is a question.
- A fact the repository or a tool can give you is never a question.
- Ask early for what leaves no trace in the repository: a budget or deadline, a stack or service it must use, the
  scale it must bear, who uses it, a contract others already depend on, the shape of data that already exists.

## Contracts callers meet

When the work has an interface others call, ask each of these it reaches as a question of its own, with a scenario
at its edge: the error body and its codes; how long a repeat is recognized as the same request, and what a repeat
with a different body gets; how a session ends; how long data is kept and what happens after; the name of each field,
one name for one thing. One condition per question: a question with two gets one answer.

These are settled before any lane builds on them. A test written against a contract nobody settled invents one.

## Rounds

Map the request as a tree of decisions. A round asks every decision whose prerequisites are settled, and no other.

```text
❓ Q1 - <title>: <the question, with the choices when there are some>
➡️ <your recommended answer, and why in a line>

Assumed: <what you decided yourself, one line each>
```

- Sharpen vague words: "account" means the customer or the user? Propose the term to keep, and the words it
  replaces.
- Test a rule with a scenario at its edge.
- Say when their words disagree with the plan or the code, and ask which is right.

## Too foggy to split

When the rounds cannot yet give lanes because the answers rest on facts nobody has: name the destination in their
words, then the decisions that block the plan. Settle each the cheapest way: a fact by a discovery Peer before any lane
builds on it, behaviour by a round here, a design with several sound answers by a lane that designs it blind. Each
answer becomes a line of the plan; what is still unknown stays among its unknowns with how it will be checked. Open a
lane only once the decisions it rests on are settled.

## Writing it down

Each settled answer becomes a line of the plan with `set_plan` or `amend_plan`, citing the answer it came from, so
its origin is the Human's. One that changes an earlier answer amends that line. A settled word is a term of the plan:
its definition in one or two sentences of what it is, and the words it replaces under `avoid`. The project's glossary
is written from them, so every lane after this one speaks the Human's words.

## Read-back

Before the first lane opens, one screen: the lanes with their goals, the contracts they meet on and the lane that
builds those first, what you assumed, the defaults you will take when a question comes up while they are away, and
what will bring them back (a change to the goal or the cost, an act that cannot be undone).

## Ends in

Every branch visited, nothing they care about silently assumed, and their word that you have understood. If they say
start before that, start, and name what is still open in the directives.
