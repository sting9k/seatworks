# Ports

What the kernel asks of each satellite, and what each gives back. A satellite does one job, names nothing of SLP in
its contract, and would be of use to a team that dropped SLP. It takes effects from the kernel and returns facts; it
never calls another satellite and never decides for a role.

Signatures are language-neutral. `Result` is a success with its value, or a failure that says what failed.

## Store

Keeps the kernel's log.

```text
append(project, events, effects, expectedSeq) -> Result<seq>   // fails if another append came first
pending(project) -> effects                               // written, with no result yet
settle(project, key, result)                              // a fact for an effect; a key settled before is dropped
read(project, fromSeq) -> events
putSnapshot(project, seq, state); getSnapshot(project) -> (seq, state)?
```

- An append is atomic and durable before it returns.
- Snapshots are a cache: losing one MUST lose nothing.
- One kernel writes a project's log at a time.

It is a SQLite file of its own, on Node's built-in `node:sqlite` (`STACK.md`): events in an append-only table, the
append a transaction that checks the expected sequence and writes the effects the events ask for beside them, as an
outbox (`CORE.md`, The store). The machine's holds live in one file per machine, beside the projects' logs.

## Agent host

Starts agents, speaks to them, and hears them. The Paseo adapter is the first; nothing else knows Paseo. What it
takes from Paseo, and how it survives Paseo's releases, is in `PASEO.md`.

```text
create(spec) -> Result<agentId>
  spec: { name, agent, model, thinking, systemPrompt, tools, cwd, env, labels, sandbox }
send(agentId, text, key) -> Result<sent | duplicate>
stream(agentId) -> events: turn_started, turn_ended(done | failed(why) | cancelled), said, thought, tool_call,
                          usage(tokens, cost), permission_requested, gone(why)
history(agentId, since) -> events
answerPermission(agentId, requestId, allow, reason)
archive(agentId)
labelled(labels) -> { agentId, title, labels }[]            // every agent not archived that carries all of them
```

- `sandbox` is built from role properties (`writes`, `reading`), never from a role's name. Each agent's own format
  lives in `agent-host/harness/<agent>/`.
- A prompt and a tool set are fixed when an agent is created: a change of either is a new agent.
- A stream resumed after a reconnect MAY have missed events; the adapter reads `history` to fill the gap before it
  reports a turn ended.
- Hooks that can refuse an agent's creation answer within the host's time limit, with no unbounded I/O.

## Workspace

Gives each writer a copy, merges, and keeps writes where they belong.

```text
create(key, base, branch) -> Result<path>                 // runs the project's setup before returning
merge(path, from) -> Result<sha | conflict(paths)>        // a conflict is undone, never left half merged
advance(branch, fromSha, toSha, how) -> Result<sha>       // how: squash | merge | ff; refuses if branch moved
state(path) -> { head, branch, uncommitted }
remove(key) -> Result<removed | kept(why)>                // keeps a copy holding uncommitted work
publish(branch, remote, expectedSha) -> Result<sha>       // never forced; refuses if the remote moved
onDisk() -> { key, path, branch, unsaved }[]              // every copy under the root, used or not
branchesUnder(prefix, into) -> { branch, merged }[]
removeBranch(branch) -> Result<removed | kept(why)>       // git refuses one checked out in a copy
prune()                                                   // forgets copies git lists whose directory is gone
putBlock(branch, file, marker, body | null) -> Result<sha | unchanged | refused(why)>
                                                          // one commit of that file alone; refuses a file with
                                                          // uncommitted changes where the branch is checked out
```

Invariants, taken from Symphony's workspace safety rules:

- An agent runs only in its own copy, and a copy's path stays inside the workspace root.
- A key is sanitized to `[A-Za-z0-9._-]`, with a stable hash suffix when sanitizing changed it.
- The git an agent runs refuses what only the workspace does (branch moves, pushes, switching, work outside its own
  copy). It guards against mistakes, not intent.
- The workspace's own git runs no hook or command a repository's config names.

## Evidence

Runs checks on one commit and says what came of them.

```text
run(path, sha, steps, timeout) -> { sha, ok, steps: [{ name, exit, log, seconds, cause? }] }
```

- It checks that the copy is at `sha` before it starts and after it ends; a copy that moved fails the run.
- A step that runs past the timeout is killed with everything it started.
- It never runs while the machine is held: the kernel does not ask it to.
- A failed step's `cause` is `environment` or `code` when the log matches a known shape, from data, and is left for
  the reflex otherwise (`REFLEX.md`). It never turns a failure into a pass.

## Delivery

Carries messages to agents. The rules are in `COMMUNICATION.md`.

```text
deliver(agentId, batch: { key, items: [{ key, from, text, asks }] }) -> Result<delivered | busy>
facts: delivered(batchKey, itemKeys, at) | busy(agentId) | unreachable(agentId, why)
```

- The queue is the kernel's: a mailbox is the delivery effects not yet settled for a seat (`COMMUNICATION.md`, The
  mailbox). The satellite only sends a batch it is given, when the agent host reports the reader between turns, and
  answers `busy` rather than push into a turn.
