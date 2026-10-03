# Harness

How Seatworks runs Claude Code, Codex, Pi and OpenCode as members of the team. Read on 29 September 2026 against Claude
Code 2.1.284, Codex 0.158, Pi 0.87.1 and Paseo 0.10.1; Codex again on 2 October 2026 against Paseo 0.10.2's source
and Codex 0.154's own list of features; OpenCode on 3 October 2026 against Paseo 0.10.3's source and OpenCode
2.0.16's, both as installed; rooms on 4 October 2026 against Paseo 0.10.3's source and Claude Code 2.1.280, Pi 0.85.1,
Codex 0.154 and OpenCode 2.0.16 as installed.

Built: a harness file for each of the four. Every test runs against a stand-in for Paseo that refuses what Paseo's
source refuses. Claude Code and Pi were seen on live agents on 2 October 2026 (Seen on a live Paseo, below); Codex and
OpenCode have not been, and what only a live one can show is under To check. Oh My Pi had a harness file until
3 October 2026: Paseo registers its own tools with an Oh My Pi session itself, where nothing of Seatworks' can switch
them off, so the file was removed on the owner's word and OpenCode's written.

V1 wrote the same role policy five times, once in each agent's format: 55 harness files, 1,578 lines, and as many
lines of TypeScript to lay them out, one seat directory per role, agent and project, each started through a wrapper
that forced its flags. Seatworks states the policy once and holds it with guards that work the same on every agent;
an agent's own sandbox is a second line, used where Paseo reaches it. An agent still works from a folder of its own,
its room (below), but one harness file a provider says what a room holds and nothing is written by hand for a role.

## The policy, once

A role's properties (`KERNEL.md` §2) and its skills are all the harness reads. A harness file per provider,
`harness/<provider>.json`, holds the settings each property adds (`always`, `writes`, `reads`), the `home` its agent
is given (Rooms, below), and an `env` of variables its process is given: a string as it is, anything else as its
JSON, for an agent that reads its config from a variable. A string in it may name a place on the machine in braces:
`{plugin}`, `{node}` (what runs the plugin), `{socket}` (where an agent's tools reach it), `{home}` (the Human's home
directory) and `{room}` (the home being laid) in a home's files, `{git}` (the repository's git directory) in the
settings.

| Property  | Means for the agent                                                                            |
| --------- | ---------------------------------------------------------------------------------------------- |
| `writes`  | Works in its lane's worktree and commits there, on the lane's branch: what its scope holds and no open scope under it does. |
| otherwise | Works in that same worktree, or in the repository itself at the root, with its agent's own tools, so a Lead or a Reviewer can run what a decision or a review needs. It cannot commit. |
| always    | The team's tools. Its role prompt. Its role's skills and no other. None of what its agent brings for a team, a schedule or sending outside: no native subagents. No push, no branch move, no git outside its copy, or outside the repository for the root's agent. |

## Rooms

The owner's words on skills: "để cho tự agent đọc theo cách của nó vẫn tốt hơn là tự chế", and on a reminder the
plugin sent with a brief: "Skill do agent tự load luôn tốt hơn mày ép nó đọc". So the plugin lists no skill and tells
no agent to read one. Each agent finds its role's skills where it looks for skills itself, and loads one as it loads
any. And on what an agent brings of its own: "cấm toàn bộ skill/tool của agent native".

An agent's **room** is a home of its own: the folder its agent reads its config from, named to its process by the
one variable the agent has for it. There is one for each role of a project and each provider the role runs on, at
`projects/<project>/rooms/<role>/<provider>` under the state root. So:

- Two projects on one template have a room each for the same role, each with the skills of its own project's copy
  of the template, which only Sync changes.
- A project on another template has that template's roles and skills, whatever the first project holds.
- Every agent of a role in a project shares the room, as every session of a person's shares their home.
- A project that is removed takes its rooms with it, its agents' transcripts among them.

What a room holds is what its harness file's `home` says:

