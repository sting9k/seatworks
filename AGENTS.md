# AGENTS.md

Seatworks is a Paseo plugin that runs a team of coding agents the **SLP** way. SLP is the core: a
**Supervisor** works with the Human, a **Lead** owns each lane of work, and **Peers** each do one
task. Around the core are **R**, review, which a Lead has a Reviewer do, and **W**, the watch, which
the Watcher does. This file holds what the code will not tell you before you change it.

**Nothing has shipped.** No users, no releases, nothing to stay compatible with.

## The governing rule

The owner's words:

> "Lưu ý code plugin chỉ **_hỗ trợ / phục vụ_** concept SLP làm việc tốt hơn với Paseo chứ không hạn
> chế SLP làm việc nhé. Hiện tại tao đang thấy không có sự flexible và dự án đang quá loạn. Gần đánh
> mất đi concept vốn có của SLP."

The plugin **serves** SLP so it works better with Paseo. It must **never constrain** how SLP works.

- Ask of every change: does it take a constraint off SLP, or add one? Adding one needs a reason,
  written in its commit message. When a constraint goes, delete it; never add a switch to turn it
  off.
- SLP is a federated governance graph, not a tree. `Supervisor > Lead > Peer` is not a chain of
  command: each role holds authority on its own axis.
- If SLP were dropped tomorrow, the plugin must survive. A change that makes that untrue is wrong.
- **A decision the concept does not settle is the owner's.** Ask before you code it.

## SLP, R and W

| Who         | Owns                                                                                      | Speaks to                                                  |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Human       | Intent, priorities, external commitments; the concept; push and release while in the loop | the Supervisor                                             |
| Supervisor  | Intent interpretation, cross-boundary observation and intervention; landing lanes         | the Human, the Leads; a Peer only with its Lead told first |
| Lead        | One lane: topology, sequencing, ownership, integration and **acceptance**                 | the Supervisor, its Peers and Reviewers                    |
| Peer        | One task, and the engineering judgment inside it; may refuse the Lead's framing           | its Lead                                                   |
| R: Reviewer | Nothing: its verdict is evidence the Lead weighs                                          | its Lead                                                   |
| W: Watcher  | Nothing: it tells the Supervisor _when_ to look                                           | the Supervisor only                                        |

- **The Supervisor directs attention; it does not scan.** W tells it when a Lead or a Peer needs
  attention. The Supervisor decides whether and how to step in: one open question, a council, a
  hold, or the Human. It never writes code and never decides a technical result.
- **W is one eye and two brains.** The eye looks at each Lead's and Peer's new thinking, words and
  briefs every few minutes and at a turn's end, beside the code facts from commands and turns, and
  reports to the Supervisor when it sees an anti-pattern (`docs/ANTIPATTERNS.md`) or one of SLP's
  moments: a Lead making an architecture decision, a Peer struggling with an unclear idea, a sharp
  change of direction, an agent saying it was wrong. The brains are a sensor, a cheap typed model
  asked one condition at a time, and the Watcher seat, a model that judges; `attention.brain` says
  which run. What they find opens an incident. W never decides, never steps in, and never speaks to
  the seat it watches.
- **R is evidence for acceptance.** The Lead answers for its Peers' work and starts Reviewers to
  review it. A verdict never decides anything on its own.
- **A lane is a team:** its Lead, its Peers and its Reviewers. One Lead runs several Peers at once,
  and several lanes run at once, as long as they do not collide. Each seat has one mission, a Peer
  one task and a Lead one lane; its superior ends it, never the desk.
- **Branches are the desk's; a task branch is its Peer's.** The desk makes every branch and copy,
  merges a task the Lead `accept`s into its lane, and lands a lane on base at the Supervisor's
  `land_lane`. No seat pulls, checks out, switches, stashes, updates a ref or pushes: the git shim
  refuses it on every agent however it is spelled, and each agent's own rules too. The shim guards
  against mistakes, not intent: what git itself starts (hooks, `rebase --exec`, `bisect run`) and a
  git named by its full path run the real git. So a writing seat always stands on its task's branch,
  where it may merge, rebase, reset or cherry-pick; each role's own rules refuse those four to seats
  that do not write. The shim also refuses git whose work tree is not the seat's own copy, so a seat
  never touches the Human's checkout or another seat's copy. The desk's own git runs no hooks,
  fsmonitor or command the repository's config names, since a seat could have planted one. Each copy
  the desk makes gets the ignored files the project's `.worktreeinclude` names and then the
  project's `setup` command, before its seat starts, and is locked in git while its work goes on. A
  Lead may `reseat` a task: a fresh Peer on the same branch and copy, briefed from the record. A base
  that conflicts with a lane is never left half merged: its Lead has the facts, and the Supervisor
  chooses whose task takes the base in on its own branch.
