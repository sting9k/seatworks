# Ports

What the kernel asks of each satellite, and what each gives back. A satellite does one job, names nothing of SLP in
its contract, and would be of use to a team that dropped SLP. It takes effects from the kernel and returns facts; it
never calls another satellite and never decides for a role.

Signatures are language-neutral. `Result` is a success with its value, or a failure that says what failed.

## Store

Keeps the kernel's log.

```text
append(project, events, expectedSeq) -> Result<seq>      // fails if another append came first
read(project, fromSeq) -> events
putSnapshot(project, seq, state); getSnapshot(project) -> (seq, state)?
```

- An append is atomic and durable before it returns.
- Snapshots are a cache: losing one MUST lose nothing.
- One kernel writes a project's log at a time.

Which store backs it, a file of its own or a tracker the Human already reads, is open (README).

## Agent host

Starts agents, speaks to them, and hears them. The Paseo adapter is the first; nothing else knows Paseo. What it
takes from Paseo, and how it survives Paseo's releases, is in `PASEO.md`.

```text
create(spec) -> Result<agentId>
  spec: { name, agent, model, thinking, systemPrompt, tools, cwd, env, labels, sandbox }
send(agentId, text, key) -> Result<sent | duplicate>
stream(agentId) -> events: turn_started, turn_ended, said, thought, tool_call, usage, permission_requested
history(agentId, since) -> events
answerPermission(agentId, requestId, allow, reason)
archive(agentId)
```

- `sandbox` is built from role properties (`writes`), never from a role's name. Each agent's own format
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
post(agentId, message: { key, text, asksAnswer }) -> Result<queued>
facts: delivered(key, at) | unreachable(agentId, why)
```

- A message never lands inside a turn. Messages waiting for one reader go as one, numbered, in the order they came.
- Delivery is durable: a restart loses no message.
- A message is never dropped. A reader that is gone is reported `unreachable`, and the kernel moves what it was owed.

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
commands: answer_question, send_message, hold_scope, resume_scope, amend_plan (lines of theirs)
```

- It shows only what the kernel's views and the agents said. It writes no summary of its own.
- A message the Human types here or straight into an agent's chat is the same message on the record.

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

Not a satellite: the MCP server each agent is given. Each tool is one kernel command, shown to the roles whose `tools`
name it, or a read: `status` (a scope's view), `record` (briefs, findings, reports, attentions), `look` (an agent's
history between two points, through the agent host), `diff` (a scope's change at a commit). A reply is the command's
result and the facts it produced, never advice on what to do next.

## Bridge

The Paseo plugin's entry and the only place that builds the whole. It turns host hooks into kernel commands and
facts, carries each effect to its satellite, and each satellite's fact back as a command.