| In a room                                   | From                                   | When it is laid                              |
| ------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| `link`: the Human's login, nothing else of theirs | Their own home, linked so a refreshed login reaches both | Linked again each time |
| `files`: the agent's own config, in its own format | The harness file              | Written only where it says something else    |
| `skills`: a copy of each skill folder the role has | The project's copy of its template | A folder the role lacks is taken out and one that differs is copied again; a name that begins with a dot is the agent's own |
| What the agent keeps: sessions, caches, state | The agent                            | Never touched                                |

A room is laid when an agent is made and again each time its session opens, with the seat's environment
(`PASEO.md`). A skill Sync changed so reaches a role the next time one of its agents is made or reopened, as a
changed prompt does. The skills are copies: an agent is told the folder a skill lies in, and one wrote its note
there on a live run, which in a copy reaches no template.

A room needs one variable in its agent's environment and nothing else. Paseo builds an agent's process environment
from the daemon's, then its provider's entry in Paseo's config, then the agent's own, and for Claude Code it looks
for the agent's transcript under the `CLAUDE_CONFIG_DIR` of the agent's own environment. So no provider is written
into Paseo's config and no wrapper stands before an agent's command. A setup the owner pointed at does the same by
hand: a launcher set as a provider's `command` lays a runtime home for a role and then runs Codex.

| Agent       | Its home's variable   | Its config file | The Human's login                                   | Skills it would find elsewhere                              | What it brings itself                           |
| ----------- | --------------------- | --------------- | --------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Claude Code | `CLAUDE_CONFIG_DIR`   | `settings.json` | On macOS a keychain entry named after the config folder: `CLAUDE_SECURESTORAGE_CONFIG_DIR`, set empty, keeps the Human's own. Elsewhere `.credentials.json`, linked | None: it reads no home but its room. `syncClaudeAiSkills` and `syncClaudeAiPlugins` off and `disableClaudeAiConnectors` on, or it fetches its account's into the room | `disableBundledSkills`, and `DISABLE_DOCTOR_COMMAND` for the one that leaves; its own tools denied by name |
| Pi          | `PI_CODING_AGENT_DIR` | `settings.json` | `auth.json` and `models.json`, linked               | `~/.agents/skills`, left out by `skills: ["!{home}/.agents/skills/**"]`: a pattern is matched against a skill's full path | Nothing: its tools read, write, edit and run its shell |
| Codex       | `CODEX_HOME`          | `config.toml`   | `auth.json`, linked                                 | `~/.agents/skills`, and `skills/.system` where it puts those it brings: no switch for either, so each is written off by its path (`leaves`) | Its `[features]` beside its hands, switched off |
| OpenCode    | `OPENCODE_CONFIG_DIR`, a folder read beside its own config | None of Seatworks' | Left where it is, in its data folder | Not left out (To check)                              | A subagent and a question, denied               |

- **`leaves`** is for an agent that has no switch for the skills it finds outside its home. It names the folders
  they are under and a file of the room, and that file is given `each`, with `{path}` the real path of the skill's
  file, for every `SKILL.md` found there.
- **A repository's own skills** are left to each agent's own way. Claude Code reads `.claude/skills` in the
  worktree, with the `project` source Paseo sets; Codex reads `.agents/skills`; Pi reads none, since no project is
  trusted (below).
- **A model decides.** A skill is loaded when its model takes its description to fit the task (`TEMPLATE.md`, A
  skill). What was seen of that is under Seen on a live Paseo.

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
| Claude Code | `permissions.deny` in its room's `settings.json` names `mcp__paseo`: every tool of the server Paseo adds leaves its context | Denied there as `Bash(paseo *)`, beside the environment |
| Codex       | Its room's `config.toml` holds a server named `paseo`, switched off; the entry Paseo adds merges into it and stays off, and with none added the entry loads as it is | Forbidden by a rule in the home's `rules/`, beside the environment |
| Pi          | None reach it: Paseo hands them as an MCP server, and only when a probe it starts with the agent's own environment finds `pi-mcp-adapter`; its room loads no extension but Seatworks' own, so the probe finds none | The environment                                  |
| OpenCode    | Paseo's plugin registers them with OpenCode's server as `paseo_<tool>`. The config Seatworks hands that server denies `paseo_*` for every resource, which leaves a tool out of what the model is shown. The rule is written twice: for every agent, and last among `build`'s own, since a rule OpenCode reads for one agent comes after every rule for all | Denied as the `shell` rule `paseo *`, beside the environment |

