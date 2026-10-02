# Kernel

The kernel is the team's authority ledger. It checks what CONCEPT-V2 says must hold, records what it says must be
known, and keeps what is owed. It decides nothing technical, ranks nothing, and knows no role by name. `WORKFLOW.md`
says how a team moves through it; `COMMUNICATION.md` how words travel; `PORTS.md` what it asks of the satellites.

MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Boundary

The kernel:

- MUST refuse a command that breaks an invariant (§5), and only then. It MUST NOT refuse for any other reason: no
  quota, no required review, no required order of work.
- MUST record every accepted command as events (§7), with who called it, when, and the lines it wrote.
- MUST NOT decide acceptance, judge evidence, pick a result, or rank what a reader should read first. Those are the
  roles'.
- MUST NOT compare a role to a name. It reads the properties the profile gives each role (§2).
- MUST NOT do I/O, read the clock or make an id. It is a decider (`CORE.md`): `decide` turns a command into events or
  a refusal, `evolve` folds an event into the state, and `react` names the effects an event asks for. The shell
  stamps time and ids, carries effects to the satellites and their facts back. It is TypeScript in the plugin's
  `shared/` folder, importing nothing, so the daemon and the app run the same fold (`STACK.md`).

## 2. The profile it reads

A profile is data: roles as sets of properties, and what each may call. Another arrangement of the team is another
profile, with no change to the kernel. A role renamed with its properties kept behaves the same.

