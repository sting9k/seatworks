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
| Settings, the classifier's key among them         | `registerSettings` with a host-scoped definition (`defineSettings`, `scope: "host"`, a version and a zod schema), kept per installation across updates. Only `host` is accepted: 0.10.1 throws on any other scope, which is the refusal V1 met | Its own settings store             |
| Install and update                     | A Git source (`paseo plugin add owner/repo:path`), reviewed `paseo plugin update`, `build` argv steps. `install.sh` checks git, Node, npm and Paseo, then adds the Git source. The plugin API has no plugin management, so the surface's update check runs `paseo plugin update <id> --check --json` and only reads it: applying stays Paseo's reviewed update | Its own clone, `git fetch` and reload |
| Which projects the Human has           | `projects.list`: each project's `projectRootPath` and `projectKind`, offered on the surface to attach   | —                                  |
| Opening a seat's chat from the surface | The app lists agents by the plugin's labels (`usePaseo().agents.list`, `filter.labels`) and opens one with `navigation.openAgent`; the plugin keeps no map of its own | —                                  |
| Finding what a team left behind        | `agents.list` with `filter.labels` (the project's label), paged by `pageInfo.nextCursor`                | —                                  |

## What Seatworks does not take

- **Paseo's orchestration.** Its tools injected into agents (`create_agent`, `send_agent_prompt`, …), its handoff,
  committee and advisor skills, schedules, heartbeats, Hub workflows. SLP organizes work on Paseo's mechanism, not
  on its orchestration (CONCEPT-V2 §2.1). Agents Seatworks starts get neither Paseo's tools, nor its command line, nor
  their own agent's native subagents (`HARNESS.md`, Paseo's own tools and command line).
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
- A plugin's worker is `child_process.fork`ed by the daemon (`plugins/runtime.ts`), so `process.execPath` inside it is
  whatever the daemon runs as: Node from the CLI, the desktop app's Electron binary when the app started the daemon
  (`desktop/daemon/node-entrypoint-launcher.ts` sets `ELECTRON_RUN_AS_NODE`). Anything a plugin spawns through
  `process.execPath` needs `ELECTRON_RUN_AS_NODE=1` in its own environment, or it launches the app.
- Stopping a plugin, the daemon sends its worker `shutdown`; the worker awaits the cleanup the contribution returned,
  then disconnects. Two seconds after the `shutdown` the daemon sends SIGTERM, and two after that SIGKILL
  (`plugins/runtime.ts`, `SOFT_SHUTDOWN_TIMEOUT_MS`, 0.10.2). So the plugin's cleanup returns its promise, and ends
  every running check before it waits on anything; a plugin killed before it could is covered by the guard beside
  each step of a check (`PORTS.md`, Evidence).
- In the app, `agents.subscribe` hears only what a listing made with `subscribe: {}` streams: the daemon sends no
  `agent_update` otherwise. The listing's `subscription` gives its snapshot again after each reconnect and is released
  with the plugin.
- `agent.turn_ended` carries the turn's outcome and the agent's whole history as the daemon holds it in memory, not
  the turn alone (`timelineStore.getItems`, never trimmed). Each actor keeps how many items it has read (`seen`, on
  `turn_ended`), and the turn is what follows. A daemon restart rebuilds the history from the agent's transcript; one
  shorter than `seen` is read from its last prompt. The hooks of one agent are taken one at a time, since each reads
  `seen` as the one before left it: two taken at once would both read the same items, and record twice what the Human
  typed. Words the Human typed are the turn's `user_message` items whose
  `clientMessageId` is none of the plugin's effect keys; rebuilt ones carry none and count as nobody's. An agent's
  first prompt goes under its effect's key too (`<seq>:agent:prompt`), apart from the key of its create, which names
  the project as well: under that one the prompt read as words the Human had typed, was copied to the owner above as
  a direction for every agent seated, and was not sent again when a first turn failed.
- Every provider maps its thinking to `reasoning` items (Claude, Codex, Pi, Oh My Pi, OpenCode), so the watch reads
  thinking wherever the model returns it; how much it returns is the profile's thinking option.