The environment is the guard that holds however the command is called. Every agent's own process is given
`PASEO_HOST` naming a host that never resolves and an empty `PASEO_HOME`, when it is made and each time its session
opens, so Paseo's command line finds no daemon and its error names the host, which says why. With both variables set
its error tells the reader to pass `--home` or `--host`, which is why the home is left empty. The three rules that
match the command's text only refuse the usual form sooner, with a reason.

Read against Paseo 0.10.2 and 0.10.3 as installed, Claude Code's own documentation for 2.1.280, Codex 0.154.0, Pi
0.85.1 and OpenCode 2.0.16. Paseo's command line was run against a host that does not resolve; Codex's `mcp list`
and `execpolicy check` were run on the files as the harness writes them, alone and under the servers as Paseo hands
them; Pi was started as Paseo's probe starts it, under a home Seatworks laid, and listed no command of an adapter's; an
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
  harness file says so with `servers: false`. Paseo is then handed no server and no tool to approve, the agent's room
  gives it the team's tools, and a role given an outside server is not seated on that provider, the reason naming the
  server. Pi is so marked.
- **The team's own server is marked `alwaysLoad`**, so Claude never puts the team's tools behind a tool search,
  however many a server adds beside them.

## Each agent, through Paseo first

Paseo's `AgentSessionConfig` is the first way in: `systemPrompt`, `modeId`, `mcpServers`, `toolPolicy`,
`providerOptions`, env. An agent's own config file, in its room, holds what Paseo has no field for and what the
owner asked be said there: "vẫn dùng file setting.json (claude)".

### Claude Code

Its settings are a file in its room, and Paseo carries what it has a field for. Paseo's schema for Claude's options
is strict: `allowedTools`, `disallowedTools`, `additionalDirectories`, `extraArgs`, `sandbox`, and `settings` with
`permissions` and `sandbox` alone. A switch for a skill or a hook has no way through it.

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, appended to Claude's own                                                      |
| Team tools          | `mcpServers` and `toolPolicy`                                                                 |
| No prompts          | `modeId: bypassPermissions`; deny rules still win                                             |
| Its role's skills   | The room's `skills/`, which Claude Code reads as its user's own and lists by name and description; its `Skill` tool, which loads one, is left it |
| None of its own tools | `permissions.deny` in the room's `settings.json`, where a bare name takes a tool out of what the model is shown. For a team: `Agent`, `Workflow`, `SendMessage`, `ListAgents`. For a question or a plan put to a screen: `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`. For a schedule: `ScheduleWakeup`, `CronCreate`, `CronDelete`, `CronList`, `RemoteTrigger`. For a worktree of its own: `EnterWorktree`, `ExitWorktree`. For sending outside the team: `Artifact`, `SendUserFile`, `PushNotification`, `ShareOnboardingGuide`, `SendFeedback`, `DesignSync`, `ReportFindings` |
| None of its own skills | `disableBundledSkills` in the room's `settings.json`, and `DISABLE_DOCTOR_COMMAND` in its environment for the one that setting leaves |
| Nothing of their account | `syncClaudeAiSkills` and `syncClaudeAiPlugins` off and `disableClaudeAiConnectors` on, in the room's `settings.json`: logged in to claude.ai, Claude Code otherwise brings the account's skills, plugins and connectors into the folder it reads its config from |
| No sleep in a turn  | `ScheduleWakeup` is among those denied: Paseo keeps the turn open while the agent sleeps, and mail waits for a turn's end |
| Mail into a turn    | A `PostToolBatch` hook in the room's `settings.json`                                          |
| Writer              | `providerOptions.sandbox`: `enabled`, `failIfUnavailable`, `allowUnsandboxedCommands: false`. The one thing that differs by role, and Paseo has the field |
| Context             | Claude reads `AGENTS.md` itself since 2.1.277: V1's CLAUDE.md import goes                     |
| The Human's own     | Not read: their settings, skills, plugins, servers and memory are in their own home. A variable their Claude needs, a key or a provider's address, is set on Paseo's `claude` provider, whose `env` every agent of it is given |