A project runs one profile, named when the project is opened and kept on its record with the hash of its files then,
and with the hash of each set of them it takes after (`TEMPLATE.md`, A project's own copy). The kernel reads neither: it is handed the profile's roles. A profile arranges a team and words what
its agents read; it never gives the kernel a reason to refuse (§1), brings no code, and does not rename a command.

| Property    | Meaning                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `root`      | Owns the project's root scope. Exactly one role has it.                                   |
| `delegates` | May own a scope that is split into child scopes, and integrate them.                      |
| `writes`    | May be the writer of a scope.                                                             |
| `reading`   | Is seated on one commit, writes nothing, and returns a verdict.                            |
| `watches`   | Writes nothing, is given the words of the agents in the scopes it is seated over, and reports what it sees. |
| `spawns`    | The roles it may seat under a scope it owns.                                              |
| `speaksTo`  | Relations it may message: `parent`, `children`, `descendants`, `human`.                   |
| `humanDoor` | May put a question to the Human.                                                          |
| `tools`     | The commands it is shown, by name. A name that is no tool of the team's fails the profile's loading. |
| `like`      | Takes the properties of another role, then its own on top.                                |

Prompts, skills, models and harness choices are in the profile too, but the kernel does not read them.

The profile also names the sections a report has, each with what it holds (`TEMPLATE.md`, The report's sections).
The kernel reads their names to keep a report to them, and has no rule on what any holds.

The SLP profile, from CONCEPT-V2 §3, is `templates/slp/profile.yaml`. The properties the kernel reads from it:

| Role       | Properties                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------- |
| supervisor | `root`, `delegates`, `humanDoor`; spawns lead, peer, watcher; speaks to the Human, children, descendants |
| lead       | `delegates`; spawns peer, reviewer; speaks to its parent and children                        |
| peer       | `writes`; speaks to its parent                                                               |
| reviewer   | `reading`; speaks to its parent                                                              |
| watcher    | `watches`; seated under the root, so its parent is the Supervisor's                          |

A Supervisor that seats a Peer straight under the root is the path for a small change done by one agent (P17).

## 3. Actors and scopes

- **Actor.** An agent or the Human. An agent has one role and is bound to one scope while it lives. The Human is not
  seated; they speak to anyone and answer questions, and they stand where the root's parent would: whatever the
  owner of a scope's parent may do to a scope, the Human may do to the root.
  - An agent calls the kernel through its own tool server, which carries a key the shell made for that agent when it
    was created. The caller is the agent the key belongs to, never a name in the arguments (`PORTS.md`, Tools).
  - A turn that fails (the host's error, a model's limit) keeps the seat and is a fact for the owner of its parent
    scope. When the plugin's own words began it, they are sent again once first, saying the turn failed and why: the
    host's error, not the reader, ended it (`COMMUNICATION.md`). A turn cancelled is the Human's stop and gets nothing. An agent that is gone leaves its seat empty; what it owed and what waited for it moves to that owner,
    until they reseat or drop the scope.
- **Scope.** A piece of the work. Fields: `id`, `parent` (none for the root), `owner` (an actor), `writer` (an
  actor or none), `kind` (`work`, or `reading` bound to a commit), `paths` (what it may write), `after` (scopes it
  waits for), `brief` (current version), `plan` (for a scope that delegates), `workspace`, `status`, `held`.
  - Status moves `open → integrated | dropped`. A scope integrated into its parent stays on the record.
  - A child's `paths` lie within its parent's. A `reading` scope has none.
  - A scope whose actor `watches` names the scopes it is `over`; the root's watcher is over every scope.
  - A scope whose owner `writes` has itself as writer. A scope whose owner `delegates` has no writer.
- **Edges.** The five relations of CONCEPT-V2 §2.2, as data: `spawned` and `owns` follow from scopes; `dependsOn`
  from `after`; `mayChange` and `mustTell` are kept as edges that the owner of the scope they sit in may add or
  remove, with a reason. Every edge change is an event.

## 4. What the kernel keeps

### 4.1 Lines and their origin

Every line of a plan, a brief, a report or a decision is a **line**: `{ id, text, origin, at, via }`.

- `origin` is the actor whose command wrote it, set by the kernel from the caller, never from arguments.
- A line MAY be marked the Human's only when `via` points to something the Human said on the record: a message they
  wrote or an answer they gave. Otherwise it is the writer's.
- `via` MAY also point to the finding or question that brought the line.

### 4.2 Plan

The owner's hypotheses for its scope (CONCEPT-V2 §5.2): `goal`, `limits`, `unknowns` (each with how it will be
checked), `appetite` (what the scope is worth spending), and `terms`: the domain's words as they were settled, each a
line defining it and the words it stands in for. Lines, each with its origin. Amended by the scope's owner; a term
settled again under the same word replaces the old line, so one the Human settled changes only on their word (I6).

An appetite that names an amount of money or of hours also carries it as a number. What each agent spends is recorded
turn by turn from the agent host's usage, and `status` sets what a scope and its children have spent beside it. The
host reports what an agent's session has spent so far, so a turn's share is the rise since its last report; a report
lower than the last means the session started again, and all of it is new. A
scope that passes its appetite is a fact for the owner above it: a change to what the work may cost is the Human's
(I6), and passing the amount is how code notices one.

### 4.3 Brief

What the parent's owner asks of a scope (CONCEPT-V2 §5.3–5.4): `goal`, `constraints`, `choices`, `context`, and
`kind`, `verification` or `discovery`. Versioned: an amendment makes a new version, keeps the old, and carries a
reason. Only the owner of the parent issues or amends it.

### 4.4 Finding

A premise, constraint or choice that the evidence shows does not fit (CONCEPT-V2 §6.1).

- Fields: `id`, `scope` (where it was raised), `raisedBy`, `disputes` (a line, or none for a new fact), `about` (the
  scope the change would be in, when not the raiser's own), `text`, `evidence` (ids), `default` (what the raiser does
  meanwhile).
- It is answered by whoever may change what it disputes: for a brief line, the owner of that scope's parent; for a
  plan line, the scope's owner; with no line, or for a change in another owner's scope (`about`), the owner of the
  raiser's parent, who takes it on from there. When that seat is empty the finding climbs to the next owner seated
  above it, and past an empty root to the Human.
- Status:

| Move       | From              | To         | Requires                                                            |
| ---------- | ----------------- | ---------- | ------------------------------------------------------------------- |
| raise      | —                 | raised     | text; an obligation opens on whoever answers                        |
| classify   | raised            | carried    | verdict `changes`, a reason, and the change events it made          |
| classify   | raised            | kept       | verdict `alternative` or `minor`, and a reason the raiser can argue |
| wait       | raised            | waiting    | a question to the Human (§5, I6)                                    |
| resume     | waiting           | raised     | the Human's answer                                                  |
| reopen     | kept              | raised     | new evidence                                                        |
| withdraw   | raised, waiting   | withdrawn  | by the raiser, with a reason                                        |

### 4.5 Evidence and claims

- **Checks**: the project's own commands that prove a commit, `[{ name, run }]`, set for the project with `set_checks`
  and run by the evidence runner on each hand-back. `run_checks` runs them, or commands named for one scope, on any
  commit, so a Lead can prove acceptance with tests the writer did not write.
- **Evidence**: `{ id, kind, subject, result, by, at, conditions }`. `kind` is `check` (a command run), `verdict` (a
  reading scope's answer), `measurement`, `judgement` (the reflex's answer on a commit, `REFLEX.md`), or `human` (their
  word on the record). `subject` is the commit it is about. `conditions` says, for a measurement, whether the machine
  was held.
- **Claim**: what an agent says of its own work, such as a hand-back. Recorded as a claim, never as evidence.

### 4.6 Obligation

Something owed: `{ id, owedBy, owedTo, about, opened, closed?, how? }`. Opened by a finding, a message that asks for
an answer, an intervention, a question to the Human, a hand-back waiting on its integrator.

- It closes only when what is owed is done: answered, classified, carried, integrated or sent back, declined with a
  reason.
- When its holder is replaced, it moves to the new holder. Time and cleanup never close it.

### 4.7 Messages and questions

- **Message**: `{ id, from, to, text, asksAnswer, directs, replyTo }`. Routed along the sender's `speaksTo`.
  `directs` says it changes what the reader is to do; an open question does not. What the Human
  types straight into an agent's chat is recorded as a message from the Human that directs, so the change is followed
  until it reaches the shared state and the Human sees whether it did (CONCEPT-V2 P11, §9.4); the Human asks an open
  question through their surface.
- **Question**: from the role with `humanDoor` to the Human: `{ id, text, about, options?, recommend?, answer? }`.
  `about` names the finding or line that waits on it.

### 4.8 Holds

- **Scope hold**: while held, nothing new is seated in the scope and nothing is integrated from it. Set and lifted by
  the owner of its parent, or by the Human.
- **Machine hold**: an actor measuring holds the machine; while held, the kernel defers the effects that would load it
  (evidence runs, workspace setup) and starts them when it is released. The hold is the machine's, not the project's:
  every project's kernel on the machine sees it and defers the same way, since another project's build spoils a
  measurement as surely as this one's (CONCEPT-V2 §8.4, P13).

### 4.9 Observations

What the reflex answered about an event (`REFLEX.md`): `{ id, question, subject, model, answer, at }`, recorded with
the bridge as caller. Past its question's threshold it is also delivered as a note along the relation the question
names, as evidence of kind `judgement`, or as a fact for the actor it concerns (`REFLEX.md`). Between its question's two
thresholds it is a **candidate** for the actor that `watches` over its scope, and opens an obligation on that actor,
closed by `attend` or `pass`. An attention, whether the reflex's or an `attend`, is delivered to the owner of the
watched actor's parent scope (`STEERING.md`).

- Its reader has **acted on** it when a command of theirs names the watched actor or its scope after the attention
  arrived: a message to it, a brief amended, a finding raised, a hold, a reseat, a release, `acknowledge` or
  `mark_noise`. What the command said is the reader's own; the kernel only sees that one was made.
- One not acted on by the end of its reader's next turn, whose scope is still open, goes up one owner as
  `attention_climbed`, with the first reader's silence beside it. At the root it climbs no further: the Human's view
  shows it.

## 5. Invariants

The kernel MUST refuse a command that would break one of these, and MUST NOT refuse for any other reason.

| #   | Invariant                                                                                                            | CONCEPT-V2 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| I1  | A scope has at most one writer; paths move between sibling scopes only through a handover event, so a path is never written from two scopes at once. | §4.2       |
| I2  | An actor that delegated a scope does not write the paths its open children hold.                                    | §4.2       |
| I3  | Open sibling scopes whose paths overlap are ordered by `after`, so two never write the same path at once; `after` makes no cycle, since a cycle would leave each waiting for ever. | §4.2 |
| I4  | Integrating a scope cites evidence whose subject is the commit being integrated. A failing result is integrated only with a reason. | §8.3, N1 |
| I5  | Only a scope's writer changes its paths, only its parent's owner its brief, only its owner its plan.                  | §4.2, §4.3 |
| I6  | A change to the goal or appetite, or to a line whose origin is the Human, cites the Human's answer.                   | §7.3, §9   |
| I7  | A message to an actor from outside its own scope and its parent's owner (the Human counts as the root's) gives that owner a copy; one that `directs` also opens an obligation on the owner, closed when it is carried in or declined with a reason. | §7.2, §9.4 |
| I8  | A finding classified `changes` points to the change events it made; one kept carries a reason.                      | §6.3, §6.4 |
| I9  | Lines carry the origin the kernel set; a line is the Human's only via something the Human said.                     | §9.2       |
| I10 | Only a role with `humanDoor` asks the Human; a message is sent only along the sender's `speaksTo`.                   | §3.1, §7.3 |
| I11 | An obligation closes only when what is owed is done; it moves with its holder.                                       | §4.5       |
| I12 | An observation changes only the record: it moves no line, finding, scope or hold, opens no obligation but a candidate's on its watcher, answers nothing, and is delivered only as a note that asks nothing, as `judgement` evidence, or as a fact for the actor it concerns. | N1, N6     |

