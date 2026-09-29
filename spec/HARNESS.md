# Harness

How Seatworks runs Claude Code, Codex, Pi and Oh My Pi as members of the team. Read on 29 September 2026 against Claude
Code 2.1.284, Codex 0.158, Pi 0.87.1, Oh My Pi 18.4.3 and Paseo 0.10.1.

V1 wrote the same role policy five times, once in each agent's format: 55 harness files, 1,578 lines, and as many
lines of TypeScript to lay them out, one seat directory per role, agent and project. Seatworks states the policy once and
holds it with guards that work the same on every agent; an agent's own sandbox is a second line, used where Paseo
reaches it.

## The policy, once

A role's properties (`KERNEL.md` §2) are all the harness reads. A harness file per provider, `harness/<provider>.json`,
holds the settings each property adds (`always`, `writes`, `reads`) and, where the agent needs one, a `home` laid
out under the plugin's state root and named to the agent through one variable.

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
| Team tools          | `mcpServers` and `toolPolicy`: Codex refuses an MCP call it would have to ask about           |
| Writer              | `modeId: auto` with `providerOptions.approval_policy: never`; `sandbox_workspace_write.writable_roots` gains the repository's git directory, which Codex keeps read-only inside a worktree otherwise |
| Not writing         | The same, in its throwaway copy, without the git directory among its writable roots            |
| No subagents        | `features.multi_agent_v2: false` through Paseo; `agents.enabled = false` and `features.multi_agent = false` in one `config.toml`, shared by every Seatworks Codex agent through `CODEX_HOME`, since Paseo's options do not take them |

The shared `CODEX_HOME` holds that `config.toml` and a link to the Human's `auth.json`, nothing per role.

### Pi

Pi has no permissions, no sandbox, no modes and no MCP of its own. Paseo 0.10.1 hands it MCP servers only when the
Human has `pi-mcp-adapter` installed, found by starting Pi once and looking for its `/mcp` command; otherwise it
drops them without a word. Paseo passes Pi only its own `--extension`, and `extraArgs` are the provider's, not an
agent's. So Seatworks gives every Pi agent one home of its own, through `PI_CODING_AGENT_DIR` (`harness/pi.json`):

| Need                | How                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Role prompt         | `systemPrompt`, appended by Paseo's extension                                                 |
| Team tools          | `harness/pi/extension.ts`, named in the home's `settings.json`: it asks the plugin's socket for the agent's tools, as `bin/team.ts` does, and registers them with their JSON Schemas, which Pi takes as they are |
| The Human's login   | `auth.json` and `models.json` linked from their own Pi home, so a refreshed login reaches both |
| No subagents        | Pi has none; the home's settings load no extension or package but Seatworks'                        |
| No planted config   | `defaultProjectTrust: "never"`: Pi in RPC mode then skips a copy's `.pi` extensions and settings, so an agent cannot plant one for another |
| Writer              | Its worktree and the git shim; nothing native confines it                                     |

### Oh My Pi

Paseo turns it off by default, refuses it external MCP servers and cannot switch off its subagents, so it needs an
agent directory of Seatworks', set through `PI_CODING_AGENT_DIR`:

- `mcp.json` with the team's server.
- `config.yml`: `task.maxRecursionDepth: 0`; `tools.approval` denying `task` and `eval` (its cells can start agents
  and reach a shell); `disabledProviders` for the Claude, Codex and other configs it would otherwise import from the
  worktree.

Oh My Pi never confines files or network; its approvals are policy, not containment.

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

## To check before building on it

- Whether `agents.enabled = false` alone keeps Codex 0.158 from starting agents, so the catalog rewrite can go.
- Whether Paseo's fixed `settingSources` let a project's `.claude/settings.json` add hooks or servers to a Claude
  agent, and whether `extraArgs` can narrow them.
- Whether Oh My Pi is worth its own directory, or waits until Paseo gives it external MCP.