Each tool is denied for a reason the record already has a way for: a team's agent seats nobody and messages nobody
but through the team's tools, waits by ending its turn, works in the worktree it was seated in, and shows its work
by a commit. A plan mode waits for an approval at a screen nobody sits at. `ReportFindings` hands findings to an
app's panel, where no owner reads them.

### Codex

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, sent as `developerInstructions`                                               |
| Team tools          | `mcpServers` and `toolPolicy`: Paseo enables only the tools named and approves each           |
| No prompts          | `modeId: auto` with the option `approval_policy: never`: its sandbox holds, and nothing asks  |
| Writer              | `sandbox_workspace_write.writable_roots` gains the repository's git directory (`{git}`), which Codex keeps read-only inside a worktree otherwise, so a commit can be made |
| Not writing         | The same, in the worktree it shares, without the git directory among its writable roots        |
| No subagents        | `features.multi_agent_v2: false` through Paseo. `features.multi_agent`, which Codex 0.154 has on, is not among the options Paseo takes, so it is switched off in the room's `config.toml` |
| None of its own     | `[features]` in the room's `config.toml`, each `false`: `apps`, `plugins`, `tool_suggest`, `sleep_tool`, `goals`, `browser_use`, `browser_use_external`, `computer_use`, `image_generation`. `codex features list` under a laid room reads each back as off |
| Its role's skills   | The room's `skills/`, which Codex 0.154 reads as its user's own. Every skill under `~/.agents/skills`, and under `skills/.system` where Codex puts those it brings once it has started in a home, is written off in `config.toml` with `[[skills.config]]`, its path and `enabled = false` |

The room holds that `config.toml`, the rule that forbids Paseo's command line and a link to the Human's `auth.json`.
The Human's own `config.toml` is not read there: a model provider or a server they set up in it does not reach a
team's agent. Codex has no switch for a folder of skills: `skills.config` names one skill, and its feature
`skip_host_skill_discovery`, set, left the Human's on. Asked through its own server with no model
(`skills/list`), a Peer's room gave: on its first start the room's eleven on, the Human's 51 off and the six Codex
brings on; once the room was laid again, the room's eleven and no other.

### Pi

Pi has no permissions, no sandbox, no modes and no MCP of its own. Paseo 0.10.1 hands it MCP servers only when the
Human has `pi-mcp-adapter` installed, found by starting Pi once and looking for its `/mcp` command; otherwise it
drops them without a word. Paseo passes Pi only its own `--extension`, and `extraArgs` are the provider's, not an
agent's. So what Pi needs is in its room, named by `PI_CODING_AGENT_DIR` (`harness/pi.json`):

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, appended by Paseo's extension                                                 |
| Team tools          | `harness/pi/extension.ts`, named in the room's `settings.json`: it asks the plugin's socket for the agent's tools, as `bin/team.ts` does, and registers them with their JSON Schemas, which Pi takes as they are. Paseo is handed no server and no tool policy (`servers: false`) |
| The Human's login   | `auth.json` and `models.json` linked from their own Pi home, so a refreshed login reaches both |
| Its role's skills   | The room's `skills/`, which Pi reads as its user's own, lists in its prompt and has its agent read as files. `~/.agents/skills`, which Pi reads whatever its home is, is left out by a pattern on its full path |
| None of its own     | Pi has no subagent, brings no skill, and its tools are `read`, `write`, `edit`, `grep`, `find`, `ls` and its shell; the room's settings load no extension or package but Seatworks' |
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
| The Human's login and config | As they are: `OPENCODE_CONFIG_DIR` adds a folder to those OpenCode reads and replaces none. Their providers, models, servers and plugins reach a team's agent |
| Its role's skills   | `skills/` in its room, which `OPENCODE_CONFIG_DIR` names. Not seen to reach an agent (To check) |
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
| Claude Code | A `PostToolBatch` hook in its room's `settings.json`, which fires once a batch of tools has run and before the next model call. It runs `seatworks-mail` from the directory of the git guard, and what that prints is the hook's `additionalContext`, 10,000 characters at most |
| Pi          | Its extension's `tool_result` handler sends the mail with `deliverAs: "steer"`, which Pi delivers after the turn's tool calls and before the next model call |
| Codex       | None yet. Its `PostToolUse` hook takes `additionalContext`, but a hook that is not managed must be trusted through `/hooks` first |
| OpenCode    | None yet                                                                                              |

