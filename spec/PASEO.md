# Paseo

Paseo ships often: 0.9.0 on 22 September 2026, 0.10.0 on the 28th, 0.10.1 on the 29th. Seatworks takes from it every
mechanism it offers, none of its orchestration, and survives its releases by the rules below. What is here was read
from Paseo 0.10.1: the plugin SDK, `@getpaseo/client`, `@getpaseo/protocol`, the changelog and the public docs.

## Surviving a release

1. **One place touches Paseo.** `satellites/agent-host/` and `bridge/` import `@getpaseo/*`; nothing else does, but
   `shared/contracts/settings.ts`, where `defineSettings` from `@getpaseo/plugin` shapes the settings both the daemon
   and the app read, as Paseo's own examples share them. A release changes at most those places.
2. **Only the published surface.** `@getpaseo/plugin/server` (contribution, hooks, RPC, settings) and the
   `PaseoApi` it hands out (agents, workspaces, providers, terminals, config). Seatworks never reads Paseo's own files
   (`config.json`, `daemon.log`, its state), never leans on a label or row Paseo writes for itself, and reads
   history only as the documented `AgentTimelineItem` types.
3. **A minimum, not a ceiling.** `requirements.paseo` is `>=` the oldest release whose API Seatworks uses. An upper bound
   goes in only when a release is known to break Seatworks, named in the commit. V1's `>=0.9.1 <0.10.0` made 0.10 refuse
   it, though the plugin SDK's types in 0.9.2 and 0.10.1 are the same.
4. **Paseo's own compatibility rules.** Read at the boundary, accepting fields Seatworks does not know. A newer capability
   is detected once, where the adapter starts, and the rest of Seatworks reads one clean shape. No degraded path for an
   older daemon: the minimum goes up instead. A shim carries `COMPAT(name): added in vX, remove after <date>`.
5. **Nothing rests on a hook arriving.** Hooks are live and best effort, never replayed, and time out at 30 s. The
   kernel's log is the truth. On start and on every reconnect the agent host reconciles: `agents.list`, each
   agent's `activeTurn` and `pendingPermissions`, and its history since the last fact, reported as facts.
6. **Each release is checked.** The agent host's contract tests typecheck and run against the newest
   `@getpaseo/plugin`, `@getpaseo/client` and `@getpaseo/protocol`, and the changelog's plugin, hook and protocol
   entries are read at each bump.

## What Seatworks takes from Paseo

| Seatworks needs                               | Paseo gives                                                                                              | Instead of V1's                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Start an agent                         | `agents.create` with `provider/model`, `modeId`, `thinkingOptionId`, `systemPrompt`, `mcpServers`, `toolPolicy`, `labels` | —                                  |
| A model per role                       | Paseo's agent profiles, read with `config.get()`: a role names a profile, the Human edits it in Paseo, new models arrive with Paseo's releases | Its own model lists and provider sync |
| What models exist                      | `providers.snapshot`, `listModels`, `waitForReady`                                                       | Catalog files                      |
| A copy per writer                      | `workspaces.create` with a worktree source, and Paseo's worktree setup; Seatworks keeps merge, advance and the git guard, which Paseo does not do | Most of its own copies             |
| Deliver a message                      | `agent.send`, when the handle's `activeTurn` is empty                                                    | Its own turn tracking              |
| Turn state, cost, context              | `agent.turn_started`, `agent.turn_ended`; the handle's `activeTurn` and `lastUsage` (tokens, cost, context window) | Parsing history for spend          |
| Permissions                            | `agent.permission_requested`, `respondToPermission` while the agent's `pendingPermissions` still hold the request, and `agent.permission_resolved` for one answered in the agent's own prompt | —                                  |
| Per-session environment                | `before('agent.session_open')`, env only                                                                 | —                                  |
| The Human's surface                    | Client contributions: a surface and sidebar item, workspace panels, Command Center items, slash commands, header buttons, composer pills, timeline renderers | —                                  |
| Cards in a chat                        | `timeline.append` plugin rows: shown, not kept (a daemon restart drops them), so never the record         | —                                  |
| Settings, Jev's key among them         | `registerSettings` with a host-scoped definition (`defineSettings`, `scope: "host"`, a version and a zod schema), kept per installation across updates. Only `host` is accepted: 0.10.1 throws on any other scope, which is the refusal V1 met | Its own settings store             |
| Install and update                     | A Git source (`paseo plugin add owner/repo:path`), reviewed `paseo plugin update`, `build` argv steps. `install.sh` checks git, Node, npm and Paseo, then adds the Git source. The plugin API has no plugin management, so the surface's update check runs `paseo plugin update <id> --check --json` and only reads it: applying stays Paseo's reviewed update | Its own clone, `git fetch` and reload |
| Which projects the Human has           | `projects.list`: each project's `projectRootPath` and `projectKind`, offered on the surface to attach   | —                                  |
| Opening a seat's chat from the surface | The app lists agents by the plugin's labels (`usePaseo().agents.list`, `filter.labels`) and opens one with `navigation.openAgent`; the plugin keeps no map of its own | —                                  |
| Finding what a team left behind        | `agents.list` with `filter.labels` (the project's label), paged by `pageInfo.nextCursor`                | —                                  |

## What Seatworks does not take

- **Paseo's orchestration.** Its tools injected into agents (`create_agent`, `send_agent_prompt`, …), its handoff,
  committee and advisor skills, schedules, heartbeats, Hub workflows. SLP organizes work on Paseo's mechanism, not
  on its orchestration (CONCEPT-V2 §2.1). Agents Seatworks starts get neither Paseo's tools nor their own agent's native
  subagents.
- **Paseo's parent label.** Archiving an agent archives every child that carries `paseo.parent-agent-id` pointing
  at it. In SLP a Lead replaced or released does not end its Peers, so Seatworks keeps parentage in its own log.
- **Provider plugins and ACP.** Seatworks is not an agent provider.

## Checked in Paseo 0.10.1's source

- The server bundle is compiled by Paseo (esbuild, CommonJS) and evaluated in the worker, not run from the plugin's
  directory, so `import.meta` is empty and the plugin cannot find its own files from code. It reads its directory
  from `config.get()`'s `plugins.<id>.path`, through the published API, and starts what needs its files (the profile,
  the tool server, the git shim) once that API arrives. A Git install is recorded there too, as a directory source
  at its checkout (`installSource`).
