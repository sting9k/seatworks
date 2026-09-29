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

## What the plugin does not do

- Rank, merge or filter a reader's messages: what matters first is the reader's call.
- Cap how much anyone may say.
- Require fields in a message beyond what the concept asks for: a brief's three parts, a finding's evidence, a reason
  for keeping the plan.

A Lead drowning in messages is a finding about the team, not a fault for the plugin to fix. The record shows it (how
long answers wait, how many messages each lane carries), and the look back decides: split the lane, change how Peers
report, or leave it.
