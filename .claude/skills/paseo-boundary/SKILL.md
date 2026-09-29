---
name: paseo-boundary
description: "What Paseo 0.10 gives a plugin and the facts about it that are easy to get wrong: hooks, agent creation, tools, history, settings, the plugin worker. Use before writing or changing server/satellites/agent-host, server/bridge, the plugin's entry or its manifest; not for the kernel."
---

# Paseo boundary

Seatworks takes every mechanism Paseo offers and none of its orchestration (`spec/PASEO.md`). Paseo ships weekly, so a fact
here is checked against the installed `@getpaseo/plugin`, `@getpaseo/client` and `@getpaseo/protocol` types, or
Paseo's source, before code rests on it. Never by starting the daemon.

## The rules that keep Seatworks alive across releases

1. Only `server/satellites/agent-host/` and `server/bridge/` import `@getpaseo/*`.
2. Only the published surface: `@getpaseo/plugin/server` and the `PaseoApi` it hands out. Never Paseo's files
   (`config.json`, `daemon.log`, its state), never a label or row Paseo writes for itself.
3. `requirements.paseo` is a minimum (`>=0.10.0`); an upper bound only for a release known to break Seatworks.
4. Read at the boundary accepting unknown fields; detect a capability once where the adapter starts; no degraded path
   for an older daemon, the minimum goes up instead.
5. Nothing rests on a hook arriving: reconcile on start and on every reconnect (`agents.list`, each agent's
   `activeTurn` and `pendingPermissions`, its history since the last fact).

## Facts that are easy to get wrong

Read from Paseo 0.10.1 unless marked as V1's finding.

- **The worker.** The plugin's server is a child the daemon `fork`s with its own Node and `--experimental-strip-types`:
  types are stripped, not compiled, so `erasableSyntaxOnly` holds. IPC uses `serialization: "advanced"`.
- **Tools reach an agent only through `mcpServers` in `before('agent.create')`**, fixed for its life; a server may
  still change the tools it lists (`list_changed`). Afterwards only the model, mode, thinking option and feature
  values change, and the name and labels through `update_agent`.
- **`toolPolicy` is `{ preapproved }` only**, which suppresses prompts. `providers.<id>.paseoTools.disabledTools`
  removes built-ins, per provider, not per agent.
- **`before('agent.create')` cannot see `labels`**: its payload is `.pick({ config, env }).strict()`. Pass labels to
  `paseo.agents.create()` and carry the role in something the hook can see (the provider string, or env).
- **`systemPrompt` is set only at creation**: a prompt change reaches an agent the next time one is created.
- **Only `before` hooks refuse, by throwing** (`agent.create`, `agent.session_open`, `workspace.create`). Every hook
  times out at 30 s, and on those three the timeout fails the user's action: no unbounded I/O and no reflex call there.
- **`before('agent.session_open')` changes env only**, and a resumed session gets no other: Paseo keeps nothing of
  the create's env. The hook returns the seat's whole env again, the shim's `PATH` among it.
- **Pi gets `mcpServers` only if `pi-mcp-adapter` is installed**, and Paseo passes it only its own `--extension`:
  Seatworks' tools reach Pi through the extension its home's `settings.json` names (`PI_CODING_AGENT_DIR`).
- **History comes back projected**: a tool call is one entry in its latest state, a run of text chunks one message.
  An entry's `seqEnd` can run past the entries after it, and an `after` page returns whole entries, restating rows
  before its cursor.
- **Every message sent carries a `clientMessageId`**; the client makes one when the sender gives none. A daemon
  restart, or reading an archived agent, rebuilds history from the agent's own transcript with none, so a user message
  without one has no known sender.
- **`agent.turn_ended`'s `timeline` is the agent's whole history** in the daemon's memory, not the turn: read from the
  actor's `seen`. Every provider maps thinking to `reasoning` items.
- **`send(text, { messageId })` sets the user message's `clientMessageId`**, and replaces a running turn. The same id
  twice shows one row but runs twice: a send is not idempotent on its own.
- **A keyed `agents.create` is kept on disk with a digest of the whole request**: the same key with another request
  throws `agent_request_key_conflict`, one cut off by a restart stays `agent_request_outcome_unknown`. Look the agent
  up by labels (`agents.list({ filter: { labels } })`) before creating again.
- **`lastUsage` holds running totals for the session**, reset when the provider's process restarts; Codex gives its
  last call's tokens and no cost. Count a turn's rise, never the value.
- **`timeline.subscribe()` delivers live events only**, prose and reasoning included. After a reconnect it sends
  `subscription_restored` and none of what was missed; a failed one sends `error` and is released.
- **`timeline.append` rows are shown, not kept**: a daemon restart drops them, so they are never the record.
- **Settings**: `registerSettings` takes a `defineSettings` definition with `scope: "host"`, a version and a zod
  schema; any other scope throws. Reads and writes are revision-checked.
- **`paseo.config.patch()`** checks, saves and applies at once, and merges a provider into the one Paseo holds, so a
  key goes only by removing the provider and adding it again in two patches (V1's finding).
- **Archiving an agent archives every child** that carries `paseo.parent-agent-id` pointing at it. Seatworks keeps parentage
  in its own log and never sets that label.
- **A finish notification** goes to a parent only for an agent made by Paseo's own `create_agent` tool with
  `notifyOnFinish`; agents made through the plugin API get none.
- **The plugin's own client reconnects by itself**, and a plugin gets it only within a hook or a panel call.
- **The daemon and the app refuse a plugin** whose `requirements.paseo` range leaves them out.
- **Paseo already ships** worktree setup and teardown, heartbeats, a PTY API and agent profiles. Look for a native
  facility before building one.

## Where to look

- Types: `node_modules/@getpaseo/plugin/dist/**/*.d.ts`, and `@getpaseo/protocol` for timeline item shapes.
- Source, when a type does not say how it behaves: Paseo's repository at the tag of the pinned release,
  `packages/server/src/server/plugins/` for the worker and hooks, `packages/server/src/server/agent/` for agents.
- The changelog's plugin, hook and protocol entries at every bump of `@getpaseo/*`.
