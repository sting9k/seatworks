# Watch

W, the watch, is SLP's attention checker. An agent often gets something wrong not because it cannot do it but
because it has not spent its attention there: it writes a long, wrong test, and one question later sees the fault
itself. A question makes it spend its reasoning on what it is likely to get wrong. A closed question ("you are
breaking an anti-pattern") makes it look for something to confess, to please; an open one leaves it neutral. So a
small word from the Supervisor at the right moment is worth more than any rule.

That leaves two questions: **when** to draw an agent's attention, and **how**. The watch answers when; the
Supervisor answers whether, and how. The plugin finds the moments, carries them to the Supervisor without filling its
context, and measures which were worth it. It never speaks to the agent it watches and never decides.

## Decided

The owner gave this design to the builder. These choices settle it, each with its reason.

1. **A cascade.** Code and the reflex find candidates cheaply; the Watcher, a model, confirms them; the Supervisor
   hears only what is confirmed or what the reflex is sure of. The Supervisor's context is the scarce thing, so the
   cheap tiers buy recall and the Watcher buys precision.
2. **One Watcher per project, over every scope.** The Supervisor may seat more, each over the lanes it names, for work
   where many answers can be right and the design will be tested as it is built.
3. **Jev is required; the Watcher adds no new reader.** The reflex is part of v3, and installing it with its key is
   the Human's consent to send agents' words to Jev's host, through OpenRouter with data collection denied unless
   they choose TypeSafe's own API (`REFLEX.md`). The Watcher runs on a provider the team already uses. Before any text
   leaves, what looks like a secret is masked.
4. **Driven by the work, with one sweep.** A turn's end or a long turn's growth starts a look. A sweep every 15
   minutes reads only scopes with new work since the last one, so an idle project costs nothing.
5. **An attention asks nothing of the Supervisor.** No obligation opens: making it answer every one would be the
   ceremony the concept warns of. Silence is an answer; marking a moment noise is the one thing it may do to quiet
   one.
6. **The agent never learns it is watched.** An agent that knows plays to the watch (V1). The Supervisor's question
   is its own, with no attention's words, id or source in it.
7. **An open question to a Peer copies its Lead and opens no obligation**, since it directs nothing (KERNEL I7).
8. **Blind designs do not break N2.** N2 forbids narrowing what an agent may read to make writing safe. A blind
   design narrows reading so its designs stay independent, and only until its Lead brings them together.

## When: moments

A moment is something that bears on the design or the implementation while it can still be changed cheaply. The SLP
profile's set, in `profile/slp/watch.yaml` with its questions and thresholds:

| Moment                  | Seen when                                                                               | Watches    |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------- |
| big-decision            | It settles a structure, boundary, data shape or contract that other work will build on   | Lead, Peer |
| struggling              | It says it does not know, or guesses, what a requirement, term or piece of code means    | Lead, Peer |
| turning                 | It drops the approach it was on for another                                              | Lead, Peer |
| admits-wrong            | It says something it did or claimed earlier was wrong                                    | Lead, Peer |
| trades-the-goal         | It gives up a quality the goal names (precision, latency, bandwidth) to meet another, such as sending a direction as int8 instead of int16 to save bandwidth | Peer |
| mints-an-api            | A test, or a fake in it, fixes a name, field, signature or shape of the code under test that nothing has settled, so the code will later be bent to fit the test | Peer |
| obeys-against-judgement | It does what it says it thinks is wrong because it was told to                           | Peer       |
| builds-a-stand-in       | It plans a stub, fake, shim or second copy of state to fill a gap                        | Peer       |

When is each owner's craft, so it is data. The anti-pattern list the moments draw on is shared across projects
(`reference/ANTIPATTERNS.md`); a project adds a moment of its own only when a look back shows its agents keep making
one mistake. A profile with no moments has no watch, so a team that works another way loses nothing.

## The cascade

```text
agent host stream ─► eye (code): items and facts
    │
    ├─ reflex, on each item, each moment its role is watched for
    │     p ≥ tell ───────────────────────────────────────────────────────────► Supervisor
    │     consider ≤ p < tell ─┐
    ├─ facts that need judging ─┤  (a loop, a long turn, a full context, a test before its code)
    │                           ▼
    ├─ sweep, scopes with new work ──────────────────────► Watcher ─ attend ──► Supervisor
    │                                                          └──── pass (recorded)
    └─ alarms (a refused destructive command, two measurements at once, a flaky test) ─► Supervisor, the Human's view
```

### The eye

- An **item** is one piece of an agent's turn: a thought, something said, a tool call with its arguments, a result
  with its exit and first lines, an edit with its path and hunk. Items are clipped to `item.chars`: a moment shows in
  a sentence or two, and a long item dilutes the question.
- A **look** is taken at each turn's end, and every `item.everyItems` items inside a long turn, where drift hides.
- **Facts** are counted in code: the same failing command again, a turn far longer than the agent's usual, a context
  nearly full, a test file edited before the code it names exists.
- After a reconnect the eye fills the gap from history (PASEO rule 5).

### The reflex

Each new item is one call, with the item as `text` and every moment its role is watched for as a question beside it
(`REFLEX.md`, Asking well). A moment that needs more than the item names it: `trades-the-goal` reads the scope's
`goal`. Two thresholds per moment: `tell` goes straight to the Supervisor, `consider` goes to
the Watcher. Everything is recorded.

### A test that mints an API

A red test that calls code not yet written is ordinary test-first. It mints an API when it fixes a name, field,
signature or shape that nobody has settled: the brief asks for points after a purchase, `User` has no `points`, and
the test writes `user.points` or builds a fake user that carries one. The code is then built to the test, the test
stays, and a later agent, not knowing where it came from, bends the code to keep it green. The cheapest moment to ask
is the first such test, before any code follows it.

It needs nothing v3 does not already run: git, the record and the reflex.

1. On an edit to a test path, code takes from the added lines the names they give the code: after a dot, before a
   call, a key in an object literal, after `new`. The patterns are data and deliberately crude; the reflex and the
   Watcher filter what they catch.
2. A name is **settled** when it is in the scope's brief, its parent's plan or a line of the Human's; in the base at
   the scope's start (`git grep`); or in code the Peer already wrote outside test paths in its copy, since a test of a
   shape the Peer chose in code checks that shape rather than inventing it.
3. No unsettled name: nothing is asked. Otherwise the reflex gets the hunk and the unsettled names, and asks two
   questions: whether the test uses one of them as part of the code under test, and whether it builds a fake, stub or
   adapter that gives the code under test one of them.
4. Past `consider`, a candidate goes to the Watcher with the brief beside it; past `tell`, an attention goes to the
   Supervisor at once.

The same two questions are asked over a hand-back's test diff, as `judgement` evidence for the Lead (`REFLEX.md`).

### The Watcher

A role in the profile (`profile/slp/roles/watcher.md`), seated under the root over the scopes it watches. It writes
nothing and speaks only to the Supervisor.

- **Model.** The profile names one of the Human's Paseo agent profiles: a cheap model with a long context.
- **Tools.** `look` (an agent's items between two points), `record` (a scope's brief, findings, reports, and earlier
  attentions with what came of them), `diff` (a scope's change at a commit), `attend`, `pass`. No shell and no files.
- **Woken by** a message listing new candidates, or by the sweep. Messages that arrive while it works go as one, so
  candidates batch themselves.
- **A candidate** comes with the agent, scope, moment, probability, the item quoted with two items either side, the
  facts beside it, the scope's brief, and the earlier attentions on that agent and what came of them.
- **A sweep** holds each active agent's items since the last sweep up to `sweep.digestChars`, with a count and a
  pointer for the rest.
- **Every candidate is attended or passed.** Each opens an obligation on the Watcher, so a restart loses none; a pass
  is a label the reflex's thresholds are later set from.
- **Its memory is the log.** Its context is compacted when full, and a new Watcher is seated from the record.

## What reaches the Supervisor

An attention is an observation (KERNEL §4.9) delivered to the root:

```text
ATTENTION 2 of 3 · L2-T4 Peer · trades-the-goal · watcher · now
why: "drop direction to int8, the jitter should be fine" while the goal names aim precision on mobile
facts: 3 rewrites of net/encode.ts this turn
at: history 8812–8840 · look for more
```

- It wakes the Supervisor when marked `now`, never inside its turn; `later` waits for the next message that asks
  something. The reflex's sure answers are `now`; the Watcher chooses.
- Several on one agent in one turn go as one numbered message. The watch may combine its own reports; it never
  combines the agents' words.
- The Supervisor reads more with `look`, so its context holds quotes and pointers, not transcripts.
- `mark_noise` stops one moment for one agent and scope (V1's rule 8).

## How: the Supervisor's open question

What the Supervisor does is its judgement: nothing, one open question, a council asked of the Lead, a hold, or the
Human. The craft is its skill (`profile/slp/skills/attention/`): ask about the area and never the fault, presuppose
nothing so that "no" is easy, one question, no anti-pattern named, and nothing that shows a watch exists.

## Measured, and taken away

- For each moment and tier, the look back reads how many attentions the Supervisor acted on, and after how many the
  agent changed something within its next turns: a finding, an amendment, a commit that undoes the work, a question
  to its Lead.
- An attention that arrived after the work it concerns was integrated counts toward "interventions that came too
  late" (§10.3).
- The Watcher's passes and attentions label the reflex's candidates, and the Supervisor's acts label the Watcher's.
  Thresholds are set from those labels at the look back, never by code.
- A moment that never leads to a change leaves the profile.

## While the Human is away

The Human's attention is what runs short across many long projects. The Human surface keeps a view of everything
since they last looked:

- The decisions made for them.
- The disagreements still open.
- The attentions and what the Supervisor did with each.
- The alarms.

The view is built from the record, one line an item. What the Supervisor says about it is its own words. Reading it
aloud is a matter for the surface.

## With parts missing

| Present                    | The watch                                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| All                        | As above                                                               |
| Jev's host unreachable     | Facts and sweeps go to the Watcher until it answers again              |
| No Watcher role            | Only the reflex's `tell` answers, the facts that need no judging, and the alarms reach the Supervisor |

Every other part of v3 works the same in each case.

## What V1 did that v3 keeps and drops

| V1                                                        | v3                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| The eye on words and thinking, at turn end and in long turns | Kept                                                              |
| Moments and anti-patterns as data                         | Kept, with `trades-the-goal` and `mints-an-api` added                |
| W speaks to the Supervisor only; noise marking; the watched never know | Kept                                                    |
| A 30 s tick over every seat                               | The stream's events, and a sweep only where there is new work        |
| Four brain modes and their switches                       | One cascade; a part is absent or present                             |
| An incident book beside the ledger                        | Observations in the one log                                          |
| Forty tuning values; a `next` line of advice              | A few numbers, each with its reason; facts only                      |

## To check before building on it

- How much thinking each agent shows through Paseo's stream: whole, summarized, or none.
- What the Watcher costs on the first real lane, against the attentions that led to a change.