- **The Human in the loop is a setting**, `hitl.on`, off by default. Off, the concept goes to the
  Human through the Supervisor's grilling, and so does a change to what a lane is for or what it
  costs past its appetite; the Supervisor decides the rest, answers the seats'
  permission prompts with `permit`, and pushes with `push`. On, their question queue, standing orders
  and landing approvals apply. Code that waits for the Human reads the flag.

**Where the code is not there yet.** The `old-is-gone-test` pattern is missing: it needs the names of
the tests a diff removes.

## What the plugin may decide

Only **session lifecycle, transport, routing, notification, durable state and provenance**.

- The plugin never decides acceptance. A gate or test result is evidence: a red gate holds a merge
  until the Lead's `accept` passes it with a reason, and a landing until the Supervisor's `land_lane`
  does. Writing a refusal? Check it against the table above first.
- The one constraint the concept asks for: the Supervisor may reach a Peer directly, but the desk
  always tells the Lead first. No hidden command chains.

## How the design decides

These eight rules settle most questions about where a behaviour belongs.

1. **Code owns only the SLP concept.** Agents, models, tools, MCP servers, thresholds and the watch's
   questions are data or settings; changing them never needs a code change. The name of an agent, an
   MCP server or a sensor in the plugin's code is a defect, and a test fails on it.
2. **One door to the Human.** Only the Supervisor puts a question to the Human: on their queue while
   they are in the loop, in its own chat and about the concept alone while they are not. What the
   panel shows is the desk's record and the Supervisor's words. When the Human types into a Lead's
   or Peer's chat, the desk tells whoever supervises.
3. **Driven by events.** No seat runs on a heartbeat. A letter that asks nothing waits for one that
   does, so it never wakes a seat on its own. What W finds reaches the Supervisor as an event.
4. **Evidence, not claims.** Accepting, reporting ready and landing always carry the desk's facts:
   gate, rehearsals, reviews. A seat saying "done" is a claim to check.
5. **Layered by what can be undone.** What can be undone goes ahead; what cannot waits for the Human
   while they are in the loop, or is held, and the Supervisor hears of it at once.
6. **What code can check is code.** A prompt keeps only judgement. An instruction that depends on the
   situation is the `Next:` line of the letter that brings the situation, not a table in a prompt.
7. **No switch that turns a constraint off.** Two exceptions, both the Human's to set: their standing
   orders, and the Human-in-the-loop flag, which says whether they are in the loop at all.
8. **W reports what it sees.** A watch signal is W's information: no switch per signal, no shadow. What
   W finds reaches the Supervisor, which decides what to do with it; only a kind the Supervisor marked
   noise is not told again about the same seat and task.

## Commands

```bash
cd plugin && npm run check                                 # typecheck, lint, format check, every test: before every commit
cd plugin && npm run format                                # lays the code out as Prettier wants it
cd plugin && node --test --import ./test/setup.ts <file>   # one test file, set up as the suite is
paseo plugin reload seatworks-v2                           # after a client change, to see it in the panel
```

There is no build step. `test/setup.ts` runs before every test file: each test gets a HOME of its
own, git's own binary goes first on PATH, Node keeps compiled code between runs, and a `console.error`
the test did not ask for fails it.

## Working here

- **There is no CI.** `npm run check` before every commit is the whole net.
- **Never start the daemon or launch seats to test.** Seats are real agents with broad permissions,
  and they cost money. The suite, your reading and `~/.paseo/daemon.log` are the evidence.
- **Never print or cat a file that can hold a key:** `settings.json` under
  `~/.local/share/seatworks-v3/` and any copy of it beside it, any project's `settings.json`,
  `~/.paseo/config.json`. Fake keys in tests never start with OpenRouter's real key prefix, so a scan
  for that prefix before a push finds only a real key.
