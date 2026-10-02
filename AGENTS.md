# AGENTS.md

Seatworks is a Paseo plugin that serves a team of coding agents working the **SLP** way. The
**Supervisor** works with the Human and sees across lanes, a **Lead** owns one lane and its acceptance, a **Peer** owns
one task and the judgement inside it. Around them, a **Reviewer** gives evidence and the **watch** tells an owner when
to look. This file holds what you need before you change anything in this repository.

**Nothing has shipped.** No users, no releases, nothing to stay compatible with.

## The governing rule

The owner's words:

> "Lưu ý code plugin chỉ **_hỗ trợ / phục vụ_** concept SLP làm việc tốt hơn với Paseo chứ không hạn
> chế SLP làm việc nhé. Hiện tại tao đang thấy không có sự flexible và dự án đang quá loạn. Gần đánh
> mất đi concept vốn có của SLP."

The plugin **serves** SLP so it works better with Paseo. It must **never constrain** how SLP works.

- Ask of every change: does it take a constraint off SLP, or add one? Adding one needs a reason, written in its commit
  message. When a constraint goes, delete it; never add a switch to turn it off.
- If SLP were dropped tomorrow, the plugin must survive: every role is data, and a profile with every role renamed
  behaves the same (the rename test).
- **A decision the spec does not settle is the owner's.** Ask before you code it.

## Where the truth is

1. **CONCEPT-V2**, read through the orchestration analysis, is the standard. Its rules are cited as P1–P17 (what the
   plugin must provide), N1–N8 (what it must not do) and §sections; the article's paragraphs as A3.x¶n. Both are
   in `concept/`, exported from the owner's docs: `CONCEPT-V2.md` and `ORCHESTRATION-ANALYSIS.md`. The owner's docs
   stay the source; the copies here are refreshed from them, never edited.
2. **`spec/`** turns it into what to build. `KERNEL.md` is the contract: invariants I1–I12, commands, events.
   `CONFORMANCE.md` lists the cases that prove it. The order of work is below.
3. **The code** does what the spec says. Where code and spec disagree, one of them is wrong: fix the code, or change
   the spec in the same commit with the reason, never leave them apart.

The first version of this plugin, V1, was removed on 2026-09-29 and is in git history. The spec's "What V1 did"
sections say what it taught; never port a V1 mechanism the spec has no place for.

## The shape in one screen

```text
shared/kernel     decide(command, state) -> events | refusal; evolve(state, event) -> state; react(event, state) -> effects
                  pure TypeScript: no I/O, no clock, no ids, no dependency; the daemon and the app fold the same log
shared/contracts  zod: commands, events, tool arguments, RPC, profile files
server/bridge     the only place that builds the whole: Paseo hooks and tools -> commands; effects -> satellites; facts -> commands
server/satellites one job each behind a port (spec/PORTS.md): store, agent-host, workspace, evidence, delivery,
                  machine, reflex, watch, record, code-index
client/           the Human's surface (step 3)
bin/              the git shim and the team's MCP server, their own Node processes
harness/          each agent's shipped settings
templates/slp/    the SLP template: roles, prompts, skills, reflex.yaml, watch.yaml: runtime content, not docs
```

- **One log per project** in SQLite: events and the effects they ask for commit in one transaction (the outbox), one
  writer per project, commands carry ids, effects carry keys. Restart folds the log and re-sends effects with no
  result. Nothing is remembered in memory that the log does not hold.
- **The kernel refuses only what breaks an invariant**, and a refusal is a value naming it. No quota, no required
  review, no required order. It never judges evidence, ranks messages or decides acceptance.
- **Authority is read off the scope graph** (owner, parent, writer, watches), never off a role's name.
- **Satellites never call each other** and name nothing of SLP; each would serve a team that dropped it.
- **Only `server/satellites/agent-host/` and `server/bridge/` import `@getpaseo/*`** (`spec/PASEO.md`).

## Order of work

1. The kernel's spec. Done.
2. The kernel, the agent host, workspaces and the evidence runner: one lane end to end, and one agent alone for a
   small change, proved against a stand-in for Paseo (`test/bridge/lane.test.ts`). Done.
3. The Human's surface and the record: the surface, the activity, a finding's chain of change, the five signals;
   installing, attaching, cleaning up and the update check. Done.
4. The reflex and the watch (`spec/REFLEX.md`, `spec/WATCH.md`), starting with their `active` sets. Done.
5. **Now: testing on a real Paseo, by the owner.** What only a live daemon can show is in `spec/PASEO.md` and
   `spec/HARNESS.md`, To check. Anything the spec marks "to check" is checked against Paseo's published types or source
   before it is built on, never by an agent running the daemon.
6. Anything more only when the record shows a failure that needs it.

## Working here

- **Never start the daemon or launch agents to test.** They are real agents with broad permissions, and they cost
  money. The tests, your reading, Paseo's source and `~/.paseo/daemon.log` are the evidence.
