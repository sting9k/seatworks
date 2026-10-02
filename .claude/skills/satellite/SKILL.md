---
name: satellite
description: "Builds or changes a satellite behind its port in server/satellites (store, agent-host, workspace, evidence, delivery, machine, reflex), or the bridge that carries effects to it and facts back. Use when work does I/O for the kernel; not for kernel rules, which are pure."
---

# Satellite

A satellite does one job behind a port (`spec/PORTS.md`), takes effects from the kernel and returns facts. It would be
of use to a team that dropped SLP.

## Rules

- **Its contract names nothing of SLP**: no role, no "finding", no "Lead". A port speaks of agents, copies, commits,
  checks, batches.
- **It never calls another satellite** and never decides for a role. What connects them is the bridge.
- **It returns `Result`**: a success with its value, or a failure that says what failed. It throws only on a bug.
- **Every effect is idempotent.** It either carries the effect's key to the far side (a message's
  `clientMessageId`, an agent's label, a batch key) or checks before it acts (a branch advanced only from the sha
  it expects, a remote pushed only if it has not moved). An effect that can be neither is not written.
- **Its facts carry the effect's key**, so the bridge drops one it has seen.
- **Nothing rests on a hook arriving.** On start and on every reconnect it reconciles from the source of truth (the
  agent host from Paseo's list and history, the workspace from git) and reports what it finds as facts.
- **Bounded**: every `Map` or `Set` that lives long has a removal path; every timer, subscription and child process is
  released in `dispose()`; every promise is awaited or has a `.catch` that logs.
- **Only `agent-host/` and the bridge import `@getpaseo/*`.** Paseo facts: the `paseo-boundary` skill.

## Layout

```text
shared/contracts/ports/<name>.ts   the port: types only, language-neutral in spirit
server/satellites/<name>/          the adapter, one module per concept, named for what it exports
test/fakes/<name>.ts               the fake the kernel and bridge tests use: it records, it does not reimplement
```

A port may have one adapter and its fake. An abstraction above that needs a second caller today.

## The bridge

- Intake: a tool call, hook or RPC becomes a command with an id and a caller (the agent whose key its tool server
  showed, the Human, or the bridge for a fact). A command id seen before returns its earlier result.
- One queue per project: commands run one at a time through `decide`; events and effects commit in one transaction.
- Dispatch: pending effects go to their satellite after the commit, never before. The result comes back as a command
  (`record_evidence`, `record_turn`, ...), carrying the effect's key.
- The machine hold is read from the machine's own file before dispatching anything that loads the machine.

## Git (workspace)

- git's own CLI as argv through `execFile`, never a shell string and never a library that reimplements it.
- The workspace's own git runs nothing an agent could plant in the repository: `-c core.hooksPath=<os.devNull>
  -c core.fsmonitor=false`, and each key of `local` or `worktree` scope that git runs as a command emptied with
  `-c key=` (filters' clean, smudge and process; merge drivers; diff textconv and command; `core.sshCommand`,
  `gitProxy`, `askPass`, `editor`; `sequence.editor`; `gpg.*program`), found with
  `git config --show-scope --name-only --get-regexp`. The Human's global config, where their own filters such as LFS
  live, stands. V1's `plugin/server/core/git.ts` is the worked example.
- A merge with conflicts is aborted before returning `conflict(paths)`: never left half merged.
- A key becomes a path by `[A-Za-z0-9._-]` with a stable hash suffix when sanitizing changed it; the path stays
  inside the workspace root.

## The store

SQLite on `node:sqlite`: see `references/sqlite.md` before writing to it.