- **Some lines must stay word for word.** `plugin/test/catalog/keep.test.ts` names each one (in
  prompts, skills, harness settings and some code) and what it keeps, and fails when one goes. Such a
  line is SLP's or Paseo's need, not style: change it only when that need changed, and say so in the
  commit.
- **Don't click settings in the owner's live Paseo** to test the panel: it writes their config.

## How the code is written

What a Java codebase does with packages, interfaces and injected dependencies, this code does as
below. `test/architecture.test.ts`, `tsc`, ESLint and Prettier hold most of it.

**Layers and folders.** The architecture test holds each folder to what `MAY_IMPORT` lets it import.

- `server/core/`: helpers that know nothing of Seatworks (git, files, JSON, time, the logger,
  `KeyedQueue`), and `ports.ts`, the interfaces to Paseo and the judge.
- `server/domain/`: the model. Each entity's type sits beside its lifecycle table (`lane.ts`,
  `task.ts`, `ask.ts`, `question.ts`, `incident.ts`); `ledger.ts` holds the ledger and the pure
  queries over it. It imports nothing.
- `server/catalog/`: the kit. `kit/` loads and queries it, with a schema per kit file in
  `kit/schema/`; `team/` resolves the settings layers into a team; `seat/` builds a seat's directory
  and launch config; `paseo/` keeps Paseo's providers and model lists in step.
- `server/desk/`: the use cases, a folder per feature (`lanes/`, `tasks/`, `waiting/`, `messaging/`,
  `human/`, `watch/`, `seats/`, `copies/`, `project/`). `store/` keeps what is on disk, `letters/`
  every word a seat is sent, `views/` the read models, `calls/` a seat's tool call from its arguments
  to its reply, and `tools/` one controller per MCP tool.
- `server/runtime/`: the composition root (`runtime.ts`) and Paseo's hooks, with `seat/`, `round/`,
  `mail/`, `panel/` and `watch/`. `server/adapters/` implements the ports; `server/upkeep/` holds
  the maintenance jobs.
- One module, one concept, in kebab-case and named for what it exports (`merge-queue.ts` exports
  `MergeQueue`). What two features share goes down to a layer both may import, never sideways into
  one of them.
- A tool is a controller: its zod schema and one call into its feature. The rules live in the
  feature, not the tool.

**Types and abstractions.**

