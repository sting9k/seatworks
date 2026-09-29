# Core

How the kernel and the shell around it are built, from what the systems that already run agents at scale settled on.
`KERNEL.md` says what the kernel keeps and checks; this says how it runs. Read on 29 September 2026.

## What others settled on

| System or pattern                      | What it settled                                                                                          | In v3                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| OpenHands (V0 to V1, and its SDK)       | One append-only event log is the load-bearing choice: the UI, the agents and the runtime never call each other, they read and append the same log, so every run replays by construction. Its V1 dropped the AgentController because it did not earn its keep | One log per project; nothing calls around it; no controller |
| The Decider (Chassaing)                 | Three pure functions: `decide(command, state) → events or refusal`, `evolve(state, event) → state`, and an initial state. Decide may refuse; evolve cannot fail, since an event is a fact | The kernel's shape                      |
| Functional core, imperative shell; Elm  | Logic in pure functions that describe effects; a thin shell performs them                                  | Kernel and reactors pure in `shared/`; the bridge is the shell |
| Temporal, Diagrid                       | A checkpoint is not durable execution: each effect is an activity whose request and result are recorded, and a restart re-issues only what has no result. Durability does not make a side effect safe to repeat: that takes an idempotency key | Effects in an outbox; each with a key |
| Transactional outbox and inbox          | The event and the effect it asks for commit in one local transaction; delivery is at least once, and the consumer drops what it has seen | Events and effects in one SQLite transaction; facts carry the effect id |
| LangGraph interrupts                    | A wait for a person is persisted state that resumes exactly where it stopped                              | Obligations and questions, already      |
| AutoGen core (actor model)              | Each actor holds its own state and handles one message at a time from its mailbox                          | One kernel per project, one command at a time; a mailbox per agent |
| Zanzibar and ReBAC; "Overlaying Governance" (2026) | Authority as relationship tuples, checked by walking the graph, so a delegation chain can be traced | Who may do what is read off the scope graph |
| Claude Code agent teams                 | A lead, teammates with their own context, a shared task list with dependencies, a mailbox                  | The same shape, plus what the analysis finds missing: origins, open disagreements, the lead told of direct words |
| Temporal's replay tests                 | Recorded histories run against new code before it ships                                                    | Recorded logs folded by new code in the tests |
| OpenTelemetry's GenAI conventions       | `invoke_agent`, `execute_tool`, `chat` spans in one trace                                                  | Event names that map onto them, if a trace is ever exported |

## The shape

```text
            tools (MCP)      Paseo hooks and API      Human's surface (RPC)
                 │                   │                        │
                 └──────── commands, each with an id ─────────┘
                                     │
                                     ▼
   shared/   decide(command, state) ──► events | refusal         pure, no I/O, no clock
             evolve(state, event)  ──► state
             react(event, state)   ──► effect intents, each with a key
                                     │
                                     ▼
   server/   one SQLite transaction: append events, insert effects (outbox)
                                     │
             dispatcher ──► satellites through their ports ──► facts, carrying the effect's key
                                     │
                                     └──► back in as commands (record_evidence, ...)
```

### The kernel is a decider

- `decide` checks a command against the state and the invariants (`KERNEL.md` §5) and returns events, or a refusal
  that names the invariant. A refusal is a value, never a throw; a throw is a bug.
- `evolve` folds one event into the state. It cannot refuse: the event already happened.
- `react` is the third pure function: from an event and the state after it, the effects the event asks for, each
  with a key made from the event's sequence and the effect's kind. Keeping it apart from `decide` means a command's
  rules and the work it starts can each be read and tested alone.
- None of them reads the clock or makes an id. The shell stamps each command with its time and gives it the ids it
  will need, so the same log folds to the same state wherever and whenever it is folded.
- One decider for the whole project, not one per scope: the invariants cross scopes (two siblings' paths, a Peer's
  Lead, an obligation moving), and a project's commands are few enough to take one at a time.

### Authority is read off the graph

The state keeps the relations as tuples, the way Zanzibar keeps permissions: `owns(actor, scope)`,
`parent(scope, scope)`, `writer(actor, scope)`, `watches(actor, scope)`, and the edges `dependsOn`, `mayChange` and
`mustTell`. "May this actor amend that brief" is a walk: is the actor the owner of the scope's parent? The profile's
properties say which walks a role may make; the walks are the same for every profile. The same tuples answer the
Human's question of where a line's authority came from, which is P8.

### The shell is thin

- **Intake.** Every command, from a tool, a hook or the surface, carries an id, and its caller: the agent whose key
  its tool server showed, the Human for the surface, the bridge for a fact. A command seen before returns its earlier
  result, so a tool call retried after a dropped connection changes nothing twice.
- **One writer per project.** Commands for one project go through one queue; the kernel for that project runs one at
  a time. Projects run side by side.
- **Commit.** The events and the effects they ask for are written in one SQLite transaction, with the expected
  sequence checked. Nothing is sent before the commit, so nothing is sent for an event that was not kept.
- **Dispatch.** A dispatcher takes each pending effect to its satellite, and records its result as a fact with the
  effect's key. A fact whose key was seen is dropped.
- **Idempotent effects.** Each effect either carries its key to the far side (a message's `clientMessageId`, an
  agent's label) or checks before it acts (a branch advanced only from the sha it expects). An effect that can be
  neither is not written.
- **Restart.** Fold the log from the last snapshot; dispatch the effects with no result; reconcile the agent host
  (`PASEO.md` rule 5). Nothing else is remembered in memory.

### The store

```text
events    (seq INTEGER PRIMARY KEY, command_id TEXT UNIQUE, at TEXT, by TEXT, type TEXT, payload TEXT)
effects   (key TEXT PRIMARY KEY, event_seq INTEGER, kind TEXT, payload TEXT, status TEXT, attempts INTEGER, result TEXT)
snapshots (seq INTEGER PRIMARY KEY, state TEXT)
```

One file per project, in the plugin's own state root, in WAL mode. The machine's holds are one more file for the
machine, which every project's shell reads before it dispatches an effect that loads the machine.

### Views

The views of `KERNEL.md` §8 are queries over the events, or folds the surface runs itself: the kernel is in
`shared/`, so the app folds the same events the daemon does, sent to it over RPC, and no view needs a second copy
of the rules.

### Testing

- `decide`, `evolve` and `react` are tested with no I/O and no mocks: given these events, this command gives these
  events or this refusal.
- fast-check runs random sequences of commands and checks every invariant after each.
- Logs recorded from real runs are folded by the new code in the tests, as Temporal replays histories: a change that
  would fold an old log to a different state fails there.
- The shell is tested at its edges: a crash between commit and dispatch, a fact delivered twice, a command retried.

## What this changes

- `KERNEL.md` §1: the kernel returns events; effects come from `react`, not from `decide`.
- `KERNEL.md` §7: commands carry ids, events carry the command they came from, time and ids come from the shell.
- `PORTS.md`, Store: the tables above.
- Nothing about what the kernel keeps or checks: the entities, invariants and commands stand.
