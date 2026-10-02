# Harness

How Seatworks runs Claude Code, Codex, Pi and Oh My Pi as members of the team. Read on 29 September 2026 against Claude
Code 2.1.284, Codex 0.158, Pi 0.87.1, Oh My Pi 18.4.3 and Paseo 0.10.1; Codex and Oh My Pi again on 2 October 2026
against Paseo 0.10.2's source, Codex 0.154's own list of features and Oh My Pi 18.3.1's documentation.

Built: a harness file for each of the four. Every test runs against a stand-in for Paseo that refuses what Paseo's
source refuses. Claude Code and Pi were seen on live agents on 2 October 2026 (Seen on a live Paseo, below); Codex and
Oh My Pi have not been, and what only a live one can show is under To check.

V1 wrote the same role policy five times, once in each agent's format: 55 harness files, 1,578 lines, and as many
lines of TypeScript to lay them out, one seat directory per role, agent and project. Seatworks states the policy once and
holds it with guards that work the same on every agent; an agent's own sandbox is a second line, used where Paseo
reaches it.

## The policy, once

A role's properties (`KERNEL.md` §2) are all the harness reads. A harness file per provider, `harness/<provider>.json`,
holds the settings each property adds (`always`, `writes`, `reads`) and, where the agent needs one, a `home` laid
out under the plugin's state root and named to the agent through one variable. A string in it may name a place on
the machine in braces: `{plugin}`, `{node}` (what runs the plugin), `{socket}` (where an agent's tools reach it) in a
home's files, `{git}` (the repository's git directory) in the settings.

| Property  | Means for the agent                                                                            |
| --------- | ---------------------------------------------------------------------------------------------- |
| `writes`  | Works in its scope's own worktree and commits there.                                           |
| otherwise | Works in a throwaway copy at the commit it reads, with its agent's own tools, so a Lead or a Reviewer can run what a decision or a review needs; what it changes there reaches nothing. |
| always    | No native subagents. The team's tools. Its role prompt. No push, no branch move, no git outside its copy. |

## Guards that hold on every agent

1. **Copies.** A writer's cwd is its own worktree. Every other role's cwd is a throwaway copy at the commit it reads,
   removed with its scope. An edit there lands where nothing reads it, so no agent's tools are cut for a role that
   does not write: the copy is the guard, on every agent alike.
2. **Only commits count.** The kernel integrates a writer's commits and nothing else (I4, I5), so no stray edit
   reaches a lane.
3. **One git guard.** The shim first on every agent's `PATH` refuses push, pull, checkout, switch, update-ref,
   symbolic-ref, stash, worktree changes, forced, copying or deleting branch moves (short flags run together too), a
   fetch into a local branch, an alias that runs a shell, and git outside the agent's own copy. For a role without `writes` it also refuses what makes a commit or moves the
   branch: commit, merge, reset, rebase, cherry-pick, revert and am. It reads the role's properties from the
   agent's environment, so the five per-agent git deny lists of V1 go.

Rules that match a command's text (Claude's `Bash(git push *)`, Codex's exec policy, Oh My Pi's `bash.patterns`)
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
| Pi          | None reach it: Paseo hands them as an MCP server, and Seatworks' home loads no adapter for one | The environment                                  |
| Oh My Pi    | Not switched off: Paseo registers them with the session itself, and nothing in its home refuses a tool by where it came from | The environment                                  |

The environment is the guard that holds however the command is called. Every agent's own process is given
`PASEO_HOST` naming a host that never resolves and an empty `PASEO_HOME`, when it is made and each time its session
opens, so Paseo's command line finds no daemon and its error names the host, which says why. With both variables set
its error tells the reader to pass `--home` or `--host`, which is why the home is left empty. The two rules that
match the command's text only refuse the usual form sooner, with a reason.

Read against Paseo 0.10.2 as installed, Claude Code's own documentation for 2.1.280 and Codex 0.154.0. Paseo's
command line was run against a host that does not resolve; Codex's `mcp list` and `execpolicy check` were run on the
files as the harness writes them, alone and under the servers as Paseo hands them; no provider of Paseo's reads
either variable. No agent was started for any of it.

## Outside tool servers

A role may be given an MCP server that is not the team's (`TEMPLATE.md`). It is handed to Paseo beside the team's own,
its named tools approved ahead.