- Data is a `type`. A contract a class implements (`Host`, `HostHooks`, the panel's `SettingsRpc`)
  names only what its callers use. No enums, parameter properties or namespaces
  (`erasableSyntaxOnly`): a union of literals, an `as const` table, fields assigned in the
  constructor.
- One algorithm over many types is a generic (`Lifecycle<Status, Move>`, `KeyedQueue`,
  `LedgerStore.transact<T>`), never a copy per type.
- An interface is split by who calls it: the panel's contract is `SettingsRpc`, `ProjectsRpc`,
  `UpkeepRpc` and `HumanRpc`, not one object with every method.
- An abstraction needs a second implementation or caller today; a port may have one adapter and its
  test fake. Compose; inherit only where state and behaviour are both shared.
- New behaviour is a new entry, not a new branch: a tool in the registry, a move in a lifecycle
  table, a letter in its themed object, a step in the patrol's table, a finder in the lane facts.

**Dependencies.**

- Only `Runtime` and `Desk` build the object graph; everything else is handed what it needs.
- A desk function takes `Pick<DeskServices, ...>` of the services it uses, and a class keeps one
  such `desk` field. Services below `services.ts` take `Pick<DeskBase, ...>`, so nothing imports back
  up through it.
- No module-level state that does I/O. A module-level cache is bounded: by a size cap, or by a key
  there are few of, such as one entry per project.

**Errors and logging.**

- Throw an `Error` that says what failed, with `{ cause }` when rethrowing; a rejection carries an
  `Error` (`asError`). A refusal a seat reads is a return value (`no(...)`), never a throw.
- A `catch` that does nothing says why in one `//` line, and guards only best-effort cleanup or a
  probe.
- What the plugin says outside a project goes through `daemonLog` in `core/logger.ts`, the only file
  that touches `console`; the architecture test checks it.
- A kept file that cannot be read fails closed: nothing is written over it.

**Performance and memory.**

- A kept file is read once per operation: the ledger and the incident book through their stores, one
  read per transaction; a read-only view may use the stat-cached `readLedger`. Nothing a decision
  rests on is held across an `await`.
- Index before looping (a `Map` by id, a `Set` for membership), and build a `RegExp` once per call,
  not once per item.
- Every long-lived `Map` or `Set` has a removal path: on archive, once what it marks is settled, or a
  size cap. Every timer, subscription and child process is released in `dispose()`.
- Every promise is awaited or given a `.catch` that logs. Work that must not overlap per key runs
  through `KeyedQueue`, which lets idle keys go.

**Formatting.** Prettier at 120 columns, ESLint's type-checked rules, `tsc` with `strict` and
`noUncheckedIndexedAccess`. A `!` states an invariant the code guarantees. Split by concept, never by
line count: a module holds one concept and a function does one job, and a second concept or job gets
its own, however short.

**Tests.**

- Before writing a test, answer what contract it protects, what regression turns it red, why the
  existing tests miss it, and whether it needs an export only tests use. No answer, no test; extend
  the workflow's test or table first.
- A test is a workflow at the boundary a seat or the Human uses: tools called as a seat calls them
  through `test/runtime/harness.ts`, the panel's RPC, Paseo's hooks. Set it up once, assert each step.
- A race is decided by a gate the test holds and releases, never by a count of ticks or a sleep.
- Never write a test with no assertion, an expected value computed by the code under test, a copied
  inventory, a source grep other than the KEEP list, a second test of one contract, a mock that does
  the behaviour itself, or a ledger written by hand where the workflow would produce it.
- A contract moved to another test is proved there by a mutation that turns it red: mutate a copy of
  the file, restore from it, and only on a green suite.

## Conventions that differ from the defaults

- **One live contract, hard cut.** No dual path, version branch, shim, facade, old-shape adapter,
  legacy parser, read-time upgrade or fallback. Fail closed. Change every producer and consumer
  together, and audit the tests rather than syncing them.
- **Kept files have no format number before 3.0.0.** Until then a file the plugin keeps and cannot
  rebuild (ledger, incidents, project, meta, settings, outbox, intents, keys) changes
  shape with no upgrade step, since nothing has shipped. 3.0.0 locks the format as state 1 and brings
  back the upgrade steps, their fixtures and a shape test. Logs are only appended to, never migrated.
- **What a seat reads or is held to raises the version.** A change to `content/`, `harness/`, `mcp/`,
  `roles.json`, the desk's letters, briefs or directive, the git shim or `catalog/refused.json` raises
  `version` in `package.json`; `test/release.test.ts` checks it.
- **Tests protect a settled contract.** Unit tests only for money, state changes, permissions,
  migrations or concurrency; everything else gets one focused check at the level a user sees it.
- **A test that invents an API before its contract exists is a defect:** the next agent will bend the
  code to it. See `plugin/content/skills/peer/test-first/references/test-antipatterns.md`.
- **Fail first.** For every fix, put the old behaviour back and watch the new test fail. Green suites
  here have agreed with bugs before: one compared tool names where schemas mattered.
- **No dormant machinery.** No framework, abstraction or setting without a real consumer today.
- **`test/architecture.test.ts` is a ratchet** on import layers, cycles, unused exports, writes to
  the console, and agent or server names in code. Its list of known breaches only shrinks: move or fix
  the code, never add an entry.
- **No docs or decision records unless asked.** Git history is the record. No new markdown files
  either: plans stay outside the repository, and a change that needs explaining is explained in its
  commit message. The docs name nothing outside the repository but the paths the plugin itself uses.
- **Comments are few and short.** At most one docstring per function, method, class or type, one or
  two lines, saying what the name and code don't: why, a hidden constraint, a platform quirk. None on
  a field, member, constant or single line, and none that restates the code. Inside a body, a `//`
  only where the reason is invisible in the code, one line. A comment cleanup changes comments only:
  the code with comments stripped must print the same before and after.
- **Commit subjects:** one imperative sentence on what changed in behaviour, sentence case, no
  prefix, often two clauses, such as "Let the work decide how many agents run, not a quota". Never
  `fix:`/`feat:` or a file name.

## Paseo 0.10 facts that are easy to get wrong

- A plugin gives an agent tools through `mcpServers` in `before('agent.create')` and cannot change
  which servers it has later; a server can still change the tools it lists (`list_changed`), as both
  of the plugin's do. Afterwards only the model, mode, thinking option and feature values change, and
  the name and labels through `update_agent`.
- `toolPolicy` is `{preapproved}` only, which suppresses prompts. `mcpServers` adds tools;
  `providers.<id>.paseoTools.disabledTools` removes built-ins.
- `before('agent.create')` can't see `labels` (its payload is `.pick({config, env}).strict()`), so a
  seat's role lives in its provider string. Pass `labels` to `paseo.agents.create()` instead. Labels
  are an open, server-side queryable `Record<string,string>`.
- `systemPrompt` is set only at creation: a prompt change reaches a seat the next time one is created.
- History comes back projected whatever the request asks: a tool call is one entry in its latest
  state, and a run of text chunks one message. An entry's `seqEnd` can run past the entries after it,
  and an `after` page returns whole entries, restating rows before its cursor.
- Every message sent into a chat carries a `clientMessageId`; the client makes one when the sender
  gives none. A daemon restart, or a read of an archived agent, rebuilds the history from the agent's
  own transcript with none, so a user message without one has no known sender.
- `timeline.subscribe()` delivers live events only, prose and reasoning included. After a reconnect
  it sends `subscription_restored` and none of what was missed; a failed one sends `error` and is
  released. `timeline.append` writes a durable item into an agent's own timeline.
- The plugin's own client reconnects by itself, and its socket holds no lease. A plugin gets that
  client only with a hook or a panel call: after a reload, a seat's desk call waits for one, and its
  answer window starts then.
- `paseo.config.patch()` checks, saves and applies a change at once, with no daemon reload, and a
  plugin's API may call it. It merges a provider into the one Paseo holds (at every depth in memory, one
  level on disk), so a key goes only by removing the provider and adding it again, in two patches: one
  patch doing both leaves it removed in memory.
