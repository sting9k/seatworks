# Ports

What the kernel asks of each satellite, and what each gives back. A satellite does one job, names nothing of SLP in
its contract, and would be of use to a team that dropped SLP. It takes effects from the kernel and returns facts; it
never calls another satellite and never decides for a role.

Signatures are language-neutral. `Result` is a success with its value, or a failure that says what failed.

## Store

Keeps the kernel's log.

```text
append(project, events, effects, filed, expectedSeq) -> Result<seq>   // fails if another append came first
pending(project) -> effects                               // written, with no result yet
settle(project, key, result)                              // a fact for an effect; a key settled before is dropped
read(project, fromSeq) -> events
about(project, subject) -> events                         // those filed under a subject, in order
count(project, type) -> number                            // how many events of a type the log holds, off an index
putSnapshot(project, seq, state); getSnapshot(project) -> (seq, state)?
```

- An append is atomic and durable before it returns.
- Snapshots are a cache: losing one MUST lose nothing.
- `filed` names, for an event, the subjects it is read under; it is written in the same append, so reading what is
  about one subject never reads the whole log. The store gives no meaning to a subject: the shell files an event
  under the scopes whose record it is read in.
- One kernel writes a project's log at a time.

It is a SQLite file of its own, on Node's built-in `node:sqlite` (`STACK.md`): events in an append-only table, the
append a transaction that checks the expected sequence and writes the effects the events ask for beside them, as an
outbox (`CORE.md`, The store). The machine's holds live in one file per machine, beside the projects' logs.

## Agent host

Starts agents, speaks to them, and hears them. The Paseo adapter is the first; nothing else knows Paseo. What it
takes from Paseo, and how it survives Paseo's releases, is in `PASEO.md`.

```text
create(spec) -> Result<agentId>
  spec: { name, agent, model, thinking, systemPrompt, tools, servers, cwd, projectRoot, env, labels, sandbox, runs }
send(agentId, text, key) -> Result<sent | duplicate>
stream(agentId) -> events: turn_started, turn_ended(done | failed(why) | cancelled), said, thought, tool_call,
                          usage(tokens, cost), permission_requested, gone(why)
history(agentId, since) -> events
answerPermission(agentId, requestId, allow, reason)
archive(agentId)
openWorktree({ projectRoot, title, slug, branch, base? }) -> Result<path>  // the host makes it: a new branch off
                                                            // `base`, or the branch checked out where it is there
closeWorktree(path) -> Result                               // ends the agents in it and removes the worktree
labelled(labels) -> { agentId, title, labels }[]            // every agent not archived that carries all of them
agentProfiles() -> { id, name, provider, model?, effort? }[] // the agent profiles the Human keeps
providers() -> provider[]                                   // an agent can start on each; none if Paseo cannot say
models(provider) -> Result<{ id, label, efforts, ... }[]>   // what a profile on it may run
addProfiles(names, { provider, model, effort? }) -> Result<added>  // never touches a profile already there
shapeProfile(name, { provider, model, effort? }) -> Result  // what that one profile runs, and no other profile
```

- An agent profile that names no model makes no agent, and the host says which profile it is: Paseo's own refusal
  names a format, which nobody can act on.
- `projectRoot` is the repository the agent works on. The host lists the agent under that repository's project, in
  one workspace for the folder it works in, and never lets the host's own rule make a project of a worktree
  (`PASEO.md`, Seen on a live daemon).
- A worktree is the host's to make and to remove: Paseo keeps it where it keeps its own, runs the repository's
  set-up in it, and shows it as it shows any worktree of the project. The host removes one whatever it holds, so
  whoever asks for it to be closed has asked the workspace first whether work in it is uncommitted.
- `runs` is what this one agent runs in place of what its profile runs: a provider, a model, an effort, each left
  out where the profile's stands. The host is told it and asks nobody whose it is (`TEMPLATE.md`, Agent profiles on
  a machine).
- `sandbox` is built from role properties (`writes`, `reading`), never from a role's name. Each agent's own format
  lives in `agent-host/harness/<agent>/`.
- A prompt and a tool set are fixed when an agent is created: a change of either is a new agent.
- `servers` are MCP servers beside the one `tools` come from, each with the tools of it the agent may call unasked.
  The host knows nothing of what a server is for. It refuses to make an agent whose provider cannot take one, naming
  the server.
