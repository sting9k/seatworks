# Harness

How Seatworks runs Claude Code, Codex, Pi and OpenCode as members of the team. Read on 29 September 2026 against Claude
Code 2.1.284, Codex 0.158, Pi 0.87.1 and Paseo 0.10.1; Codex again on 2 October 2026 against Paseo 0.10.2's source
and Codex 0.154's own list of features; OpenCode on 3 October 2026 against Paseo 0.10.3's source and OpenCode
2.0.16's, both as installed.

Built: a harness file for each of the four. Every test runs against a stand-in for Paseo that refuses what Paseo's
source refuses. Claude Code and Pi were seen on live agents on 2 October 2026 (Seen on a live Paseo, below); Codex and
OpenCode have not been, and what only a live one can show is under To check. Oh My Pi had a harness file until
3 October 2026: Paseo registers its own tools with an Oh My Pi session itself, where nothing of Seatworks' can switch
them off, so the file was removed on the owner's word and OpenCode's written.

V1 wrote the same role policy five times, once in each agent's format: 55 harness files, 1,578 lines, and as many
lines of TypeScript to lay them out, one seat directory per role, agent and project. Seatworks states the policy once and
holds it with guards that work the same on every agent; an agent's own sandbox is a second line, used where Paseo
reaches it.

## The policy, once

