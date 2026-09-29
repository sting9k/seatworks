# Communication

The plugin carries what agents say; it never changes how they work. Who may speak to whom, and what a message asks,
are the concept's and the agents'. The plugin delivers, records, and keeps what is owed.

## What the plugin does

- **Delivers every message, durably.** A message never lands inside a reader's turn: messages waiting for a reader
  go as one, numbered, in the order they came.
- **Keeps what is owed.** The sender says whether a message waits for an answer. One that does stays open until it
  is answered, whoever reads it and however long it takes; nothing that cleans up closes it.
- **Routes along the edges the profile declares.** Who speaks to whom is data in the profile, so another arrangement
  needs no code.
- **Tells the Lead.** A message from the Supervisor or the Human straight to a Peer gives its Lead a copy. One that
  directs stays open until the change reaches the lane's state; an open question does not. This is the one constraint
  the concept asks of the plugin.
- **Adds facts, never advice.** A message may carry what the record knows (the brief line it cites, the commit it names,
  who is waiting on it). The plugin's own facts travel the same way: an edit that appears to break a rule the project
  wrote, quoted; words that never reached the record; a red check that failed on the environment (`REFLEX.md`). A fact
  asks nothing, so it never wakes its reader on its own. It never carries what to do, an order of importance, or a
  judgement that two messages are the same.
- **Makes reading easy.** Every agent can read any scope's brief, hand-backs and branch. A Peer that needs to know
  something reads it; one that needs something changed asks its Lead. Nothing narrows what an agent may read
  (CONCEPT-V2 §4.3, N2).

## The SLP profile's edges

Drawn from CONCEPT-V2 §3.1, §4.3, §7.2 and §9.4.

| From       | Speaks to                                           |
| ---------- | --------------------------------------------------- |
| Human      | the Supervisor; any agent, its Lead told            |
| Supervisor | the Human, the Leads; a Peer, its Lead told         |
| Lead       | the Supervisor, its own Peers                       |
| Peer       | its Lead: findings, questions, hand-backs, requests |
| Reviewer   | its Lead                                            |
| Watcher    | the Supervisor                                      |

A Peer does not message another Peer: it reads the other's work, and asks the owner for a change through its Lead.
An edge between Peers would be a change to the concept, the owner's to make in the profile.

## The mailbox

Every seat has one mailbox: the queue between the roles. It belongs to the seat, the scope and the role it holds, not
to the agent sitting in it, so a Peer reseated on the same scope finds its mail waiting.

**A message's life.**

```text
sent ──► queued ──► delivered ──► answered        (if it asks for an answer)
           │
           └──► moved, when its reader is reseated or released, to whoever holds the seat or the owner above
```

- **Sent.** `send_message` is a command; the kernel checks the edge (I10) and records `message_sent`. In the same
  transaction the delivery is written as an effect keyed by the message (`CORE.md`), so a message is never recorded
  without being queued, nor queued without being recorded.
- **Queued.** In the reader's mailbox, in the order the log recorded them. Nothing is ranked, merged or dropped.
- **Delivered.** When the reader is between turns, everything queued for it goes as one message, numbered, oldest
  first, with each item's sender, what it asks, and what the record knows of it. The key the agent host sends with
  it is made from the keys it carries, so a delivery tried twice lands once. A batch too long for one message is
  sent as several in a row, never cut.
- **Answered.** A message that asks for an answer keeps its obligation open (I11) until the reader answers with
  `answer` and `replyTo`, whoever reads it and however long it takes.

**When a reader is woken.**

| What is queued                                                  | A reader between turns                  | A reader inside a turn        |
| --------------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| Something that asks: a question, a direction, a finding, a hand-back, an answer it is waiting on, an attention marked `now` | Woken now, with everything queued | Delivered when the turn ends |
| Only what asks nothing: a copy, a fact, a note, an attention marked `later` | Not woken; goes with the next delivery | Waits the same way       |

A turn's end is a fact from the agent host (`PASEO.md`). A delivery sent as a turn starts that the host refuses as
busy waits for the next turn's end; it is never pushed into the turn.

**What the Human types** straight into an agent's chat is not queued: Paseo delivers it, and the kernel records it as
a message from the Human (`KERNEL.md` §4.7). What the Human sends from their surface goes through the mailbox like
anyone's.

**What the sender sees.** `status` shows each of its messages as queued, delivered or answered, and when. A sender
never has to poll: an answer is a message that asks, so it wakes the sender.

## What the plugin does not do

- Rank, merge or filter a reader's messages: what matters first is the reader's call.
- Cap how much anyone may say.
- Require fields in a message beyond what the concept asks for: a brief's three parts, a finding's evidence, a reason
  for keeping the plan.

A Lead drowning in messages is a finding about the team, not a fault for the plugin to fix. The record shows it (how
long answers wait, how many messages each lane carries), and the look back decides: split the lane, change how Peers
report, or leave it.