## 6. Commands

A command is called by an actor and checked against its role's properties and the invariants. Each maps to a tool in
`tools/`; the profile says which roles are shown which.

| Command            | Who may call                                        | Does                                                                     |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `open_scope`       | owner of the parent, whose role `spawns` the role    | Opens a child scope with its brief, seats an actor of that role          |
| `amend_brief`      | owner of the parent                                 | New brief version, with a reason and the finding it carries if any       |
| `set_plan`, `amend_plan` | owner of the scope                            | Sets or amends the plan's lines (I6 for goal and appetite)               |
| `add_edge`, `remove_edge` | owner of the scope the edge sits in          | `dependsOn`, `mayChange`, `mustTell`, with a reason                      |
| `handover`         | owner of the parent                                 | Moves paths from one child to another in one event; they are written by the receiving scope's writer |
| `raise_finding`    | any seated actor                                    | Opens a finding                                                          |
| `classify_finding` | whoever answers it (§4.4)                           | `changes` with change events, or `alternative` / `minor` with a reason   |
| `withdraw_finding` | the raiser                                          |                                                                          |
| `reopen_finding`   | the raiser                                          | Reopens a kept finding with new evidence                                 |
| `hand_back`        | the writer, or the owner of a scope that delegates   | Records a claim at a commit; asks for evidence on it                     |
| `record_verdict`   | the actor of a reading scope                        | Records its verdict as evidence on its commit                            |
| `record_evidence`  | the bridge, for a satellite's result                 | Records evidence                                                         |
| `record_turn`, `record_workspace`, `record_agent`, `record_gone`, `record_delivery`, `record_candidate`, `record_integration`, `record_profile`, `record_publish`, `record_permission`, `record_permission_settled`, `record_human_words`, `record_observation` | the bridge, for a fact | Records what a satellite or the agent host reported (`LEDGER.md` §5) |
| `set_checks`       | owner of the root, or the Human                      | Sets the project's checks                                                |
| `run_checks`       | owner of the parent, or the writer                   | Runs the project's checks, or named commands, on a commit of the scope   |
| `integrate`        | owner of the parent                                 | Brings the scope into its parent (I4)                                    |
| `send_back`        | owner of the parent                                 | Does not integrate, and says why                                         |
| `reseat`           | owner of the parent                                 | A new actor on the same scope, briefed from the record; obligations and undelivered messages move |
| `drop_scope`       | owner of the parent                                 | Closes the scope unintegrated, with a reason                             |
| `hold_scope`, `resume_scope` | owner of the parent, or the Human         |                                                                          |
| `report`           | owner of the scope                                  | Lines for its parent's owner, under the sections its profile names       |
| `send_message`     | any actor, along `speaksTo`                         | Records the message; delivery carries it (I7)                            |
| `answer`           | whoever an obligation is owed by                    | Answers a message or question                                            |
| `ask_human`        | a role with `humanDoor`                             | Opens a question                                                         |
| `answer_question`  | the Human                                           |                                                                          |
| `hold_machine`     | any seated actor                                    | Holds or releases the machine                                            |
| `answer_permission` | owner of the asking agent's parent scope, whoever its obligation moved to, or the Human | Allows or refuses what an agent's harness asked leave to do, with a reason |
| `mark_noise`       | whoever an attention goes to                        | A moment of the watch is not told again for one actor and scope          |
| `acknowledge`      | whoever an attention goes to                        | Says it was seen and needs nothing now; the attention climbs no further  |
| `attend`, `pass`   | an actor that `watches`                             | Sends a candidate or a moment of its own to the owner above the work, or records it passed, with a reason |
| `release`          | owner of the parent                                 | Ends an actor's seat; its scope stays                                    |
| `publish`          | owner of the root, or the Human                     | Pushes a landed branch to the project's remote, never forced             |