- `send(text, { messageId })` becomes the user message's `clientMessageId` (`sendPromptToAgent`). The same id again
  adds no second row but runs the prompt again, and a send replaces a running turn: Seatworks sends only when `activeTurn`
  is empty, and a delivery retried after a lost reply can reach its reader twice.
- `agents.create` with an `idempotencyKey` goes through Paseo's creation service, which writes the key and a digest of
  the whole request to disk before it starts, so it holds across a daemon restart, for the whole daemon: Seatworks
  keys a create by its project and its effect's key. The same key with a different
  request is refused (`agent_request_key_conflict`), and a create in flight when the daemon stopped stays
  `agent_request_outcome_unknown`. The first prompt reads the record as it is, so a retry would differ: the agent host
  first looks for the agent by its labels (`agents.list`, `filter.labels`), before a create and after one that throws.
  A create that throws and made no agent is a failed start, whatever Paseo refused (the key, or a profile with no
  model, which the client cannot split into `provider/model`), which the owner above hears and a reseat, with a new
  key, answers; only a lookup that throws, the connection down, is tried again.
- `lastUsage.totalCostUsd` is what the agent's session has spent so far: Claude's result `total_cost_usd` over its one
  long query, Pi's and Oh My Pi's session stats, OpenCode's session cost. It starts again when the provider's process
  does. Tokens were read as running totals too, which a live Claude agent did not bear out (Seen on a live daemon);
  Codex reports only its last model call's, and no cost. Seatworks records the
  totals and counts each turn's rise (`KERNEL.md` §4.2), so a Codex agent's money never counts toward an appetite.
- `toolPolicy.preapproved` names each MCP tool; there is no wildcard.
- A resumed session is started with no environment but what `before('agent.session_open')` returns: Paseo keeps
  none of what `agents.create` gave. The hook gives a reopened agent its whole seat again, the git shim first on
  its `PATH` among it, or a daemon restart would leave every agent unguarded.
- Pi gets MCP servers only with `pi-mcp-adapter` installed (`HARNESS.md`, Pi).

- A permission is asked inside a turn: the turn stays active while it waits, and a turn that ends denies what is
  still pending (`agent-manager`, 0.10.2). So a delivery, sent only when `activeTurn` is empty, never reaches an agent
  waiting on a permission, with no check of its own.
- The `PaseoApi` a plugin is handed has no cancel and no change of model or thinking for a running agent; only the
  low-level `DaemonClient` has them, which rule 2 keeps out. The Human stops a turn or changes a model in the agent's
  own chat, which the surface opens.
- A finish notification goes to a parent only for an agent made by Paseo's own `create_agent` tool with
  `notifyOnFinish`. Agents Seatworks makes through the plugin API get none, so nothing reaches a Lead around delivery.
- Plugin settings work when host-scoped, as above.

- An MCP server is `stdio` (command, args, env), `http` or `sse` (url, headers), and any of them may be marked
  `alwaysLoad`, which the Claude provider honours by never putting that server's tools behind a tool search
  (`@getpaseo/protocol`, `agent-types`). A tool is approved ahead by its server and its name, with no wildcard.
- Whether a provider takes MCP servers (`supportsMcpServers`) is a capability of an agent once made; the provider
  snapshot the API lists before that carries none. So Seatworks keeps which providers cannot in its harness files.

## What Paseo takes for which provider

Read in Paseo 0.10.2's source (`packages/server/src/server/agent`), the same at 0.10.1 and, for what is said of
OpenCode, at 0.10.3:

- **A tool policy** is taken for `claude`, `codex` and `opencode` alone (`provider-registry.ts`, `PROVIDER_CONTRACTS`).
  A create that carries one for any other provider is refused: `cannot preapprove exact MCP tools`.
- **MCP servers** are refused for a provider whose session does not support them (`agent-manager.ts`,
  `requireExternalMcpSupport`): Oh My Pi never does, Pi only with the Human's `pi-mcp-adapter`.