- Paseo supplies `@getpaseo/plugin` and its subpaths, `zod`, React and Node's modules to a bundle. Every other package
  it imports must resolve from the plugin's directory at compile time, even one imported for its types alone, so
  `@getpaseo/client` and `@getpaseo/protocol` are dependencies: a Git install's build installs no devDependency. A
  directory install runs no build step at all.
- The API reaches a plugin only with a hook or a panel call; it is one client, made before the plugin's contribution
  runs, that reconnects by itself. Work that needs it waits for the first hook or call.
- `agent.turn_ended` carries the turn's outcome and the agent's whole history as the daemon holds it in memory, not
  the turn alone (`timelineStore.getItems`, never trimmed). Each actor keeps how many items it has read (`seen`, on
  `turn_ended`), and the turn is what follows. A daemon restart rebuilds the history from the agent's transcript; one
  shorter than `seen` is read from its last prompt. Words the Human typed are the turn's `user_message` items whose
  `clientMessageId` is none of the plugin's effect keys; rebuilt ones carry none and count as nobody's.
- Every provider maps its thinking to `reasoning` items (Claude, Codex, Pi, Oh My Pi, OpenCode), so the watch reads
  thinking wherever the model returns it; how much it returns is the profile's thinking option.
- `send(text, { messageId })` becomes the user message's `clientMessageId` (`sendPromptToAgent`). The same id again
  adds no second row but runs the prompt again, and a send replaces a running turn: Seatworks sends only when `activeTurn`
  is empty, and a delivery retried after a lost reply can reach its reader twice.
- `agents.create` with an `idempotencyKey` goes through Paseo's creation service, which writes the key and a digest of
  the whole request to disk before it starts, so it holds across a daemon restart. The same key with a different
  request is refused (`agent_request_key_conflict`), and a create in flight when the daemon stopped stays
  `agent_request_outcome_unknown`. The first prompt reads the record as it is, so a retry would differ: the agent host
  first looks for the agent by its labels (`agents.list`, `filter.labels`), and a key Paseo refuses is a failed start,
  which the owner above hears and a reseat, with a new key, answers.
- `lastUsage.totalCostUsd` is what the agent's session has spent so far: Claude's result `total_cost_usd` over its one
  long query, Pi's and Oh My Pi's session stats, OpenCode's session cost. It starts again when the provider's process
  does. Tokens are running totals too, but Codex reports only its last model call's, and no cost. Seatworks records the
  totals and counts each turn's rise (`KERNEL.md` §4.2), so a Codex agent's money never counts toward an appetite.
- `toolPolicy.preapproved` names each MCP tool; there is no wildcard.
- A resumed session is started with no environment but what `before('agent.session_open')` returns: Paseo keeps
  none of what `agents.create` gave. The hook gives a reopened agent its whole seat again, the git shim first on
  its `PATH` among it, or a daemon restart would leave every agent unguarded.
- Pi gets MCP servers only with `pi-mcp-adapter` installed (`HARNESS.md`, Pi).

- A finish notification goes to a parent only for an agent made by Paseo's own `create_agent` tool with
  `notifyOnFinish`. Agents Seatworks makes through the plugin API get none, so nothing reaches a Lead around delivery.
- Plugin settings work when host-scoped, as above.

## To check before building on it

- Per-agent control of Paseo's tools: today it is per provider ID (`paseoTools` on a custom provider) and injection
  is off by default. If the Human turns it on, Seatworks needs provider entries of its own, the one reason to write Paseo's
  config.
- Branch names and locking through `workspaces.create`, against what the workspace port needs.
- That the daemon's `PATH` finds Paseo's command line, so the update check runs; when it does not, the surface says
  so and gives the command to run by hand.
- That `projects.list` lists every project the Human opened in Paseo, each `projectRootPath` the checkout's root.
