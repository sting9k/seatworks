# Stack

The language each part of Seatworks is written in, chosen for what that part does best, under one limit: a user installs
nothing but Paseo, Jev's key and git. Every part is either bundled by Paseo itself or already on the machine. Read on
29 September 2026 against Paseo 0.10.1's plugin reference and source.

## What Paseo decides for us

- A plugin has three folders. `server/` is bundled for a daemon subprocess with Node's APIs. `client/` is bundled for
  the Paseo app, React Native on iOS, Android and the web. `shared/` goes into both and may import only shared code:
  no Node, no React, nothing tied to one runtime. A module anywhere else is a compile error.
- Paseo builds both bundles itself, from `index.server.ts` and `index.client.tsx`. A plugin's `build` steps are argv
  commands such as `npm ci --omit=dev`; nothing asks the user for a compiler.
- The plugin's server runs as a child the daemon forks with its own Node (`fork`, `--experimental-strip-types`), and
  Paseo's own server already loads `node:sqlite` there (its Oh My Pi provider reads a database with it). Paseo's CI
  runs Node 22, where `node:sqlite` is synchronous and prints an experimental warning once.
- Its SDK, protocol and client are TypeScript, and its RPC contracts are zod schemas in `shared/`.

## The choice

| Part                              | Language                            | Why it is the strongest choice here                                        |
| --------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Kernel                            | TypeScript, pure, in `shared/`      | Runs unchanged in the daemon and in the app, so a surface can fold the same log the daemon does. Commands and events are discriminated unions checked exhaustively; state is `readonly`; no I/O and no dependency |
| Store and views                   | SQL on `node:sqlite`                | The log is an append-only table with an expected sequence, atomic under a transaction; the chain of change and the signals are queries, the scope tree a recursive CTE. Built into Node: nothing to install |
| Bridge, agent host, delivery, workspace, evidence, machine, reflex, watch | TypeScript in `server/` | Paseo's SDK is TypeScript, so the adapter reads its types directly, and a release that changes one fails the typecheck in the one place that imports it (PASEO rule 1) |
| Workspace's git                   | git's own CLI, as argv              | git is the specialist; Seatworks calls it with hooks, fsmonitor and configured commands switched off, never a library that reimplements it |
| Git shim                          | TypeScript on Node, behind a two-line launcher (`sh`, and `.cmd` on Windows) | Parsing git's argv (`-C`, `-c`, aliases, `--git-dir`) correctly matters more than the 40 ms Node takes to start; V1's shim is the shape |
| Team tools                        | TypeScript, the MCP SDK             | One stdio server per agent, the kernel's commands as tools, their arguments as zod schemas; it reaches the bridge over a local socket with the agent's key (`PORTS.md`, Tools) |
| Pi extension                      | TypeScript                          | Pi loads extensions written in TypeScript                                  |
| Human surface                     | TypeScript and React Native (TSX)   | What Paseo's client contributions are written in                           |
| RPC between surface and daemon    | zod schemas in `shared/`            | Paseo's own contract form                                                  |
| Profile, questions, moments, rules | YAML                               | Read and edited by people; validated against zod schemas when loaded       |
| Prompts and skills                | Markdown                            | What agents read                                                           |
| Patterns: environment failures, minted names | Regular expressions, as profile data | Code first, before any model is asked                             |
| Patterns: what looks like a secret | Regular expressions in `shared/contracts/secrets.ts` | The plugin's own, so every profile masks the same               |
| The reflex's routes               | JSON in `harness/jev.json`          | The plugin's own: where the Human's key is sent is never a profile's to say |
| Codex's shared settings, Oh My Pi's agent directory | TOML, YAML and JSON files, shipped as they are | Each agent's own format, written once, not generated        |
| Evidence steps                    | The project's own commands          | The project decides how it is checked                                      |
| Template editor                   | TypeScript and React in `editor/`, on React Flow, laid out by dagre, Markdown shown by markdown-it, built by Vite | A web page of its own, outside what Paseo bundles (`EDITOR.md`). It imports `shared/contracts`, so it reads a profile with the schemas the plugin loads it with |
| Tests                             | `node:test`, with fast-check for the kernel | Random sequences of commands, with every invariant checked after each; the kernel's conformance cases as ordinary tests |

Runtime dependencies, all pure JavaScript and bundled: the MCP SDK, zod, and a YAML parser. No native module, since a
compiled addon would tie the plugin to one platform and one Node. The editor's packages (React Flow, dagre, markdown-it, React's
DOM renderer, Vite) are development dependencies: a Git install's build installs none, so a user of the plugin never
gets them.

## Considered, and not taken

- **Rust compiled to WebAssembly for the kernel.** Stronger types and no null, but a second toolchain for everyone who
  works on Seatworks and a boundary to debug across, for a state machine small enough that exhaustive unions and property
  tests hold it.
- **TLA+ or Alloy to model-check the invariants.** The strongest proof of the concurrent parts (handover, obligations
  moving, integrations one at a time, the machine-wide hold), but a Java toolchain for maintainers. fast-check covers
  the same ground by sampling; a model comes back only if a look back finds a concurrency bug it would have caught.
- **Go or Rust for the git shim.** Faster to start, but a binary per platform to build and ship.
- **Datalog for the views.** Graph queries read naturally in it, but SQL's recursive queries answer the same ones and
  need no engine.
- **A tracker the Human already reads, as the store.** The log must be appended atomically with an expected sequence
  and read back whole; a tracker can show the record, through the Human's surface, but cannot be it.

## Layout, as Paseo builds it

```
paseo-plugin.json      id, requirements.paseo >=0.10.0, build: npm ci --omit=dev
index.server.ts        the bridge's entry: builds the whole
index.client.tsx       the Human's surface
shared/kernel/         entities, invariants, commands, events, fold; imports nothing
shared/contracts/      zod schemas: RPC, tool arguments, profile files
server/bridge/         Paseo's hooks and API to kernel commands and facts, effects to satellites
server/satellites/     store, agent-host, workspace, evidence, delivery, machine, reflex, watch, record, code-index
client/                the surface and its views
bin/                   the git shim, the team's MCP server, the gallery's build and the template check (`npm run
                       template`), run by Node as their own processes
harness/               each agent's shipped settings (codex/config.toml, omp/config.yml, pi/extension.ts)
profile/slp/           the SLP preset
editor/                the template editor, a web page: `npm run editor` serves it, `npm run editor:build` builds it,
                       each after `npm run gallery` builds the gallery it lists from `profile/`
```

`editor/` is not part of what Paseo builds: nothing in `index.server.ts` or `index.client.tsx` imports it.