A role's properties (`KERNEL.md` §2) are all the harness reads. A harness file per provider, `harness/<provider>.json`,
holds the settings each property adds (`always`, `writes`, `reads`) and, where the agent needs one, a `home` laid
out under the plugin's state root and named to the agent through one variable, or an `env` of variables its process
is given: a string as it is, anything else as its JSON, for an agent that reads its config from a variable. A string
in it may name a place on the machine in braces: `{plugin}`, `{node}` (what runs the plugin), `{socket}` (where an
agent's tools reach it) in a home's files, `{git}` (the repository's git directory) in the settings.

| Property  | Means for the agent                                                                            |
| --------- | ---------------------------------------------------------------------------------------------- |
| `writes`  | Works in its lane's worktree and commits there, on the lane's branch: what its scope holds and no open scope under it does. |
| otherwise | Works in that same worktree, or in the repository itself at the root, with its agent's own tools, so a Lead or a Reviewer can run what a decision or a review needs. It cannot commit. |
| always    | No native subagents. The team's tools. Its role prompt. No push, no branch move, no git outside its copy, or outside the repository for the root's agent. |

## Guards that hold on every agent

1. **Worktrees.** The root's agent works in the repository. Every other agent works in its lane's worktree, which
   the lane's writers and readers share (`PORTS.md`, Workspace). The first build gave every role that does not write
   a throwaway copy, so an edit there landed where nothing read it and the copy was the guard. In a shared worktree
   it is not: a reader's edit lies in the folder a writer commits from. What holds is the git guard below: a reader
   cannot commit, and a writer can take nothing a neighbour holds into a commit. What stops the edit itself is the
   reader's prompt and no more. No agent's tools are cut for it yet (To check).
2. **Only commits count.** The kernel integrates a writer's commits and nothing else (I4, I5), so no stray edit
   reaches a lane.
3. **One git guard.** The shim first on every agent's `PATH` refuses push, pull, checkout, switch, update-ref,
   symbolic-ref, stash, worktree changes, forced, copying or deleting branch moves (short flags run together too), a
   fetch into a local branch, an alias that runs a shell, and git outside the agent's own copy. For a role without `writes` it also refuses what makes a commit or moves the
   branch: commit, merge, reset, rebase, cherry-pick, revert and am. It reads the role's properties from the
   agent's environment, so the five per-agent git deny lists of V1 go.
4. **Its own, in a worktree others work in.** The owner asked that Paseo's worktrees be used strictly, with nothing
   left loose: "quản lý chặt việc sử dụng worktree của paseo nhé không thả lỏng ra". So where a seat shares its
   worktree, any seat of a lane but a writer that has the lane to itself and seats nobody, the same shim holds its
   git to what is its own. A file is the innermost open scope's that holds it (I1, I2). The plugin keeps a file for
   each such seat, written again as the record moves, that says whose each path of the lane is, the first line
   that holds a file deciding: first what the scopes under it hold, which it handed out; then its own; then the
   rest, a neighbour's and what a writer over it kept. An owner over it that does not write is no line: what it
   holds is written by whoever it seats. To stage, commit or drop the edits of a file that is another's is
   refused, naming the file, the scope and the path it holds; what git would take is read from git's own dry run,
   so `add -A` and `commit -a` are held as a named file is. Reset, rebase, clean and amending a commit are refused
   there outright: each takes away or rewrites more than one's own. A file nobody holds is anyone's to write.
5. **A lane's owner merges by hand.** When its lane must take its parent's branch in, it runs the merge itself and
   concludes it, settling any file whoever holds it. One whose role does not write is let merge, and commit only
   while a merge waits to be concluded; one that writes is held to its own in every other commit.

Rules that match a command's text (Claude's `Bash(git push *)`, Codex's exec policy, OpenCode's `shell` rules)
are passed by `git -C`, an alias or a full path; Seatworks does not rely on them.

## Paseo's own tools and command line

A team's agent is left none of Paseo's own. Its tools list, read and prompt every agent on the daemon, and so does
its command line (`paseo ls`, `logs`, `send`), which asks a local daemon for no credential: either takes an agent
past the record, where a word to a Peer reaches its Lead, and past the watch, which the watched never learn of
(`PASEO.md`, What Seatworks does not take). Paseo gives its tools when the Human has `daemon.mcp.injectIntoAgents`
on, by provider and never by agent, and a create has no field for them, so each harness switches them off where it
can:

| Agent       | Paseo's tools                                                                              | Its command line                                 |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Claude Code | `permissions.deny` names `mcp__paseo`: every tool of the server Paseo adds leaves its context | Denied as `Bash(paseo *)`, beside the environment |
| Codex       | The shared `config.toml` holds a server named `paseo`, switched off; the entry Paseo adds merges into it and stays off, and with none added the entry loads as it is | Forbidden by a rule in the home's `rules/`, beside the environment |
| Pi          | None reach it: Paseo hands them as an MCP server, and only when a probe it starts with the agent's own environment finds `pi-mcp-adapter`; Seatworks' home loads no extension but its own, so the probe finds none | The environment                                  |
| OpenCode    | Paseo's plugin registers them with OpenCode's server as `paseo_<tool>`. The config Seatworks hands that server denies `paseo_*` for every resource, which leaves a tool out of what the model is shown. The rule is written twice: for every agent, and last among `build`'s own, since a rule OpenCode reads for one agent comes after every rule for all | Denied as the `shell` rule `paseo *`, beside the environment |

The environment is the guard that holds however the command is called. Every agent's own process is given
`PASEO_HOST` naming a host that never resolves and an empty `PASEO_HOME`, when it is made and each time its session
opens, so Paseo's command line finds no daemon and its error names the host, which says why. With both variables set
its error tells the reader to pass `--home` or `--host`, which is why the home is left empty. The three rules that
match the command's text only refuse the usual form sooner, with a reason.

Read against Paseo 0.10.2 and 0.10.3 as installed, Claude Code's own documentation for 2.1.280, Codex 0.154.0, Pi
0.85.1 and OpenCode 2.0.16. Paseo's command line was run against a host that does not resolve; Codex's `mcp list`
and `execpolicy check` were run on the files as the harness writes them, alone and under the servers as Paseo hands
them; Pi was started as Paseo's probe starts it, under Seatworks' home, and listed no command of an adapter's; an
OpenCode server was started as Paseo starts one, with the config and the rules Paseo's own code builds from the
harness file, a session made on it, and its agent's rules read back: the last rule for `paseo_*`, a subagent and a
question is a denial for every resource, and the team's tools, git and a read outside the copy are allowed. No
provider of Paseo's reads either variable. No agent was started and no model asked for any of it.

## Outside tool servers

A role may be given an MCP server that is not the team's (`TEMPLATE.md`). It is handed to Paseo beside the team's own,
its named tools approved ahead.

- **It is outside every guard above.** A server is a process of its own: it runs no git through the shim, is confined
  to no copy, and may write where it likes. The guards hold against an agent's mistakes, not against what a template's
  author chose to start. The Human sees each server and its command before a template is installed.
- **Paseo takes servers for three providers only.** Its registry lets Claude, Codex and OpenCode pre-approve exact
  tools, and refuses a create that carries a tool policy for any other; it refuses MCP servers for a provider that
  cannot take them, Pi among them unless the Human has `pi-mcp-adapter`, which the plugin cannot see. A
  harness file says so with `servers: false`. Paseo is then handed no server and no tool to approve, the agent's home
  gives it the team's tools, and a role given an outside server is not seated on that provider, the reason naming the
  server. Pi is so marked.
- **The team's own server is marked `alwaysLoad`**, so Claude never puts the team's tools behind a tool search,
  however many a server adds beside them.

## Each agent, through Paseo first

Paseo's `AgentSessionConfig` is the first way in: `systemPrompt`, `modeId`, `mcpServers`, `toolPolicy`,
`providerOptions`, env. An agent's own config files are used only where Paseo cannot reach.

### Claude Code

Everything through Paseo; no config directory of Seatworks' own, so the Human's login is used as it is.

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, appended to Claude's own                                                      |
| No subagents        | `providerOptions.settings.permissions.deny`: `Agent`, `Workflow`                              |
| Team tools          | `mcpServers` and `toolPolicy`                                                                 |
| No prompts          | `modeId: bypassPermissions`; deny rules still win                                             |
| No sleep in a turn  | `permissions.deny`: `ScheduleWakeup`. Paseo keeps the turn open while the agent sleeps, and mail waits for a turn's end |
| Mail into a turn    | `providerOptions.extraArgs`: `plugin-dir`, the plugin's own `harness/claude`, a Claude Code plugin whose one hook runs at `PostToolBatch` |
| Writer              | `providerOptions.sandbox`: `enabled`, `failIfUnavailable`, `allowUnsandboxedCommands: false`   |
| Context             | Claude reads `AGENTS.md` itself since 2.1.277: V1's CLAUDE.md import goes                     |

### Codex

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, sent as `developerInstructions`                                               |
| Team tools          | `mcpServers` and `toolPolicy`: Paseo enables only the tools named and approves each           |
| No prompts          | `modeId: auto` with the option `approval_policy: never`: its sandbox holds, and nothing asks  |
| Writer              | `sandbox_workspace_write.writable_roots` gains the repository's git directory (`{git}`), which Codex keeps read-only inside a worktree otherwise, so a commit can be made |
| Not writing         | The same, in the worktree it shares, without the git directory among its writable roots        |
| No subagents        | `features.multi_agent_v2: false` through Paseo. `features.multi_agent`, which Codex 0.154 has on, is not among the options Paseo takes, so it is switched off in one `config.toml`, shared by every Seatworks Codex agent through `CODEX_HOME` |

The shared `CODEX_HOME` holds that `config.toml` and a link to the Human's `auth.json`, nothing per role. The Human's
own `config.toml` is not read there: a model provider or a server they set up in it does not reach a team's agent.

### Pi

Pi has no permissions, no sandbox, no modes and no MCP of its own. Paseo 0.10.1 hands it MCP servers only when the
Human has `pi-mcp-adapter` installed, found by starting Pi once and looking for its `/mcp` command; otherwise it
drops them without a word. Paseo passes Pi only its own `--extension`, and `extraArgs` are the provider's, not an
agent's. So Seatworks gives every Pi agent one home of its own, through `PI_CODING_AGENT_DIR` (`harness/pi.json`):

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, appended by Paseo's extension                                                 |
| Team tools          | `harness/pi/extension.ts`, named in the home's `settings.json`: it asks the plugin's socket for the agent's tools, as `bin/team.ts` does, and registers them with their JSON Schemas, which Pi takes as they are. Paseo is handed no server and no tool policy (`servers: false`) |
| The Human's login   | `auth.json` and `models.json` linked from their own Pi home, so a refreshed login reaches both |
| No subagents        | Pi has none; the home's settings load no extension or package but Seatworks'                        |
| No planted config   | `defaultProjectTrust: "never"`: Pi in RPC mode then skips a copy's `.pi` extensions and settings, so an agent cannot plant one for another |
| Writer              | Its worktree and the git shim; nothing native confines it                                     |

### OpenCode

OpenCode 2, which Paseo runs as a server of OpenCode's own and speaks to over its API. Paseo starts one server for
an agent alone when the agent has a server of its own or a variable beyond the two Paseo sets, which every agent of
a team has, so the seat's environment is the server's and its shell's. Everything a team needs is a rule of
OpenCode's permissions: the last rule that matches decides, a session's rules come after its agent's, and a tool
whose last rule denies every resource is left out of what the model is shown (`harness/opencode.json`).

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, which Paseo keeps as an instruction of the session                            |
| Team tools          | `mcpServers` and `toolPolicy`: Paseo adds the server for the agent's directory and gives the session an allowing rule for each tool named |
| The agent           | `modeId: build`, the agent OpenCode ships for building, whatever the Human's profile names: its `plan` denies edits |
| No prompts          | `options.permission`: `read` and `external_directory` allowed, which OpenCode otherwise asks for a `.env` file and for a path outside the copy. With a tool policy Paseo answers nothing itself, so what a rule of the Human's own still asks goes to the owner above as any permission does |
| No subagents        | `options.permission.task: deny`, which Paseo writes as OpenCode's `subagent`                  |
| No question to a screen | `options.permission.question: deny`: a question goes through the team's tools             |
| Paseo's own tools   | `env.OPENCODE_CONFIG_CONTENT`, the config OpenCode reads last: Paseo's schema for its options is strict and has no place for a tool by name, and it adds its own plugin to that config |
| The Human's login and config | As they are: no home of Seatworks' own. Their providers, models, servers and plugins reach a team's agent |
| Writer              | Its worktree and the git shim; nothing native confines it                                     |

OpenCode reads a copy's own `opencode.json` and `.opencode/`, and a rule there for the agent comes after the
Human's. Seatworks' rule for `build` is in the config read last, so it still decides for Paseo's tools; the session's
rules decide for the rest. `OPENCODE_DISABLE_PROJECT_CONFIG` would stop a copy's config being read at all, and with
it the repository's `AGENTS.md`, so it is not set.

The file is for OpenCode 2. Paseo still runs OpenCode 1 when that is what `opencode --version` says, and hands it
the same config with its plugin under a key of version 1: a config of both versions is not one Seatworks has read
OpenCode 1 take.

## Mail into a turn

Where a team's template lets mail into a turn (`COMMUNICATION.md`, Into a turn), the door is the agent's own hook at
the pause between two of its steps. It holds no rule: it asks the plugin, over the socket the agent's tools use and
with the agent's key, what may enter now, and the plugin's answer is the mail or nothing.

| Agent       | The door                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Claude Code | A `PostToolBatch` hook, which fires once a batch of tools has run and before the next model call. It runs `seatworks-mail` from the directory of the git guard, and what that prints is the hook's `additionalContext`, 10,000 characters at most |
| Pi          | Its extension's `tool_result` handler sends the mail with `deliverAs: "steer"`, which Pi delivers after the turn's tool calls and before the next model call |
| Codex       | None yet. Its `PostToolUse` hook takes `additionalContext`, but a hook that is not managed must be trusted through `/hooks` first |
| OpenCode    | None yet                                                                                              |

- **Silent while nothing waits.** The plugin keeps a file for each seat, named to the agent as `SEATWORKS_MAIL`,
  empty unless something may enter. Claude's launcher tests it in the shell and starts no process otherwise: a hook
  that spawns one at every step was measured at most of a second a step elsewhere. Pi's extension holds the line
  open and asks.
- **Never the Human's config.** Paseo's own "terminal agent hooks" write `~/.claude/settings.json`,
  `~/.codex/hooks.json` and an OpenCode plugin, for every session on the machine, and only to learn whether an agent
  in one of its terminals runs or idles. Seatworks' hook is loaded for the agents it seats alone, from its own
  folder, and nothing of the Human's is written.
- **What a timeline shows.** Claude's hook text is in no timeline Paseo keeps. Pi's is listed as the agent's own
  words: the plugin knows it by its first words and counts none of it as said by the agent.
- No launcher is written on Windows.

## Role prompts

One prompt per role. An agent gets a note of its own only where its base prompt would lead the role wrong; none
does today. V1's seven near-copies of the same notes go.

## What V1 did that Seatworks drops

| V1                                                          | Seatworks                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| A seat directory per role, agent and project                | None for Claude and OpenCode; one shared home each for Codex and Pi |
| Claude's seat-room wrapper and forced flags                 | Paseo's options                                      |
| Git deny lists in five formats                              | The one shim, reading the role's properties          |
| A provider per role and agent written into Paseo's config    | None while Paseo's tools stay off, as they are by default |
| Rewriting Codex's model catalog                             | `agents.enabled = false`, if it holds (below)        |
| Tuning values nobody recorded a reason for                  | Gone until a reason is written down                  |

## Seen on a live Paseo

On 2 October 2026, on Paseo 0.10.2: a daemon of its own with its own home and state root, a throwaway repository with
a bare remote, SLP as it comes, the Supervisor and the Lead on Claude Code (Opus 5.5, medium) and the Peer and the
Reviewer on Pi (`zai/glm-5.3-flash`). Four small runs, each landed and published: one Peer under the root; a lane
with two Peers; a lane with a Peer that raised a finding, a Reviewer, a report and a question to the Human; and one
Peer on Claude Code under the root.

- **Claude Code.** Made with the team's server and its tools approved ahead; the server said hello before the first
  turn; no permission was asked. Its tools went on answering after the plugin was loaded again, four times. A writer
  on it, under the sandbox its harness file asks for, committed in its own worktree and handed back as Pi's did.
- **Pi.** Made, with no server and no tool handed to Paseo; the extension in Seatworks' home gave it its role's tools.
  A Peer ran checks of its own, raised a finding and handed back; a Reviewer recorded a verdict. A writer's commits
  were made through the git shim in its own worktree.
- **The mailbox.** What the Human sent reached the Supervisor at its turn's end; a Lead was told of a hand-back and
  of its checks' result in one numbered message.
- **Not seen.** A permission asked; a turn that failed; the reflex, which had no key there.
- **`look` at an agent whose seat has ended** finds nothing: the record no longer has its agent. Whoever takes a lane
  in cannot ask its owner anything once it is in.

On 3 October 2026, on Paseo 0.10.3, the same way, with every agent on Claude Code and each lane in a worktree
Paseo made (`PASEO.md`, Seen on a live daemon):

- **The git guard in a shared worktree.** A Peer that held `notes/a/` wrote a file under its neighbour's `notes/b/`
  and ran `git add` on it: refused, naming the neighbour's scope and what it holds. A Peer's `git commit --amend`
  was refused, a Lead's `git commit` and `git checkout`, and `git worktree` for everyone. A Lead told to take the
  base in ran `git merge main` in the lane's worktree, settled the file by hand, and its commit that concluded the
  merge passed.
- **Two lanes that met.** Each appended a line to a file neither held. The first landed; nothing was merged for
  the second, the root's owner was told the file and the commit the base had taken in, sent the lane back with its
  decision, and the lane landed with both lines after its Lead's merge.
- **A Lead wrote.** Two Leads of five wrote their lane's files themselves, in the worktree they share with their
  Peer, staged them and tried to commit, which was refused. One left its files there: the Peer seated after found
  them and committed them. So the edit of a role that does not write does reach a commit, through a writer beside
  it. The owner's answer was to let a Lead write what is too small to hand out: SLP's Lead writes since, held by
  the guard to what it has not handed out. A Reviewer, and a lane's owner of a template that does not write,
  are held by their prompt still.
- **A Lead that writes.** Run again the same day with SLP's Lead given `writes`. Two Leads each judged their ticket
  small, a typo and a function with its test, and did it themselves with nobody seated; both lanes landed. A third,
  told to split, seated a Peer on two files by name and wrote a third itself. The Peer's `git add` of the file its
  Lead kept was refused, naming the lane's scope and what it holds; the Lead's `git add` of a file it had handed
  out was refused, naming the Peer's. A Lead on Claude Code works under the writer's sandbox since, and did all
  of it there.
- **Mail into a turn.** Run the same day with SLP's two numbers, 120 and 90 seconds. A Peer on Claude Code (Haiku
  4.5), in one turn that made twelve files with a `sleep` between them, was sent a direction by the Human when it had
  made two: it entered 4.6 seconds later, at the Peer's next pause, and the third file on followed it; the brief its
  Lead amended over its own copy of the direction entered ten seconds after that. The hook ran for a writer under
  its sandbox and reached the plugin's socket. A Peer on Pi (`zai/glm-5.3-flash`) was sent one with three files
  made: it entered six seconds later, after a tool's result, and the fourth file on followed it. Left to itself that
  Peer ended its turn after every file, since its brief said a message might come, and mail reached it between turns
  as it always has.