- A stream resumed after a reconnect MAY have missed events; the adapter reads `history` to fill the gap before it
  reports a turn ended.
- Hooks that can refuse an agent's creation answer within the host's time limit, with no unbounded I/O.

## Workspace

Knows one repository's branches: merges them, moves them, publishes one, and says where each is checked out. It makes
and removes no working copy: a worktree is the agent host's.

```text
candidate(commit, onto, message) -> Result<{ candidate, parentHead } | conflict(paths)>
                                                          // made without touching a working copy; work `onto`
                                                          // already holds is taken in as `onto` stands
advance(branch, fromSha, toSha) -> Result<sha>            // refuses if the branch moved, or is checked out dirty
headOf(ref) -> sha | none                                 // where a branch of the repository is
trees(prefix) -> { path, branch, unsaved }[]              // each working copy a branch under the prefix is checked
treeOf(branch) -> { path, branch, unsaved } | none        // out in, the Human's own among them
dropMerged(branch, into)                                  // deletes a branch once `into` holds all of its work
publish(branch, remote, expectedSha) -> Result<sha>       // never forced; refuses if the branch moved, or the remote
branchesUnder(prefix, into) -> { branch, ahead }[]        // how many of its commits `into` does not hold
removeBranch(branch) -> Result<removed | kept(why)>       // git refuses one checked out in a working copy
diff(base, tip, within?) -> text                          // what `tip` changed since it left `base`, under paths
putBlock(branch, file, marker, body | null) -> Result<sha | unchanged | refused(why)>
                                                          // one commit of that file alone; refuses a file with
                                                          // uncommitted changes where the branch is checked out
```

Where work is done, in the owner's words: "Supervisor ở project gốc, nó điều phối, các lead sinh ra để làm task bọn nó
mới work trên worktree mới tại thời điểm đấy", and of a lane's Peers, "mỗi peer 1 worktree là sai, bọn nó cùng 1 task
từ lead mà": an epic is cut into tickets, a ticket is a lane, and a lane's team shares the ticket's worktree.

- **The root's agent works in the repository itself**, where the Human does. It coordinates and hands work out, so
  no worktree is made for it, and it reads the project as the Human has it.
- **A lane has one worktree, and everyone it seats works in it.** A lane is a scope opened under the root. Its
  worktree is made when it is opened, by the agent host, on a branch of the lane's own off the project's base, or
  off the commit a lane is seated to read. Its owner, its writers and its readers, at any depth under it, all work
  in that one folder on that one branch. What the root judges can be done side by side it opens as two lanes: that
  is where work runs in parallel, each in a worktree of its own.
- **Work under a lane is committed on the lane's branch.** Taking such a scope in moves nothing: its commit is in
  the branch already, so its candidate is the branch as it stands and its checks run there. What it changed is read
  from where it began and under its own paths, since a neighbour's commits lie beside its own; sibling scopes whose
  paths overlap are ordered already (I3), so two never write one file at once. Undoing one scope's work is a revert
  of its commits by a writer, not a branch thrown away.
- **A lane taken in is merged into the base, and its worktree and branch go with that**: the worktree closed by the
  agent host, the branch deleted once the base holds it. Dropped, its worktree is closed and a branch with commits
  nothing else holds stays for the Human to look at. A worktree holding uncommitted work is never closed.
- The first build gave every scope a copy of its own, made and removed by this satellite under the plugin's state
  root: a writer's on its own branch, a reader's detached. That put a worktree behind every task and a merge behind
  every hand-back, kept them where Paseo could not show or manage them, and left the plugin its own code for what
  Paseo does.
- The git an agent runs refuses what only the workspace does (branch moves, pushes, switching, work outside the
  folder it works in). It guards against mistakes, not intent.
- The workspace's own git runs no hook or command a repository's config names.
- A commit it returns is named whole, however it was named to it: a branch is moved to it and a publish looks for
  it by that name, and an abbreviation would match neither.
- A publish finds the branch moved when its tip is not the head it was asked at, but for one case: a tip that is that
  head with only the plugin's own commits over it, none a merge (the note it writes at attaching), is the same head
  and is pushed, those commits with it. Without that, a publish before the first landing would be refused for the
  plugin's own note.

## Evidence

Runs checks on one commit and says what came of them.

```text
run(path, sha, steps, timeout) -> { sha, ok, steps: [{ name, exit, log, seconds, cause? }] }
stop()
```