- **Provider options** are parsed by a strict schema per provider, and refused whole for a provider that has none.
  Claude's and Codex's are in `providers/claude/options.ts` and `providers/codex/options.ts`; Pi and Oh My Pi take
  none. OpenCode's (`providers/opencode/options.ts`) is `permission` alone, over the permissions it lists by name:
  no tool of a server or a plugin can be named in it.
- **An agent's environment** given at its create reaches the provider's own process (`CODEX_HOME`,
  `PI_CODING_AGENT_DIR`), which is how a home of Seatworks' is named to it. For OpenCode Paseo starts a server for
  the agent alone when its environment holds a variable beyond the two Paseo sets or it has a server of its own
  (`providers/opencode/v2/configuration.ts`, `requiresDedicatedV2Server`), adds its own plugin to that
  environment's `OPENCODE_CONFIG_CONTENT`, and sets the environment as the session's shell's each time it connects.
- **OpenCode by its version.** Paseo asks `opencode --version` and speaks to OpenCode 2 through
  `providers/opencode/v2`, to OpenCode 1 through the older client. With a tool policy it never answers a permission
  itself, whatever the profile's auto-accept says.

So what Seatworks sends is by provider (`HARNESS.md`), and the stand-in for Paseo in the tests refuses what Paseo does.

## Seen on a live daemon

On 2 October 2026, Paseo 0.10.2, a daemon run for it with a home of its own (`HARNESS.md`, Seen on a live Paseo):

- A daemon takes plugins only with `pluginsEnabled` set in its config; agent profiles are kept under `daemon` there.
- `agent.turn_ended` reached the plugin for every turn, with the whole history; the first prompt carried the
  `clientMessageId` the create was given, and a delivery the one its send was given.
- `lastUsage.totalCostUsd` rose turn by turn for Claude and for Pi, as a running total. Its tokens did not for Claude:
  one agent reported 949, 275, 377, 395, 220, 136 and 1,961 over seven turns, so they are a turn's, or a call's, and
  not a session's. What a scope spent in dollars is right; what it spent in tokens is not, for a Claude agent.
- A turn that ends after its agent's seat has ended reaches nobody: the plugin no longer knows the agent, so what
  that turn spent is counted nowhere. A Peer taken in within seconds of its hand-back, while it was still writing
  its last words, had none of its spend recorded.
- The timeline of an archived agent could not be read from the command line.
- Installed with the README's line from the branch `open-templates` into a daemon with nothing installed: cloned from
  GitHub, built with `npm ci --omit=dev`, ready in under two seconds, and SLP installed through the calls the
  plugin's page makes. Paseo keeps the remote and the commit of an install and not the `--ref` it was given
  (`managed-source.js`, 0.10.2): an update with no `--ref` goes to the remote's default branch. So an install from
  another branch is shown the default branch's head as a newer release, by `paseo plugin update` and by the plugin's
  own check alike, and updating takes it there; `paseo plugin update seatworks --ref <branch>` follows the branch.
- A daemon run with a home of its own made an empty folder for each agent's directory under the Human's own Pi
  sessions, for Claude agents too; the sessions themselves were in the home Seatworks lays out for Pi.

## To check before building on it

- Per-agent control of Paseo's tools: today it is per provider ID (`paseoTools` on a custom provider) and injection
  is off by default. With it on, a team's Claude, Codex and OpenCode agents have them switched off in their harness
  and none reach a Pi agent (`HARNESS.md`). An agent of a provider Seatworks ships no harness file for keeps them
  until the Human gives its profile a provider with `paseoTools.enabled: false`: Oh My Pi is one, since Paseo
  registers them with its session itself. Seatworks writes nothing in Paseo's config.
- Branch names and locking through `workspaces.create`, against what the workspace port needs.
- That the daemon's `PATH` finds Paseo's command line, so the update check runs; when it does not, the surface says
  so and gives the command to run by hand.
- That `projects.list` lists every project the Human opened in Paseo, each `projectRootPath` the checkout's root.