- **Never print or cat a file that can hold a key:** the plugin's settings under Paseo's plugin settings directory,
  any `settings.json` of a project, `~/.paseo/config.json`, and any older `settings.json` under `~/.local/share/seatworks*`.
  A fake key in a test never starts with OpenRouter's real key prefix, so a scan for it before a push finds only a
  real one.
- **Don't click settings in the owner's live Paseo.** It writes their config.
- **No CI.** `npm run check` before every commit is the whole net. It runs, in this order: `tsc --noEmit`, ESLint with
  type-checked rules, Prettier's check at 120 columns, and `node --test` over every test file. Until `package.json`
  exists, the first code commit creates it with that script.
- **Spec files are the docs the owner asked for.** No other markdown and no decision records; a change that needs
  explaining is explained in its commit message.

## Skills for building Seatworks

In `.claude/skills/`, for whoever builds Seatworks. They are not the agents' runtime skills in `templates/slp/skills/`.

| Skill               | Use                                                                              |
| ------------------- | -------------------------------------------------------------------------------- |
| `kernel-change`     | A command, event, invariant or entity: decide, evolve, react, test first         |
| `satellite`         | A satellite behind its port, the bridge, git and the SQLite store                |
| `paseo-boundary`    | Before touching the agent host, the bridge or the manifest: Paseo's easy-to-miss facts |
| `profile-content`   | Prompts, runtime skills, reflex questions and watch moments                      |
| `clean-code`        | While writing, and the simplify pass once it works                               |
| `testing`           | Conformance cases, properties, replay, shell edges, failing first                |
| `test-audit`        | The gate every new or changed test passes, and audits of weak tests              |
| `pre-commit-review` | Your own diff, adversarially, before every commit                                |

## How the code is written

The skills hold the recipes. The rules:

- **TypeScript, strict**: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly` (Paseo's worker strips types rather than compiling them: no enums,
  namespaces or parameter properties), `moduleResolution: Bundler` with `.ts` extensions in imports, `noEmit`. The
  client has a tsconfig of its own. The toolchain: TypeScript 5.9,
  ESLint 10 with typescript-eslint's type-checked rules, Prettier 3, zod 4, the MCP SDK 2
  (`@modelcontextprotocol/server`), and `@getpaseo/plugin` at the release the spec was read against.
- **Data is a `type`**, `readonly` all the way down in `shared/`. A union of literals or an `as const` table, never an
  enum. Every `switch` over a union ends in an exhaustive `never` check.
- **Errors**: a refusal or an expected failure is a returned value (`Result`); a throw is a bug, with `{ cause }` when
  rethrown. A `catch` that does nothing says why in one line.
- **One module, one concept**, kebab-case, named for what it exports. Split by concept, never by line count.
- **No dormant machinery**: no abstraction, option or setting without a caller today. A port may have one adapter and
  its test fake.
- **One live contract, hard cut**: no dual path, fallback, shim, legacy parser or read-time upgrade. Change every
  producer and consumer together. The log has no format number before 3.0.0; until then its shape changes with no
  upgrade step.
- **Code owns only the concept.** Agents, models, tools, thresholds, questions and moments are profile data. A role,
  agent or server name in `shared/` or `server/` is a defect, and a test finds it.
- **Comments are few**: at most one short docstring per declaration, saying why; none that restate the code.
- **Formatting**: Prettier at 120 columns. Commit subjects are one imperative sentence on the change in behaviour,
  sentence case, no prefix.

## Tests

- **The conformance cases are the tests.** Each row of `spec/CONFORMANCE.md` becomes one test at the boundary an
  agent or the Human uses: commands as a tool sends them, facts as a satellite returns them, the log read back.
- **Fail first.** Put the old behaviour back, or leave the rule out, and watch the test fail before it counts.
- **The kernel** is tested with no I/O and no mocks, and with fast-check running random command sequences and
  checking every invariant after each. Recorded logs are folded by new code, as replay tests.
- **A race is decided by a gate the test holds and releases**, never by a sleep or a count of ticks.
- Never: a test with no assertion, an expected value the code under test computed, a mock that does the behaviour,
  a second test of one contract, a log written by hand where a workflow would produce it, or a test that invents an
  interface the spec has not settled.

## Runtime content

`templates/slp/` is what agents read and what the reflex asks. An edit there changes what agents do.

- A prompt keeps only judgement; what code can check is code, and what a tool reply says is not repeated.
- The watched never learn they are watched: no prompt, tool reply or fact to an agent names the watch or a moment.
- Reflex questions and watch moments follow `spec/REFLEX.md`, Asking well: one condition, the smallest state, every
  outcome described, English.
- `NOTICE.md` at the repository root lists the outside sources the skills draw on; a skill drawn from a new source
  adds its row there, and the plugin ships a copy.

## Paseo

Read `spec/PASEO.md` and the `paseo-boundary` skill before touching the agent host or the bridge. Paseo ships weekly;
check a fact against the installed `@getpaseo/*` types or Paseo's source, not memory.