- It checks that the copy is at `sha` before it starts and after it ends; a copy that moved fails the run.
- A step is its command: it ends when the command does, with the command's exit code, and whatever the command
  started that still runs is ended with it. A step that runs past the timeout is killed the same way.
- `stop` ends every step now running and starts no other: a check left running would outlive whoever asked for it,
  with no timeout left to end it. A run that was stopped fails, saying so, and is never a pass.
- Each step has a guard: a small process beside it whose input is a pipe from the one that runs the checks. When
  that pipe ends, the guard ends the step's process group; so a step is ended when the process that asked for it
  is gone, however it went, killed outright included. A step is over once its guard is gone too: a run that has
  answered has left no process behind.
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
- What a delivery shows is read when it goes: a message and an attention off the state, and a candidate off the
  state and the record of the watched agent's scope, which the bridge hands the satellite as the store files it
  (`WATCH.md`, The Watcher). One already read or answered renders as nothing.

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
views: whatTheHumanNeeds, sinceTheyLooked, chainOfChange, openObligations, status, signals, stuck, template
commands: answer_question, send_message, hold_scope, resume_scope, amend_plan (lines of theirs), answer_permission,
          set_checks, publish
upkeep: attach(repository, profile), folderAt(dir), gitOffer(dir), setUpGit(dir), remoteOf(project),
        createRemote(project, visibility), profiles, presets,
        templateOffer(from), installTemplate(from, hash),
        removeTemplate(name), syncTemplate(project), agents(match), models(provider),
        createAgents(profile, provider, model, effort), shapeAgent(agent, provider, model, effort),
        projectAgents(project, own), leftovers,
        clean(picked), checkUpdate