- **Silent while nothing waits.** The plugin keeps a file for each seat, named to the agent as `SEATWORKS_MAIL`,
  empty unless something may enter. Claude's launcher tests it in the shell and starts no process otherwise: a hook
  that spawns one at every step was measured at most of a second a step elsewhere. Pi's extension holds the line
  open and asks.
- **Never the Human's config.** Paseo's own "terminal agent hooks" write `~/.claude/settings.json`,
  `~/.codex/hooks.json` and an OpenCode plugin, for every session on the machine, and only to learn whether an agent
  in one of its terminals runs or idles. Seatworks' hook is in the room of an agent it seats and nowhere else, and
  nothing of the Human's is written.
- **What a timeline shows.** Claude's hook text is in no timeline Paseo keeps. Pi's is listed as the agent's own
  words: the plugin knows it by its first words and counts none of it as said by the agent.
- No launcher is written on Windows.

## Role prompts

One prompt per role. An agent gets a note of its own only where its base prompt would lead the role wrong; none
does today. V1's seven near-copies of the same notes go.

## What V1 did that Seatworks drops

| V1                                                          | Seatworks                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| A seat directory per role, agent and project, its files written by hand for each | A room per role, provider and project, laid from one harness file a provider |
| Claude's seat-room wrapper and forced flags                 | One variable in the agent's own environment, which Paseo follows |
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
- **A review by rule.** A commit with three planted faults, an injection and two functions that contradict their own
  comments, was reviewed three times by a Reviewer with the `open-code-review` skill, `ocr` 1.12.11 on its `PATH`.
  Each ran `ocr delegate preview --commit` and `ocr delegate rule`. On Claude Haiku 4.5 it found the injection and
  called the other two correct. On Claude Sonnet 5 and on Pi (`zai/glm-5.3-flash`) it found all three, running the
  commit's own file to show two of them. The method held on both agents; what a review finds is its model's.
  A Claude agent asked its own `Skill` tool for the skill first and was told there was none, so the list of skills
  now says each is a file to read.
- **Skills.** A skill listed only in an agent's standing instructions went unread: a Peer given a screen read its
  brief and built. A Peer given a question asked Claude Code's `Skill` tool for `research` and was handed the Human's
  own skill of that name, from their home, in place of the template's. With that tool denied, and an agent's first
  words ending in the names of its skills to read before it starts, the Peer on Claude Code read `research` and
  `frontend-design` and the Peer on Pi `design-note`, and each note came back in the form its skill gives.
- **Waiting.** Told only that it would be told of an outcome, an agent stayed in its turn, where nothing reaches it
  (`COMMUNICATION.md`, When a reader is woken). With the first words that say how it waits, a Lead did a lane in
  five calls.

On 4 October 2026, on Paseo 0.10.3, the same way, for the rooms: two projects at once, one on SLP and one on a
copy of SLP under another name whose Peer has two skills, each Supervisor on Claude Code (Sonnet 5), SLP's Peer on
Claude Code (Haiku 4.5) and the other's on Pi (`zai/glm-5.3-flash`). Each Supervisor seated one Peer on a small
task, took it in and landed it.

