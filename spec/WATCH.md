# Watch

W, the watch, is SLP's attention checker. An agent often gets something wrong not because it cannot do it but
because it has not spent its attention there: it writes a long, wrong test, and one question later sees the fault
itself. A question makes it spend its reasoning on what it is likely to get wrong. A closed question ("you are
breaking an anti-pattern") makes it look for something to confess, to please; an open one leaves it neutral. So a
small word from the agent's Lead, or from the Supervisor, at the right moment is worth more than any rule.

That leaves two questions: **when** to draw an agent's attention, and **how**. The watch answers when; the owner of
the scope above the work answers whether, and how: a Peer's Lead, or the Supervisor for a Lead and for what crosses
lanes (`STEERING.md`, Who is told). The plugin finds the moments, carries them to that owner without filling its
context, and measures which were worth it. It never speaks to the agent it watches and never decides.

## Decided

The owner gave this design to the builder. These choices settle it, each with its reason.

1. **A cascade.** Code and the reflex find candidates cheaply; the Watcher, a model, confirms them; the owner hears
   only what is confirmed or what the reflex is sure of. An owner's context is the scarce thing, so the cheap tiers buy
   recall and the Watcher buys precision.
2. **One Watcher per project, over every scope.** The role that may seat one does so, since who is seated is a
   template's to say and never the plugin's: SLP's Supervisor is told to with its first lane. With none seated a
   candidate stays in the record and reaches nobody. The Supervisor may seat more, each over the lanes it names, for
   work where many answers can be right and the design will be tested as it is built.
3. **The classifier is the template's, and the Watcher adds no new reader.** A template names the model its moments
   are asked of, SLP's Jev, and a Human's key for its host is their consent to send agents' words there (`REFLEX.md`).
   A template that names none, or a Human who switches it off, is still watched: by what code counts and by the
   sweeps (With parts missing). The Watcher runs on a provider the team already uses. Before any text leaves, what
   looks like a secret is masked.
4. **Driven by the work, sweeps too.** A turn's end starts a look. A sweep is not a clock and not a shadow reading
   the stream: each Watcher gathers the work of the agents it watches, and once it passes `sweep.everyChars` it is
   woken with a digest of it. A busy lane is swept often, an idle project never, and the Watcher, a model, runs only
   when there is work to read (AGENTS.md: no seat runs on a heartbeat).
5. **An attention opens no obligation, but climbs if left.** Making its reader answer every one would be the
   ceremony the concept warns of. One its reader has neither acted on nor acknowledged by the end of its next turn,
   and that still holds, goes up one owner (`STEERING.md`). `mark_noise` quiets a moment for one agent and scope.
6. **The agent never learns it is watched.** An agent that knows plays to the watch (V1). The owner's question is its
   own, with no attention's words, id or source in it. Its own scope's `record` shows it nothing of what was told of
   its work, what a look back reads of the watch is shown to the root's owner alone, a scope that watches is shown
   only to its own agent and to those above it, and a `look` reaches only down: an attention sits in the timeline of
   whoever was sent it, so an agent looks at those in its own scope or below, and one that watches at those it
   watches over (`PORTS.md`).
7. **An open question to a Peer copies its Lead and opens no obligation**, since it directs nothing (KERNEL I7).
8. **Blind designs narrow no one's reading.** A design is blind to its Lead's framing and to the other designs
   because the Lead does not put them in its brief, and Peers do not message each other or look at each other's turns
   (6). What an agent may read of the code and the record stays open (CONCEPT-V2 §4.3, N2): the article's parachute is an agent that may only read about the parachute (A3.2¶6),
   and independence of thought comes from reading widely (A3.3¶6).

## When: moments

A moment is something that bears on the design or the implementation while it can still be changed cheaply. The SLP
profile's set, in `templates/slp/watch.yaml` with its questions and thresholds:

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

Every moment is watched from the first lane, those above and those counted in code alone, which ask no model
(`STEERING.md`). A moment's `tell` is earned only at a look back, so until then what the reflex finds goes to the
Watcher as a candidate and reaches an owner only if the Watcher attends to it. When is each owner's craft, so it is
data. The mistakes the moments are drawn from are the ones SLP names
(`skills/retrospective/ANTIPATTERNS.md`); a project adds a moment of its own only when a look back shows its agents
keep making one mistake. A profile with no moments has no watch, so a team that works another way loses nothing.

## The cascade

```text
agent host stream ─► eye (code): items and facts
    │
    ├─ reflex, on each item, each moment its role is watched for
    │     p ≥ tell ───────────────────────────────────────────────────────────► owner
    │     consider ≤ p < tell ─┐
    ├─ facts that need judging ─┤  (a loop, a test's line changed where the brief asks nothing of tests)
    │                           ▼
    ├─ sweep, scopes with new work ──────────────────────► Watcher ─ attend ──► owner
    │                                                          └──── pass (recorded)
    └─ an alarm (the classifier cannot be asked: no key, a key refused, a question it cannot take) ─► the Human, on the project's page
```

A refused destructive command, two measurements at once and a flaky test were named as alarms here and never built:
the git shim's refusal reaches the agent that ran the command, the machine's hold keeps two measurements apart, and
nothing runs a check twice. Each is built when a look back shows a team needed it, as any moment is.

### The eye

- An **item** is one piece of an agent's turn: a thought, something said, a tool call with its arguments, a result
  with its exit and first lines, an edit with its path and hunk. Items are clipped to `item.chars`: a moment shows in
  a sentence or two, and a long item dilutes the question.
- A **look** is taken at each turn's end, of everything the turn held. Paseo tells a plugin of a turn's start and
  its end and of nothing between (`PASEO.md`), and nothing here runs on a clock, so a long turn is read when it
  ends. A hand-back or a finding is read with the event that records it.
- **Facts** are counted in code: the same call failing the same way again, turns that spend and record nothing, a
  finding left unclassified, spend past an appetite, an existing line of a test changed where the brief asks nothing
  of tests (`STEERING.md`). Code does the counting; what it counts by is the profile's, under `facts` in its watch
  file: how many times and turns (`repeats`, `repeatsTold`, `silentTurns`, `waitingTurns`), which paths are tests
  (`testPath`), what in a brief's words asks for work on tests (`asksOfTests`) and what a line that asserts looks
  like (`assertion`). No number and no pattern of these is in the plugin, so a team that writes Go, or briefs in
  another language, sets its own. A profile with no watch file has nothing counted. Three things are not counted. A turn's length is a late and weak sign: failed runs are
  longer on average, but length alone does not tell them from the rest, and the loop and the silence it would point
  at are counted themselves. How full a context is, as a share of its window, measures neither of what a long context
  does: work decays well before a window fills, and an agent cuts corners by how full it believes the window is; the
  corners it cuts are asked about directly. A test written before its code is ordinary test-first, and the one that
  matters is the test that mints an API, below.
- After a reconnect the eye fills the gap from history (PASEO rule 5).

### The reflex

Each new item is one call, with the item as `text` and every moment its role is watched for as a question beside it
(`REFLEX.md`, Asking well). A moment that needs more than the item names it: `trades-the-goal` reads the scope's
`goal`. Two thresholds per moment: `tell` goes straight to the owner, `consider` goes to
the Watcher. Everything is recorded.

### A test that mints an API

A red test that calls code not yet written is ordinary test-first. It mints an API when it fixes a name, field,
signature or shape that nobody has settled: the brief asks for points after a purchase, `User` has no `points`, and
the test writes `user.points` or builds a fake user that carries one. The code is then built to the test, the test
stays, and a later agent, not knowing where it came from, bends the code to keep it green. The cheapest moment to ask
is the first such test, before any code follows it.

It needs nothing Seatworks does not already run: git, the record and the reflex.

1. On an edit to a test path, code takes from the added lines the names they give the code: after a dot, before a
   call, a key in an object literal, after `new`. The patterns are data and deliberately crude; the reflex and the
   Watcher filter what they catch.
2. A name is **settled** when it is in the scope's brief or its parent's plan; in the base at the scope's start
   (`git grep`); or in code the Peer already wrote in its copy, since a test of a shape the Peer chose in code checks
   that shape rather than inventing it. Code means a path that is not a test by the profile's own `testPath`. Where
   a name is looked for is the plugin's, the same for every template.
3. No unsettled name: nothing is asked. Otherwise the reflex gets the hunk and the unsettled names, and asks two
   questions: whether the test uses one of them as part of the code under test, and whether it builds a fake, stub or
   adapter that gives the code under test one of them.
4. Past `consider`, a candidate goes to the Watcher with the brief beside it; past `tell`, an attention goes to the
   Peer's Lead at once.

The same two questions are asked over a hand-back's test diff, as `judgement` evidence for the Lead (`REFLEX.md`).

### The Watcher

A role in the profile (`templates/slp/roles/watcher.md`), seated under the root over the scopes it watches. It writes
nothing and speaks only to the Supervisor; what it attends to reaches the owner of the watched agent's scope.

- **Model.** The profile names one of the Human's Paseo agent profiles: a cheap model with a long context.
- **Tools.** `look` (an agent's items between two points), `record` (a scope's brief, findings, reports, and earlier
  attentions with what came of them), `diff` (a scope's change at a commit), `attend`, `pass`. No shell and no files.
- **Woken by** a message listing new candidates, or by the sweep. Messages that arrive while it works go as one, so
  candidates batch themselves.
- **A candidate** comes with the agent, scope, moment, probability, the item quoted with two items either side, the
  facts beside it, the scope's brief, and the earlier attentions on that agent and what came of them. The eye puts
  the items and the facts it has counted of that agent (a call that keeps failing, turns gone silent) on the
  observation; the brief and the earlier attentions are read when the candidate goes, the newest six, so it shows
  what its owner has done since. One attended or passed before it went is not sent.
  One may also come from a question the reflex asks of a brief, a plan's change, a kept finding or a report
  (`REFLEX.md`): it names the question and the agent that wrote the text, with the brief of the scope it was asked
  of. One about what the root's own agent wrote becomes an attention for the Human, shown in their view.

  ```text
  CANDIDATE v34 · trades-the-goal · 0.95 · a3 (peer, scope 1.1)
  why: "I'll send the direction as int8 to save bandwidth"
  before: thought: The goal names aim precision on mobile.
  before: said: Reading encode.ts.
  item: thought: I'll send the direction as int8 to save bandwidth
  after: edit src/net/encode.ts: +const dir = toInt8(angle);
  after: said: Encoded as int8.
  facts: the same call failed the same way 2 times
  Scope 1.1: Brief v1 (discovery)
  Goal: [l4] Encode directions
  Must hold:
  - [l5] int16 precision
  earlier about a3: t1 (struggling) to a2: acknowledged by a2
  `attend` or `pass` it with candidate v34.
  ```
- **A sweep** is a note that wakes it once `sweep.everyChars` of new work has gathered: each active agent's newest
  items since the last sweep, an equal share each up to `sweep.digestChars`, with a count and `look` for the rest.
  What it sees there it attends to with no candidate.
- **Every candidate is attended or passed.** Each opens an obligation on the Watcher, so a restart loses none; a pass
  is a label the reflex's thresholds are later set from.
- **Its memory is the log.** Its context is compacted when full, and a new Watcher is seated from the record.

## What reaches the owner

An attention is an observation (KERNEL §4.9) delivered to the owner of the watched agent's parent scope:

```text
ATTENTION 2 of 3 · L2-T4 Peer · trades-the-goal · watcher · now
why: "drop direction to int8, the jitter should be fine" while the goal names aim precision on mobile
facts: 3 rewrites of net/encode.ts this turn
at: history 8812–8840 · look for more
```

- It wakes its reader when marked `now`, never inside its turn; `later` waits for the next message that asks
  something. The reflex's sure answers are `now`; the Watcher chooses.
- Several on one agent in one turn go as one numbered message. The watch may combine its own reports; it never
  combines the agents' words.
- Its reader reads more with `look`, so its context holds quotes and pointers, not transcripts.
- `mark_noise` stops one moment for one agent and scope (V1's rule 8).

## How: the owner's open question

What the owner does is its judgement. A Lead: nothing, one open question at its Peer's turn boundary, a finding
upstream, a reseat (`steering`). The Supervisor: nothing, one open question, a blind design asked of the Lead, a hold,
or the Human (`attention`). The craft is the same in both skills: ask about the area and never the fault, presuppose
nothing so that "no" is easy, one question, no anti-pattern named, and nothing that shows a watch exists.

## Measured, and taken away

- For each moment and tier, the look back reads how many attentions their owner acted on, and after how many the
  agent changed something within its next turns: a finding, an amendment, a commit that undoes the work, a question
  to its Lead.
- An attention that arrived after the work it concerns was integrated counts toward "interventions that came too
  late" (§10.3).
- The Watcher's passes and attentions label the reflex's candidates, and the owners' acts label the Watcher's.
  Thresholds are set from those labels at the look back, never by code.
- A moment that never leads to a change leaves the profile at a look back, with the others that did not
  (`retrospective`, The watch's upkeep).

## While the Human is away

The Human's attention is what runs short across many long projects. The Human surface keeps a view of everything
since they last looked:

- The decisions made for them.
- The disagreements still open.
- The attentions, who they went to, and what each owner did.
- The alarm, when the classifier cannot be asked.

The view is built from the record, one line an item. What the Supervisor says about it is its own words. Reading it
aloud is a matter for the surface.

## With parts missing

| Present                    | The watch                                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| All                        | As above                                                               |
| The classifier's host unreachable, or its key missing or for another host | Facts and sweeps go to the Watcher, and a standing alarm on the project's page tells the Human |
| No classifier in the template, or switched off by the Human | The same, and nothing is said: it is a choice |
| No Watcher role            | Only the reflex's `tell` answers and the facts that need no judging reach the owners |

Every other part of Seatworks works the same in each case.

**Without a classifier** the cascade keeps its first and its last tier. Code still counts the five facts and tells
them as before: a loop a third time is a candidate and a fifth an attention, silence, a finding left waiting, spend
past an appetite, a test's line changed. The Watcher still reads every watched agent's work, in the sweeps, and
looks there for each moment its prompt names, since no candidate names one for it. What is lost is what only a
reading of meaning gives at the moment it happens: the questions asked of a brief, a plan's change, a kept finding
and a report; the `judgement` evidence on a hand-back; whether a red check failed on the environment beyond the
known patterns; and the notice of a moment within the turn it showed in, which now waits for the next sweep. A
template made to run without one sets `sweep.everyChars` lower, so a sweep comes sooner.

## What V1 did that Seatworks keeps and drops

| V1                                                        | Seatworks                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| The eye on words and thinking, at turn end and in long turns | Kept at a turn's end; inside a turn Paseo tells a plugin nothing  |
| Moments and anti-patterns as data                         | Kept, with `trades-the-goal` and `mints-an-api` added                |
| W speaks to the Supervisor only; noise marking; the watched never know | The watched never know and noise marking kept; attentions go to the owner above the work, climbing if left |
| A 30 s tick over every seat                               | The stream's events, and a sweep only where there is new work        |
| Four brain modes and their switches                       | One cascade; a part is absent or present                             |
| An incident book beside the ledger                        | Observations in the one log                                          |
| Forty tuning values; a `next` line of advice              | A few numbers, each with its reason; facts only                      |

## To check before building on it

- How much thinking each agent shows through Paseo's stream: whole, summarized, or none.
- What the Watcher costs on the first real lane, against the attentions that led to a change.
- The `mints-an-api` patterns and the settled sources against the tests Peers really write: which names they catch,
  which they miss, and how often nothing is left to ask.