```

- It shows only what the kernel's views and the agents said. It writes no summary of its own.
- What the Human needs lists every scope, the root first and each before what is under it, so the surface draws the
  team as a tree, and says of each whether it is work, a reading or a watch. A question and a permission each name
  the scope they came from, and the view carries the project's checks, each with the program and arguments it runs.
- Beside it the surface is told how many scopes the record holds as taken in. The state keeps open work alone and
  forgets a scope once it has landed (`LEDGER.md` §3), so that a team has finished is read from the log, by a count
  the store answers from an index.
- Beside it too: the base the team lands on; what happened lately, each line with when, so the surface says how
  long ago in the Human's own time; and, where the root has nobody seated, why its last agent went, in the words
  the record has. The state forgets an agent once it is gone, so that reason is read from the log's last events.
- A remote is said by its name and where it points: a host and a path. The account and the secret a remote's URL may
  carry are the Human's, and never reach the surface. A folder that is a part of a repository is said with that
  repository.
- `stuck` reads the state and the outbox: an effect its satellite keeps throwing on, with how many times, or gave up
  on after its last try, with the error; an open scope with nobody seated, with its parent's owner; words queued for
  a seated actor whose agent never started; a seated actor that ended a turn while its agent's tool server never
  reached the plugin, so it has none of the team's tools. Facts only; it changes nothing and suggests nothing.
- A message the Human types here or straight into an agent's chat is the same message on the record.
- Attaching opens a project with the profile named, which the button that attaches always names, and starts its
  root's agent. The plugin serves only attached projects: every hook passes over an agent it did not start.
- A team may be attached to any folder: each of Paseo's projects, whatever Paseo says of its git, and any folder
  given by its path. Each says how it stands with git, as git itself answers: ready, with a commit to branch from;
  none of that yet; or a part of another's repository, which is attached whole and not by a part. A folder with no
  git is set up from the page, in two presses: the first makes it a repository and says what a first commit would
  hold, how many files and whether anything is ignored; the second commits them in the Human's name, signed where
  they sign. Nothing is committed by being told. Hiding what had no git left a Human with a project and a page that
  said Paseo had none. A worktree of a repository is a part of it as a folder inside it is, named with it and not
  attached by itself; and a folder the plugin keeps for itself, a team's copies among them, is never offered,
  listed or taken by its path.
- A project takes the remote its repository has as where it is published: `origin` where there is one, else its
  only remote; with two and no `origin` the Human names one when they publish. A project with no remote is put on
  GitHub from its own page, private or public, in two presses, the second after it is said which account, which name and
  which visibility: GitHub's own command line makes the repository under the account the Human signed it in as,
  never one of the plugin's, and the base is pushed there by an ordinary `publish`, so the record holds the remote
  from then on. Where that command line is not signed in the page says so and offers nothing.
- An attached project is a line under Projects, with its template and where its team stands, and opens a page of
  its own. That page says in words what is stuck, each fact a line, and gives the way on: a root with nobody seated
  says why its last agent went and is seated again by the Human's `reseat`. It opens the root's chat and the Team
  tab of the project's workspace where Paseo has one, and holds or resumes the team.
- Attaching also commits the profile's `project.md` into the project's `AGENTS.md` on its base, between the plugin's
  markers, as a commit of that file alone, so every agent in the repository, the team's or the Human's own, knows the
  team is there and which branches are its. Removing the project takes it out the same way. A file the Human is
  editing is never written over: the note waits for them to commit and attach again.
- Leftovers are what no open scope uses any more: a copy, a branch made for a scope, an agent Paseo keeps whose seat
  ended, and each project as a whole. Each says how many of its commits the base does not hold, so the surface
  never picks one that has any for the Human, nor a project whole; a base that is not there holds none of them. The Human picks and confirms, and the plugin removes only that, checked again
  against what is left over at that moment. A copy holding uncommitted work on its branch is listed and never
  removed, and a project with one is not removed at all. Removing a project archives its agents and deletes its
  copies and branches; its record is set aside, since a look back reads the log after the team is gone (P14), and is
  listed as a leftover of its own until the Human deletes it. Attached again, the project starts from nothing. What is
  a folder says what it takes on disk, the bytes of its files with no link followed, and a record says when its
  project was removed: what the Human weighs a removal by. A branch and an agent take nothing to say, and a project
  still attached is not measured: it is removed from its own page, and the copies its team works in are no leftover.
- A template is installed from a file on the Human's machine: read first for what it would bring, then installed
  once they agree, the same file by its hash (`TEMPLATE.md`, Installing).
- The update check reads Paseo's own and installs nothing.
- While a team runs, the plugin writes nothing of the record into the repository: after the note written at
  attaching, the base moves by landings alone. Agents read the plan, its words and what landed from the record. A
  commit of the plugin's after each landing moved the base under every candidate and every publish, and put two
  writers on one file.
- When a project is removed, what the record holds is left in the file the profile names as `map`, between the
  plugin's markers, as a commit of that file alone, before the note is taken out: the destination, what must hold
  apart from what was chosen, what is not yet known, the words settled, each scope that landed with what its owner reported
  under each section and how each finding in it was weighed, and what is still in dispute. A file of the Human's in
  its place stops the removal, as an edit to the instruction file does. A project with no plan leaves nothing.
- The docs a team keeps by hand, such as a glossary and the ADRs in `docs/adr/`, are written by the agent whose
  commit they explain; the plugin only points every agent at them. The paths are the profile's: `map`, and the list
  `docs`.
- It sits in Paseo's own places, each with one job.
  - **A page in the sidebar** is set-up and upkeep, a job a tab: the projects, the templates and the agent profiles
    their roles run on, the classifier's switch and key, what teams left behind, and whether a newer release is
    out. A project opens a page of its own there, in three tabs. Overview is the project at a glance: what is stuck,
    what waits on the Human, answered in place, the team as a tree with how many sit, work, wait and have landed,
    what it spent, and the last things that happened; the whole record is the Team tab's. Agents is what each name
    of its template runs in this project, the Human's profile as the default and the project's own picked in place
    (`TEMPLATE.md`, Agent profiles on a machine). Settings is its template and Sync, its base, where it is
    published, its checks, what its team left behind, and removing it. A project's checks are changed there: each
    a name and its command on one line, sent as the program and its arguments, since a check runs with no shell;
    quotes keep an argument whole.
  - **A tab's fields are described on demand**, by an "i" at the end of its tabs: each field as the tab names it,
    and what it is. That description alone is in two languages, English and Vietnamese, the one last picked on the
    device, else the device's own; every other word of the surface is English. A sentence under every row was read
    past, and none left a first-time Human guessing what a check is.
  - **What can grow opens in a place of its own.** A project's checks are edited in the host's modal, not among the
    rows of its settings, where a fifth check would push the rest of the page away.
  - **A choice on a line is a pick**: a chip as wide as its word, which opens the host's own modal with what there
    is to choose. The host has no small menu of its own to give a plugin, and a row of settings for each choice
    made a template's six agent profiles a screen and a half long.
  - **A Team tab**, beside Files and Changes and as a tab of the workspace, is the whole team of the project a
    workspace belongs to: every seat a line with one word for what it is doing now, what waits on the Human answered
    in place, and the record folded under its headings. What is stuck and a standing alarm come first. Where it is
    wide, as a tab of the workspace is, the tree and one seat sit side by side: the seat says who sits in it, opens
    its chat and answers what waits on the Human from it alone. A press on a line shows that seat there; beside
    Files and Changes, where there is no room for one, it opens the seat's chat. The seat shown is the one picked,
    else the first that needs the Human, else the root.
  - **A pill** on the chat of each agent the plugin started says the most pressing thing: what is stuck, then what
    waits on the Human, then a held team, then who works, then that all has landed: something was taken in and no
    work is open under the root. Its popover answers what waits, opens the Team tab, holds
    or resumes the team, and sends a word to the root's agent. A button in the workspace's header and three commands
    typed in a chat do the same.
- What costs nothing to remove comes picked in the clean-up. What takes commits with it, and a project whole, never
  does: the Human picks those, and a whole project is removed from its own page.

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
ask(state, questions) -> Result<{ model, answers, tokens }>
  question: noul | choice(labels), each with instructions and a description per outcome
  answer: p(yes) | label, confidence, p per label
```