- Delivery is durable: a restart loses no message, and a batch sent twice lands once, by its key.
- A message is never dropped. A reader that is gone is reported `unreachable`, and the kernel moves what it was owed
  and what was waiting for it.

## Machine

Reads the machine as it is.

```text
read() -> { cpus, load, memory, busy: [{ what, since }] }
```

It holds no state of its own. A hold is recorded by the kernel that set it and read by every project's kernel on the
machine, through the store.

## Human surface

Shows the Human the kernel's views and the agents' own words, and takes the Human's commands.

```text
views: whatTheHumanNeeds, sinceTheyLooked, chainOfChange, openObligations, status, signals
commands: answer_question, send_message, hold_scope, resume_scope, amend_plan (lines of theirs), answer_permission,
          set_checks, publish
upkeep: attach(repository), leftovers, clean(picked), checkUpdate
```

- It shows only what the kernel's views and the agents said. It writes no summary of its own.
- A message the Human types here or straight into an agent's chat is the same message on the record.
- Attaching opens a project for one of Paseo's projects and starts its Supervisor. The plugin serves only attached
  projects: every hook passes over an agent it did not start.
- Attaching also commits the profile's `project.md` into the project's `AGENTS.md` on its base, between the plugin's
  markers, as a commit of that file alone, so every agent in the repository, the team's or the Human's own, knows the
  team is there and which branches are its. Removing the project takes it out the same way. A file the Human is
  editing is never written over: the note waits for them to commit and attach again.
- Leftovers are what no open scope uses any more: a copy, a branch made for a scope, an agent Paseo keeps whose seat
  ended, and each project as a whole. The Human picks and confirms, and the plugin removes only that, checked again
  against what is left over at that moment. A copy holding uncommitted work on its branch is listed and never
  removed, and a project with one is not removed at all. Removing a project archives its agents and deletes its
  copies, branches and record: attached again, it starts from nothing.
- The update check reads Paseo's own and installs nothing.
- The project's docs go with its repository and stay when the team is gone: `GLOSSARY.md`, whose block between the
  plugin's markers holds the words settled in the root's plan, and `docs/seatworks/MAP.md`, the map (destination,
  what must hold, what is not yet known, each lane landed with what it decided, assumed and left open, and what is
  still in dispute). Both are written from the log on `docs.write`, whole each time, as a commit of that file alone,
  so one left behind is written the next time. ADRs in `docs/adr/` are written by hand, by the agent whose commit they
  explain. The paths are the profile's.
- It sits in Paseo's own places: a page in the sidebar (the projects, each project's tabs, the plugin), a Team tab beside
  Files and Changes for the project a workspace belongs to, and a pill on the chat of each agent the plugin started,
  counting what waits on the Human in its project and answering it in place.

## Record

Reads the log for the look back.

```text
chains(project, since) -> chainOfChange[]
signals(project, since) -> ratios
```

Read only. It never writes to the log and never turns a ratio into a rule.

## Reflex

Answers typed questions about a piece of text, each with a probability. What it may be asked, and where its answers
go, is in `REFLEX.md`.

```text
ask(state, questions, model) -> Result<{ model, answers, tokens }>
  question: noul | choice(labels) | score(rubric), each with instructions and a description per outcome
  answer: p(yes) | label, confidence, p per label | score, confidence, p per level
```

- Every question is answered as asked, or the call fails.
- Where it is sent is data: endpoint, pinned model, and a body sent with every request.
- Never asked from a hook that can refuse, and nothing waits on it.

## Code index

Optional. Lets agents navigate code through the servers a project configures, such as a JetBrains IDE's index
(V1's `catalog/mcp/intellij-index`). Nothing else in v3 depends on it; the watch uses git and the record.

```text
tools(config, role) -> ToolSpec[]                         // what each role is shown, from data
call(copy, name, args) -> Result<json>                    // every call pinned to the caller's own copy
```

Configured by data. It names no agent, role, IDE or server in code.

## Tools

Not a satellite: the MCP server each agent is given, a stdio process that speaks to the bridge over a local socket.
The shell makes a key for each agent when it creates it and puts it in the agent's environment; the server shows it
on connecting, and the bridge takes the caller from it, never from a tool's arguments. A session opened again is given
back the key its agent was bound to. It guards against mistakes, not intent, as the git shim does.

Each tool is one kernel command, shown to the roles whose `tools` name it, or a read: `status` (a scope's view),
`record` (briefs, findings, reports, attentions), `look` (an agent's history between two points, through the agent
host), `diff` (a scope's change at a commit). A reply is the command's result and the facts it produced, never advice
on what to do next. A tool's description says what it is for, and `raise_finding`'s names the points of conflict it is
the channel for: a check that cannot pass honestly, a premise the code contradicts, the same failure a third time, a
layer about to hide a contradiction (`STEERING.md`).

## Bridge

The Paseo plugin's entry and the only place that builds the whole. It turns host hooks into kernel commands and
facts, carries each effect to its satellite, and each satellite's fact back as a command.