Integrations into one scope MUST run one at a time: bring the parent in, run evidence on the result, then integrate.

## 7. Events and state

- State is a fold over an append-only log of events. Each event: `{ seq, at, by, command, commandId, payload }`.
  Every command carries an id; one seen before returns its earlier result and appends nothing.
- The log is the record. The chain of change, every line's origin and every open obligation are read from it, never
  kept beside it.
- Snapshots MAY be kept to fold faster. They are caches: removing one loses nothing.
- Effects carry a key made from the event that asked for them, and are written in the same transaction as it. A
  satellite that sees a key twice does the work once, and a fact that carries a key already seen is dropped.
- On restart the kernel folds the log. Open obligations are open again; effects without a result are asked again.

Every event and its payload is in `LEDGER.md` §6, with the state it folds into (§3) and the effects each asks for (§8).

## 8. Views

Read models over the log. Nothing in them is kept apart from it.

- **What the Human needs to know** (CONCEPT-V2 §9.2): the brief each actor works to, which lines are the Human's,
  which decisions an actor made, which findings and disagreements are open. And for each message the Human sent
  straight to an agent, whether it was carried in (§9.3).
- **Chain of change**, per finding (§10.1): what the brief said when the work was given; how long until it was
  classified; what was found; the evidence and any verdict; which owners the change reached; what was integrated
  after it.
- **Signals** (§10.3), as ratios, never as rules: findings on the same line or paths again and again; questions to
  the Human that led to a change; reviews and checks whose result led to a send-back or an amendment; interventions
  carried in late; messages, the reflex's notes among them, followed by no change.
- **Open obligations**, by holder.
- **Status** of a scope for its actors: its brief, its children, its edges, what waits on whom, and what it and its
  children have spent beside its appetite.

## 9. What the kernel does not do

It does not rank a reader's messages, merge findings it thinks alike, cap what anyone says, require a review, choose
a model, write a prompt, or turn a signal into a rule. Each of those would change how SLP works instead of serving it.