- **It is outside every guard above.** A server is a process of its own: it runs no git through the shim, is confined
  to no copy, and may write where it likes. The guards hold against an agent's mistakes, not against what a template's
  author chose to start. The Human sees each server and its command before a template is installed.
- **Paseo takes servers for three providers only.** Its registry lets Claude, Codex and OpenCode pre-approve exact
  tools, and refuses a create that carries a tool policy for any other; it refuses MCP servers for a provider that
  cannot take them, Oh My Pi always and Pi unless the Human has `pi-mcp-adapter`, which the plugin cannot see. A
  harness file says so with `servers: false`. Paseo is then handed no server and no tool to approve, the agent's home
  gives it the team's tools, and a role given an outside server is not seated on that provider, the reason naming the
  server. Pi and Oh My Pi are so marked.
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
| Writer              | `providerOptions.sandbox`: `enabled`, `failIfUnavailable`, `allowUnsandboxedCommands: false`   |
| Context             | Claude reads `AGENTS.md` itself since 2.1.277: V1's CLAUDE.md import goes                     |

### Codex

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, sent as `developerInstructions`                                               |
| Team tools          | `mcpServers` and `toolPolicy`: Paseo enables only the tools named and approves each           |
| No prompts          | `modeId: auto` with the option `approval_policy: never`: its sandbox holds, and nothing asks  |
| Writer              | `sandbox_workspace_write.writable_roots` gains the repository's git directory (`{git}`), which Codex keeps read-only inside a worktree otherwise, so a commit can be made |
| Not writing         | The same, in its throwaway copy, without the git directory among its writable roots            |
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

### Oh My Pi

Paseo turns it off by default, refuses it MCP servers, a tool policy and any provider option, and cannot switch off
its subagents, so everything is in an agent directory of Seatworks', set through `PI_CODING_AGENT_DIR`
(`harness/omp.json`):

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, which Paseo passes as `--append-system-prompt`                                |
| Team tools          | `mcp.json` in the home, with the team's server: started by `{node}` on `bin/team.ts` with the plugin's socket. The agent's project, actor and key are named in its `env` by the variables that hold them, which Oh My Pi fills from its own environment. Its tools are named `mcp__team_<tool>` there |
| Tools at the first turn | `mcp.startupTimeoutMs: 0` in `config.yml`: without it Oh My Pi starts a turn 250 ms after it began connecting |
| No prompts          | `modeId: full`, which Paseo starts as `--approval-mode yolo`                                  |
| No subagents        | `tools.approval` in `config.yml` denying `task` and `eval` (its cells can start agents and reach a shell); a denial holds in every approval mode |
| No imported config  | `disabledProviders`: the Claude, Codex, Gemini, OpenCode and Cursor configs it would otherwise read from a copy, servers and hooks among them. `AGENTS.md` and its own `.omp/` stay read |
| The Human's login   | `agent.db`, its store of logins, linked from their own agent directory                        |

`config.yml` is written as JSON, which is YAML. Oh My Pi never confines files or network; its approvals are policy,
not containment.

## Role prompts

One prompt per role. An agent gets a note of its own only where its base prompt would lead the role wrong, such as
Oh My Pi's instruction to delete incidental tests. V1's seven near-copies of the same notes go.

## What V1 did that Seatworks drops

| V1                                                          | Seatworks                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| A seat directory per role, agent and project                | None for Claude; one shared home each for Codex, Oh My Pi and Pi |
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

## To check before building on it

- On a live Codex: that a writer commits with the repository's git directory among its writable roots, and that
  `features.multi_agent = false` leaves it no tool to start an agent with.
- On a live Oh My Pi: that the team's server in its home connects before the first turn with the agent's own key,
  that `agent.db` linked carries the Human's login, and that a copy's own `.omp/` cannot plant an extension or a
  server for the next agent, as Pi's `defaultProjectTrust` rules out.
- Whether Paseo's fixed `settingSources` let a project's `.claude/settings.json` add hooks or servers to a Claude
  agent, and whether `extraArgs` can narrow them.
- On a live Paseo with `daemon.mcp.injectIntoAgents` on: that a Claude, a Codex and a Pi agent of a team are shown
  none of Paseo's tools, and what an Oh My Pi agent is shown, which Seatworks does not switch off.