- **A room each.** Each agent's room lay under its own project: a Supervisor's with its seven skills in both, SLP's
  Peer's with its eleven, the other template's Peer's with its two. Nothing of the run was written under the
  Human's own `~/.claude`: an agent's sessions are in its room.
- **What Claude Code listed.** Read from each agent's transcript in its room: its role's skills and no other, by
  the names its template gives them; no skill Claude Code brings, no plugin, no connector; and of its own tools
  beyond its hands only `Monitor`, `NotebookEdit`, `TaskStop`, `WebFetch` and `WebSearch`.
- **The account.** The first rooms had no switch for the Human's claude.ai account. Within a minute of an agent's
  start Claude Code had put the account's fourteen skills under `skills/synced` and two plugins under
  `plugins/synced`, after the session's own list was made. With the three switches, a session as long brought
  nothing.
- **Login, and a session opened again.** No agent was asked to log in. After the daemon was stopped and started, a
  Supervisor's session opened from its room, went on in the transcript it had there, named its seven skills and
  reached the team's tools.
- **Mail into a turn**, from the hook in a room's `settings.json`: a direction a Supervisor sent its Peer entered
  the Peer's turn after its first tool, and the screen was built as directed.
- **No skill was loaded by either Peer.** The one on Haiku 4.5 wrote its screen and the one on `glm-5.3-flash` its
  function before its test, each with a skill for exactly that listed. Outside Paseo, with the words a seat is
  given (the Peer's prompt, its first words, its room): Haiku loaded none in 3 runs; Sonnet 5 loaded
  `frontend-design` in 2 of 2; Haiku with a section on skills added to the Peer's prompt, in 2 of 4. Given a bare
  brief and no role, Haiku loaded the fitting skill in 0 of 6 runs with SLP's descriptions as they were, and in 5 of
  6 once two of them opened with when to use the skill; Sonnet 5 in 4 of 4 either way. The first build's reminder,
  each skill named at the end of an agent's first words, had Haiku read one in 4 of 4. The owner chose the agent's
  own loading over the reminder, and SLP's descriptions open with when to use each since.
- **A note written into a skill's folder.** Told the folder a skill lies in, an agent on Haiku wrote its research
  note there. In a room the folder is a copy, and SLP's skills now say the note is a file in the repository.

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
- A repository's own `.claude/` reaches a Claude agent, since `project` and `local` are among the sources Paseo
  sets: its skills, and the hooks or servers its settings name, as its `AGENTS.md` does. A second
  `--setting-sources` through `extraArgs` comes after Paseo's and wins (run on 2.1.280), and would cut all of it,
  the instructions too.
- Claude Code's login from a room on Linux and on Windows. On macOS the keychain entry is kept by a variable that
  is in its binary and not in its documentation; where the login is a file, the link is all that was built, and
  neither was run there. Lost, an agent says it is not logged in and does nothing.
- On a live Codex: the first agent of a role in a project starts with the six skills Codex brings on, since their
  folder is there only once Codex has started in the room; they are written off from the next time it is laid.
- On a live OpenCode: that an agent finds the skills in its room at all. OpenCode 2.0.16's own server, asked with
  no session (`GET /api/skill`), listed no skill, neither the Human's nor a room's; and nothing leaves the Human's
  own skills out for it yet, where its `permission.skill` could by name.
- A model that leaves a skill unloaded (Seen on a live Paseo, 4 October). What a template can do about it is in its
  own words: a skill's description, a role's prompt.
- Claude Code's own memory is on, and in a room it is one role's in one project: what an agent writes there the
  next agent of that role reads. Nothing was seen written there.
- On a live Paseo with `daemon.mcp.injectIntoAgents` on: that a Claude, a Codex, a Pi and an OpenCode agent of a
  team are shown none of Paseo's tools. None has been seen there; each was read and run as far as it goes with no
  agent started (Paseo's own tools and command line, above).