- SDK settings are host-scoped only (a runtime throw), hence the plugin's own revision-checked store.
- Only `before` hooks (`agent.create`, `agent.session_open`, `workspace.create`) can refuse, by
  throwing. Every hook call times out at 30 s, and on those three the timeout fails the user's action:
  no unbounded I/O there.
- The daemon and the app both check `requirements.paseo` in `paseo-plugin.json` and refuse to load a
  plugin whose range leaves them out.
- Paseo already ships `worktree.setup`/`teardown`, `create_heartbeat`, a PTY API and a
  `paseo.parent-agent-id` label. Look for a native facility before building one.

## SLP is the preset, not the plugin

- **Roles are data** in `roles.json`: `can` (capabilities: `supervise`, `lead`, `work`, `write`,
  `review`, `watched`, `judge`), `tools` (a set in `mcp/tools.json`), prompt, skills, defaults,
  `writes`, `follows`. Nothing in `server/` compares a role to a name; capabilities decide routing,
  acceptance, watching and judging.
- **A `roles.json` in the state root replaces the shipped one**, as does any catalog file of the same
  name there (a sensor by its id, in `sensor/`), so another arrangement needs no fork. Its roles may
  point at their own prompts and skills; a role of its own takes its sandbox, deltas and rules from
  the state root's `own/harness/<agent>/` first, or is `like` a role that has them. Going your own way
  inherits the machinery, not the wording.

## Where things live that you would not guess

- `plugin/content/**` is runtime content, not docs: prompts, skills and guides. An edit there changes
  what agents do. Write prompts and skills to work, not to a word count: every idea the agent needs, each once,
  with its reason, and nothing a tool description or a letter already says.
- `roles.json` `hidesWords` is a lint that throws: a Peer's prompt may not say "seat". Rephrase the
  text; never remove the lint.
- `plugin/harness/<agent>/settings/<role>.*` holds each role's sandbox and approval policy, and
  `plugin/harness/<agent>/delta/<role>.md` is runtime text added after that role's prompt on that
  agent: only what the agent's own instructions would lead the role wrong on.
- `plugin/mcp/code.mjs` is the shape to copy: no role names or workflow words, configured by data.
- `~/.paseo/daemon.log` is the live daemon log; the dated files beside it are dead.
- `NOTICE.md` is a license obligation. Never delete it.