- Every question is answered as asked, or the call fails.
- Where it is sent is the profile's data, a route of its `classifier`: endpoint, pinned model, and a body sent with
  every request. A profile with none has nothing behind this port, and nothing is asked.
- A `score` on a rubric, which the classifier SLP names also answers, is not built: no question asks one.
- Never asked from a hook that can refuse, and nothing waits on it.

## Code index

Optional. Lets agents navigate code through the servers a project configures, such as a JetBrains IDE's index
(V1's `catalog/mcp/intellij-index`). Nothing else in Seatworks depends on it; the watch uses git and the record.

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
`record` (briefs, findings, reports, attentions), `look` (what an agent was last told, said, thought and ran, newest
last, through the agent host; `last` counts those, not turns), `diff` (a scope's change at a commit). A read with no scope named is of the caller's own.
What bears on the watch is read by who asks, off the scope graph, so that the watched never learn of it (`WATCH.md`,
Decided 6). The attentions in a scope's record are for an owner above it or one that watches; what a look back
reads is for the root's owner. A scope that watches is shown, in `status`, `record` and `diff` and among its
parent's children, to its own agent and to those above it, and reads to anyone else as a scope that is not open. A
`look` reaches down only, at an agent in the reader's own scope or below it, since an attention sits in the
timeline of whoever was sent it; one that watches looks at the agents it watches over. Any other actor named, there
or not, gets one same reply. A reply is the
command's result and the facts it produced, never advice on what to do next. Every argument an agent is shown says what it is, in a line of its own; a line and what it comes
from (`via`) are the same in every tool, so each tool that takes lines says them once rather than on every line. A
tool's description says what it is for, and `raise_finding`'s names the points of conflict it is
the channel for: a check that cannot pass honestly, a premise the code contradicts, the same failure a third time, a
layer about to hide a contradiction (`STEERING.md`).

The line between the server and the bridge fails in words, never in silence:

- Every tool's arguments are parsed where the call arrives, a read's as a command's; one that does not fit is refused,
  saying which argument.
- A server started before the plugin listens, or calling while the plugin is being loaded again, waits a moment and
  tries again. A plugin that stays away is said so, with whether anything was recorded. The plugin's own refusal is
  an answer, and is not tried again.
- A call whose answer is lost with the connection is sent again under its id, and taken once.
- A server's first hello is kept on the record (`tools_reached`). An agent that ends a turn with none kept is shown
  to the Human as stuck: an agent with no tools looks like one that is thinking.
- A call on a line that was refused, or that never said hello, is answered that nothing was done: one left unanswered
  would look to its agent like a tool that hangs.
- Nothing thrown while a server is answered leaves the socket: the server is refused, the reason goes to Paseo's
  log, and every other agent's tools go on working.

## Bridge

The Paseo plugin's entry and the only place that builds the whole. It turns host hooks into kernel commands and
facts, carries each effect to its satellite, and each satellite's fact back as a command.
