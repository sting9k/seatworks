# Paseo

Paseo ships often: 0.9.0 on 22 September 2026, 0.10.0 on the 28th, 0.10.1 on the 29th. v3 takes from it every
mechanism it offers, none of its orchestration, and survives its releases by the rules below. What is here was read
from Paseo 0.10.1: the plugin SDK, `@getpaseo/client`, `@getpaseo/protocol`, the changelog and the public docs.

## Surviving a release

1. **One place touches Paseo.** `satellites/agent-host/` and `bridge/` import `@getpaseo/*`; nothing else does. A
   release changes at most those two.
2. **Only the published surface.** `@getpaseo/plugin/server` (contribution, hooks, RPC, settings) and the
   `PaseoApi` it hands out (agents, workspaces, providers, terminals, config). v3 never reads Paseo's own files
   (`config.json`, `daemon.log`, its state), never leans on a label or row Paseo writes for itself, and reads
   history only as the documented `AgentTimelineItem` types.
3. **A minimum, not a ceiling.** `requirements.paseo` is `>=` the oldest release whose API v3 uses. An upper bound
   goes in only when a release is known to break v3, named in the commit. V1's `>=0.9.1 <0.10.0` made 0.10 refuse
   it, though the plugin SDK's types in 0.9.2 and 0.10.1 are the same.
4. **Paseo's own compatibility rules.** Read at the boundary, accepting fields v3 does not know. A newer capability
   is detected once, where the adapter starts, and the rest of v3 reads one clean shape. No degraded path for an
   older daemon: the minimum goes up instead. A shim carries `COMPAT(name): added in vX, remove after <date>`.
5. **Nothing rests on a hook arriving.** Hooks are live and best effort, never replayed, and time out at 30 s. The
   kernel's log is the truth. On start and on every reconnect the agent host reconciles: `agents.list`, each
   agent's `activeTurn` and `pendingPermissions`, and its history since the last fact, reported as facts.
6. **Each release is checked.** The agent host's contract tests typecheck and run against the newest
   `@getpaseo/plugin`, `@getpaseo/client` and `@getpaseo/protocol`, and the changelog's plugin, hook and protocol
   entries are read at each bump.

## What v3 takes from Paseo

| v3 needs                               | Paseo gives                                                                                              | Instead of V1's                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Start an agent                         | `agents.create` with `provider/model`, `modeId`, `thinkingOptionId`, `systemPrompt`, `mcpServers`, `toolPolicy`, `labels` | —                                  |
| A model per role                       | Paseo's agent profiles, read with `config.get()`: a role names a profile, the Human edits it in Paseo, new models arrive with Paseo's releases | Its own model lists and provider sync |
| What models exist                      | `providers.snapshot`, `listModels`, `waitForReady`                                                       | Catalog files                      |
| A copy per writer                      | `workspaces.create` with a worktree source, and Paseo's worktree setup; v3 keeps merge, advance and the git guard, which Paseo does not do | Most of its own copies             |
| Deliver a message                      | `agent.send`, when the handle's `activeTurn` is empty                                                    | Its own turn tracking              |
| Turn state, cost, context              | `agent.turn_started`, `agent.turn_ended`; the handle's `activeTurn` and `lastUsage` (tokens, cost, context window) | Parsing history for spend          |
| Permissions                            | `agent.permission_requested`, `respondToPermission`                                                      | —                                  |
| Per-session environment                | `before('agent.session_open')`, env only                                                                 | —                                  |
| The Human's surface                    | Client contributions: a surface and sidebar item, workspace panels, Command Center items, slash commands, header buttons, composer pills, timeline renderers | —                                  |
| Cards in a chat                        | `timeline.append` plugin rows: shown, not kept (a daemon restart drops them), so never the record         | —                                  |
| Settings                               | `registerSettings`, per installation, kept across updates                                                | Its own settings store             |
| Install and update                     | A Git source (`paseo plugin add owner/repo:path`), reviewed `paseo plugin update`, `build` argv steps    | —                                  |

## What v3 does not take

- **Paseo's orchestration.** Its tools injected into agents (`create_agent`, `send_agent_prompt`, …), its handoff,
  committee and advisor skills, schedules, heartbeats, Hub workflows. SLP organizes work on Paseo's mechanism, not
  on its orchestration (CONCEPT-V2 §2.1). Agents v3 starts get neither Paseo's tools nor their own agent's native
  subagents.
- **Paseo's parent label.** Archiving an agent archives every child that carries `paseo.parent-agent-id` pointing
  at it. In SLP a Lead replaced or released does not end its Peers, so v3 keeps parentage in its own log.
- **Provider plugins and ACP.** v3 is not an agent provider.

## To check before building on it

- Whether an agent started with a parent gets Paseo's finish notification from its child; if so, it must be off or
  go through delivery.
- Per-agent control of Paseo's tools: today it is per provider ID (`paseoTools` on a custom provider) and injection
  is off by default. If the Human turns it on, v3 needs provider entries of its own, the one reason to write Paseo's
  config.
- `registerSettings` on 0.10: V1 recorded a runtime refusal of host-scoped SDK settings.
- Branch names and locking through `workspaces.create`, against what the workspace port needs.
