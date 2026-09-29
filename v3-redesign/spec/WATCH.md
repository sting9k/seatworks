# Watch

W, the watch, is SLP's attention checker. An agent often gets something wrong not because it cannot do it but
because it has not spent its attention there: it writes a long, wrong test, and one question later sees the fault
itself. A question makes it spend its reasoning on what it is likely to get wrong. A closed question ("you are
breaking an anti-pattern") makes it look for something to confess, to please; an open one leaves it neutral. So a
small word from the Supervisor at the right moment is worth more than any rule.

That leaves two questions: **when** to draw an agent's attention, and **how**. The watch answers when; the
Supervisor answers whether, and how. The plugin finds the moments cheaply, carries them to the Supervisor without
filling its context, and measures which ones were worth it. It never speaks to the agent it watches and never
decides.

This reverses WORKFLOW's earlier decision that the record comes first: the owner wants the watch back, reading the
words and thinking of Leads and Peers as they work.

## When: moments, as data

A moment is something that bears on the design or the implementation while it can still be changed cheaply. The
starting set in the SLP profile, from the concept and from the author's own practice:

| Moment              | Seen when                                                                                   | Watches      |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| big-decision        | It settles a structure, boundary, data shape or contract that other work will build on       | Lead, Peer   |
| struggling          | It says it does not know, or guesses, what a requirement, term or piece of code means        | Lead, Peer   |
| turning             | It drops the approach it was on for another                                                  | Lead, Peer   |
| admits-wrong        | It says something it did or claimed earlier was wrong                                        | Lead, Peer   |
| trades-the-goal     | It gives up a quality the goal names (precision, latency, bandwidth) to meet another, such as sending a direction as int8 instead of int16 to save bandwidth | Peer |
| mints-an-api        | A test calls a function, type or field that neither the code nor the brief has, so the test invents the contract the code will then be bent to fit | Peer |
| obeys-against-judgement | It says it does what it thinks is wrong because it was told to                           | Peer         |
| builds-a-stand-in   | It plans a stub, fake, shim or second copy of state to fill a gap                            | Peer         |

When is each owner's craft, so it is data: `profile/<name>/watch.yaml` holds the moments, their questions and
thresholds. The anti-pattern list they draw on is shared across projects (`reference/ANTIPATTERNS.md`); a project
adds moments of its own only when a look back shows its agents keep making one mistake. A profile with no moments
has no watch, so a team that works another way loses nothing.

## Three ways of seeing, cheap to dear

| Tier     | What it is                                                                                     | Runs                                    |
| -------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| Code     | Facts counted from the stream: the same failing command run again, a test file written before the code it tests exists, a turn far longer than the agent's usual, a compaction, a context nearly full, an edit outside the scope's paths | On every item                           |
| Reflex   | Jev, asked one moment at a time about the new words and thinking since the last look (`REFLEX.md`) | At each turn's end, and every few items during a long turn |
| Watcher  | A role in the profile, on a cheap model with a long context, that reads a scope's recent work as a whole and sees what one window cannot: going in circles, drift from the brief, a lane quietly deciding what its Lead did not | On a period the profile sets, and only when there is new work since its last look |

Each tier reports on its own and is measured on its own. The Watcher is the crude way that still works: a cheaper
model reading everything every so often, which tells the Supervisor when it meets what it cannot judge. The reflex
is the fine way: a moment seen in the sentence it happens in. A profile may run either or both.

`mints-an-api` needs the code as well as the words. When a Peer edits a test, the code index lists the names the
test calls that exist neither at the scope's base nor in its brief, and the reflex is asked about that hunk with
that list beside it.

## What reaches the Supervisor

An **attention** is an observation (KERNEL §4.9) delivered to the root:

- The agent, its scope, the moment, which tier saw it, the probability, the code facts beside it, a quote of at most
  a few hundred characters, and where in the agent's history it sits.
- It wakes the Supervisor, but never inside its turn. Several attentions on one agent in one turn go as one numbered
  message. The watch may combine its own reports; it never combines the agents' words.
- The Supervisor reads more with `look` (an agent's history between two points), so its context holds quotes and
  pointers, not transcripts.
- The Supervisor may mark a moment noise for one agent and scope. It is not told of that moment there again (V1's
  rule 8).

## How: the Supervisor's open question

What the Supervisor does with an attention is its judgement: nothing, one open question to the agent, a council, a
hold, or the Human. The skill it works from holds the craft, not the code:

- Ask about the area, never the fault. Presuppose nothing; "no" must be an easy answer.
- One question, and never the name of an anti-pattern.
- Examples. For a test: "What does this test assume about the interface it calls, and where was that settled?" For
  int8: "Does this change what the goal promised anyone, and who should weigh it?" For a big decision: "Which of this
  rests on your Lead's decisions, and which does it make?"

A question to a Peer goes with a copy to its Lead, as every word from the Supervisor to a Peer does. An open question
directs nothing, so it opens no obligation on the Lead (KERNEL I7). If the Peer then changes direction, it raises a
finding with its Lead, the ordinary path, and the change comes back to the lane's state.

## Measured, and taken away

- For each moment and tier, the look back reads how many attentions the Supervisor acted on, and after how many the
  agent changed something within its next turns: a finding, an amendment, a commit that undoes the work, a question
  to its Lead.
- An attention that arrived after the work it concerns was integrated counts toward "interventions that came too
  late" (§10.3).
- A moment that never leads to a change leaves the profile. A threshold is never tuned by code.

## While the Human is away

The Human's attention is what runs short across many long projects. The Human surface keeps a view of everything
since they last looked:

- The decisions made for them.
- The disagreements still open.
- The attentions and what the Supervisor did with each.
- The facts that should alarm: a refused destructive command, two lanes measuring at once, a test that failed and
  then passed on the same commit.

The view is built from the record, one line an item. What the Supervisor says about it is its own words. Reading it
aloud is a matter for the surface.

## How it runs

- The eye reads the agent host's stream: words, thinking and tool calls. After a reconnect it fills the gap from
  history (PASEO rule 5). How much thinking each agent exposes through Paseo differs and is checked per agent.
- Nothing waits on it, and it never runs in a hook that can refuse.
- The Watcher is seated like any role, through the harness: it reads, writes nothing, and speaks only to the
  Supervisor.

## What V1 did that v3 keeps and drops

| V1                                                        | v3                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| The eye on words and thinking, at turn end and in long turns | Kept                                                              |
| Moments and anti-patterns as data                         | Kept, with `trades-the-goal` and `mints-an-api` added                |
| W speaks to the Supervisor only; noise marking            | Kept                                                                 |
| A 30 s tick over every seat                               | The stream's own events; the Watcher's period only when there is new work |
| The sensor's yes feeding the Watcher seat, in four modes  | Tiers that report and are measured on their own                      |
| An incident book beside the ledger                        | Observations in the one log                                          |
| Forty tuning values; a `next` line of advice              | A threshold for each question with its reason; facts only            |

## Open, for the owner

- Whether agents' thinking may leave the machine for Jev's host or the Watcher's model, and on which route.
- Whether the Watcher runs by default, and on what period.
- That an open question opens no obligation on the Lead, only a copy (KERNEL I7).