- **Waiting.** Told only that it would be told of an outcome, an agent stayed in its turn, where nothing reaches it
  (`COMMUNICATION.md`, When a reader is woken). With the first words that say how it waits, a Lead did a lane in
  five calls.

## To check before building on it

- A role that does not write, held from writing in the worktree it shares: which of each provider's own settings
  does it (a read-only sandbox, denied edit tools) without stopping what a Lead or a Reviewer runs to decide, such
  as a build or a test that writes its own output, and without stopping the lane's owner from settling a merge by
  hand. Until then its prompt is all that holds it, and on a live run it did not (Seen on a live Paseo).
- On a live Codex: that a writer commits with the repository's git directory among its writable roots, and that
  `features.multi_agent = false` leaves it no tool to start an agent with.
- On a live OpenCode: that the team's server is connected before the first turn, that the shim is first on the
  `PATH` of its shell, that a writer commits in its worktree, and that nothing asks. Whether a plugin or a server a
  copy's own `.opencode/` names is loaded for the next agent that works in that worktree.
- Whether Paseo's fixed `settingSources` let a project's `.claude/settings.json` add hooks or servers to a Claude
  agent, and whether `extraArgs` can narrow them.
- On a live Paseo with `daemon.mcp.injectIntoAgents` on: that a Claude, a Codex, a Pi and an OpenCode agent of a
  team are shown none of Paseo's tools. None has been seen there; each was read and run as far as it goes with no
  agent started (Paseo's own tools and command line, above).
