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
| Watcher    | the Supervisor; its attentions go to the owner above the work, through `attend` |

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
  it is made from the keys it carries, so a delivery tried twice lands once. One delivery holds 60,000 characters:
  a queue past that goes as several, the oldest first, the next at the end of the turn the one before began, each
  saying how many still wait. A message is never cut, and one longer than a delivery goes alone. A reader long idle
  under a busy team would otherwise be woken with its whole backlog in one message, past what its context holds.
- **Answered.** A message that asks for an answer keeps its obligation open (I11) until the reader answers with
  `answer` and `replyTo`, whoever reads it and however long it takes. The answer goes to whoever asked; when that one
  has left its seat, to whoever holds the seat now, or to the owner above an empty one, since an answer sent to an
  agent that is no longer there would be read by nobody. A note of the record's own asks nothing and is answered by
  nothing: an `answer` to one is refused, saying so.
- **Moved.** What waited unread goes to whoever is reseated, or with the seat left empty to the owner above. A
  message its reader had read and not answered is owed by the seat still: reseated, its new holder is sent it again,
  since it owes the answer and never read the question. While the seat is empty the owner above holds the debt, and
  `status` shows it the words. A delivery that was on its way when its reader left delivers nothing that has moved
  to another: the new reader still gets it.

**When a reader is woken.**

| What is queued                                                  | A reader between turns                  | A reader inside a turn        |
| --------------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| Something that asks: a question, a direction, a finding, a hand-back, an answer it is waiting on, an attention marked `now` | Woken now, with everything queued | Delivered when the turn ends |
| Only what asks nothing: a copy, a fact, a note, an attention marked `later` | Not woken; goes with the next delivery | Waits the same way       |

A turn's end is a fact from the agent host (`PASEO.md`). A delivery sent as a turn starts that the host refuses as
busy waits for the next turn's end; Paseo is never asked to push it into the turn, since a send there replaces the
turn. A reader waiting on a permission is inside its turn, so nothing reaches it until the permission is answered.

**Into a turn.** Waiting for a turn's end is right for a note and wrong for a direction: a Peer told to drop a
stand-in ten minutes into a turn builds on it for the rest of the turn, and a change of course that arrives late is
taken worse than one that arrives early (arXiv 2604.00892). A Peer that needs its Lead's answer waits out the Lead's
whole turn. Yet a message pushed in while a Lead thinks breaks the thought. The owner asked for a door at the right
moment with a buffer before it: "hook chặn/buffer ở tầng harness trước khi đẩy vào context". So a template may let
mail into a turn its reader is in (`intoTurn` in its profile, two numbers of seconds), and then:

- **The moment** is the pause between two steps: after the reader's tools have run and before its model is called
  again. Nothing is cut there: the reader is about to read what its tools returned, and reads the mail with it. Each
  harness has its own door at that pause (`HARNESS.md`, Mail into a turn); one that has none gets everything at the
  turn's end, as before.
- **What enters at the next pause**: a message that `directs`, anything from the Human, an answer to what the reader
  asked, an attention marked `now`, and the record's own note that the reader's brief was amended, its work sent
  back, its paths moved, its scope held or resumed, its finding classified or its question to the Human answered.
- **What enters once it has waited**: whatever else would wake an idle reader and comes from below or beside it, a
  Peer's question, a hand-back, a check's result. It waits `patience` seconds for the busy reader first: a short turn
  ends before that, and the mail goes as it always did.
- **What waits for the turn's end**: what asks nothing, and a question from an owner above, which costs more in the
  middle of the work than a minute later. A seat that watches gets nothing into a turn.
- **The buffer.** One entry holds everything that may enter, as one delivery, numbered, oldest first. After it the
  reader is left alone for `rest` seconds, so five questions land as one; a direction does not wait out the rest.
  An entry holds 9,000 characters, under what the narrowest door takes; what is past that says how many wait.
- **What it says first.** That it is mail that reached the reader while it works, and that nothing in it stops the
  work unless it says so: mail is information, and a reader told only to stop obeys less often than one told what
  changed.
- **Counted as read when it enters.** It is in the reader's own history from then on: a turn that fails after is
  started again with it there, so it is not sent a second time. Counting it only at the turn's end was built first
  and failed on a live run: a Peer taken in seconds after its hand-back, its last turn still open, left the direction
  it had followed to be moved to its Lead as unread. What is given up is a hook that dies between the plugin's answer
  and its own print: that mail is counted read and was not. An answer still owed for it shows in `status`.

The plugin still ranks nothing a reader reads: when an item may enter is settled by what it is and who sent it, the
sender's own marking and the scope graph, never by its words, and everything else still arrives, in order, at the
turn's end. Until 3 October 2026 nothing entered a turn.

An agent is told how it waits, since one that waits inside its turn waits for what cannot reach it. Its first words
say when mail reaches it, at its turn's end alone or also between two of its steps as its template has it, and that it
waits by ending the turn; each reply that promises an outcome later says the outcome comes once the turn has ended. On a live Paseo (3 October 2026), agents
told only that they would be told slept and looked again inside one turn: a Supervisor for seventeen minutes with
seven deliveries waiting, a Lead until the owner above reseated it.

**When a turn fails.** Words the plugin sent that began a turn the host's error ended (a provider's outage, a crash)
are sent again once, saying the turn failed and why, so the reader is not left idle with what it was asked. They are
not sent again as new words: the host keeps them in the reader's history, and a copy beside them would read as a second
message. If that turn fails too, its owner above is told, as for any failed turn. A turn cancelled is never sent again:
a stop is the Human's.

**What the Human types** straight into an agent's chat is not queued: Paseo delivers it, and the kernel records it as
a message from the Human (`KERNEL.md` §4.7). What the Human sends from their surface goes through the mailbox like
anyone's.

**What the sender sees.** `status` shows each of its messages that still waits: queued, or delivered and waiting for
an answer. One that was delivered and asks nothing, or was answered, is settled and no longer listed. A sender never
has to poll: an answer is a message that asks, so it wakes the sender, or whoever holds the sender's seat by then.

## What the plugin does not do

- Rank, merge or filter a reader's messages: what matters first is the reader's call. Letting a direction into a
  turn early (Into a turn) hides nothing and orders nothing within a delivery.
- Cap how much anyone may say.
- Require fields in a message beyond what the concept asks for: a brief's three parts, a finding's evidence, a reason
  for keeping the plan.

A Lead drowning in messages is a finding about the team, not a fault for the plugin to fix. The record shows it (how
long answers wait, how many messages each lane carries), and the look back decides: split the lane, change how Peers
report, or leave it.
