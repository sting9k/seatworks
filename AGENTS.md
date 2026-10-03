# AGENTS.md

Seatworks is a Paseo plugin that serves a team of coding agents working the **SLP** way. The
**Supervisor** works with the Human and sees across lanes, a **Lead** owns one lane and its acceptance, a **Peer** owns
one task and the judgement inside it. Around them, a **Reviewer** gives evidence and the **watch** tells an owner when
to look. SLP is one way of working, and the plugin is open to others: a way of working is a **template**, files a
Human installs and a team runs, and SLP is the template that comes with the plugin. This file holds what you need
before you change anything in this repository.

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
- The same holds for every template. A template arranges a team and words what its agents read; it never gives the
  kernel a reason to refuse and brings no code. **Making one never needs a change to the plugin**: where it does, the
  plugin is at fault and is mended (`spec/TEMPLATE.md`).
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
shared/contracts  zod: commands, events, tool arguments, RPC, profile and template files
server/bridge     the only place that builds the whole: Paseo hooks and tools -> commands; effects -> satellites; facts -> commands
server/satellites one job each behind a port (spec/PORTS.md): store, agent-host, workspace, evidence, delivery,
                  machine, reflex. The watch's eye is in the bridge, the record's reading in shared/views, and the
                  code index is a port nothing is built behind yet
server/profile    a profile's files on disk: loading, installing, a project's own copy, matching agent profiles
client/           the Human's surface
bin/              the git shim, the team's MCP server, the gallery's build and the template check: their own Node
                  processes
harness/          each agent's shipped settings
templates/slp/    SLP, the template that comes with the plugin: roles, prompts, skills, reflex.yaml, watch.yaml:
                  runtime content, not docs
editor/           the template editor, a web page of its own that Paseo does not build (spec/EDITOR.md)
```

- **One log per project** in SQLite: events and the effects they ask for commit in one transaction (the outbox), one
  writer per project, commands carry ids, effects carry keys. Restart folds the log and re-sends effects with no
  result. Nothing is remembered in memory that the log does not hold.
- **The kernel refuses only what breaks an invariant**, and a refusal is a value naming it. No quota, no required
  review, no required order. It never judges evidence, ranks messages or decides acceptance.
- **Authority is read off the scope graph** (owner, parent, writer, watches), never off a role's name.
- **Satellites never call each other** and name nothing of SLP; each would serve a team that dropped it.
- **Only `server/satellites/agent-host/` and `server/bridge/` import `@getpaseo/*`** (`spec/PASEO.md`).
- **The core has no profile of its own.** A template is installed by the Human into the state root; a project takes
  its own copy when it is attached and runs that alone, one template for its life; only Sync, pressed on the
  project's own page, changes what a team reads. Nothing runs from `templates/`, so a release never writes over what a
  team runs. Hashes say what changed: the template that comes against the installed one, the installed one against
  a project's copy, and the copy against the record (`spec/TEMPLATE.md`).

## Order of work

1. The kernel's spec. Done.
2. The kernel, the agent host, workspaces and the evidence runner: one lane end to end, and one agent alone for a
   small change, proved against a stand-in for Paseo (`test/bridge/lane.test.ts`). Done.
3. The Human's surface and the record: the surface, the activity, a finding's chain of change, the five signals;
   installing, attaching, cleaning up and the update check. Done.
4. The reflex and the watch (`spec/REFLEX.md`, `spec/WATCH.md`), starting with their `active` sets. Done.
5. Open templates (`spec/TEMPLATE.md`, `spec/EDITOR.md`): the editor, installing and removing a template, outside
   tool servers, matching agent profiles, a project's own copy and Sync, the gallery's build, a report's sections as
   the profile's, the gallery's own repository and its page. Done.
6. **Now: testing on a real Paseo, by the owner.** What only a live daemon can show is in `spec/PASEO.md` and
   `spec/HARNESS.md`, To check. Anything the spec marks "to check" is checked against Paseo's published types or source
   before it is built on, never by an agent running the daemon. The surface is type-checked and nothing more: what
   it shows of templates, matching and Sync has not been seen on a real Paseo.
7. Anything more only when the record shows a failure that needs it.

## Working here

- **Never start the daemon or launch agents to test.** They are real agents with broad permissions, and they cost
  money. The tests, your reading, Paseo's source and `~/.paseo/daemon.log` are the evidence.
- **Never print or cat a file that can hold a key:** the plugin's settings under Paseo's plugin settings directory,
  any `settings.json` of a project, `~/.paseo/config.json`, and any older `settings.json` under `~/.local/share/seatworks*`.
  A fake key in a test never starts with OpenRouter's real key prefix, so a scan for it before a push finds only a
  real one.
- **Don't click settings in the owner's live Paseo.** It writes their config.
- **No CI here.** `npm run check` before every commit is the whole net. It runs, in this order: `tsc --noEmit` for the
  plugin, the client and the editor, ESLint with type-checked rules, Prettier's check at 120 columns, and `node --test`
  over every test file.
- **The editor and a template's check run from a checkout**: `npm run editor` serves the editor with a gallery built
  from `templates/`, and `npm run template -- check <dir>` loads a template as the editor and the plugin do.
- **The gallery is a repository of its own**, `sting9k/seatworks-gallery`: templates as directories, published by
  pull request, and no copy of the editor. Its build checks this repository out at the branch its
  `SEATWORKS_REF` variable names, runs `npm run gallery -- <its templates>` and `vite build editor`, and publishes
  the result as its GitHub Pages, https://sting9k.github.io/seatworks-gallery/; on a pull request the same build is
  the check a template passes. It builds what is pushed: a second workflow there looks every quarter of an hour, and
  builds the page again when that branch has moved past the commit the page was built from. So the `gallery`
  script, `bin/gallery.ts` and the editor's build are called from outside: change one and that workflow together.
- **Spec files are the docs the owner asked for**, and `README.md` is for whoever installs Seatworks or makes a
  template. No other markdown and no decision records; a change that needs explaining is explained in its commit
  message.

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
  client and the editor each have a tsconfig of their own. The toolchain: TypeScript 5.9,
  ESLint 10 with typescript-eslint's type-checked rules, Prettier 3, zod 4, the MCP SDK 2
  (`@modelcontextprotocol/server`), and `@getpaseo/plugin` at the release the spec was read against. The editor adds
  React, React Flow, dagre, markdown-it, Vite and fontsource's three Red Hat families as devDependencies: nothing
  Paseo builds imports them, and a test holds that.
- **Data is a `type`**, `readonly` all the way down in `shared/`. A union of literals or an `as const` table, never an
  enum. Every `switch` over a union ends in an exhaustive `never` check.
- **Errors**: a refusal or an expected failure is a returned value (`Result`); a throw is a bug, with `{ cause }` when
  rethrown. A `catch` that does nothing says why in one line.
- **One module, one concept**, kebab-case, named for what it exports. Split by concept, never by line count.
- **No dormant machinery**: no abstraction, option or setting without a caller today. A port may have one adapter and
  its test fake.
- **One live contract, hard cut**: no dual path, fallback, shim, legacy parser or read-time upgrade. Change every
  producer and consumer together. The log has no format number before 3.0.0; until then its shape changes with no
  upgrade step. Nothing is built to read, mend or remove what an older build wrote either: the owner clears it by
  hand.
- **Code owns only the concept.** Agents, models, tools, thresholds, questions, moments and a report's sections are
  profile data. A role, agent or server name in `shared/`, `server/` or `client/` is a defect, and a test finds it.
  What a template must never choose is the plugin's: where the Human's key is sent, and what is masked as a
  secret.
- **Comments are few**: a docstring is one line, saying why, and none restates the code. The reasons for a change
  are in its commit message and the spec.
- **Formatting**: Prettier at 120 columns. Commit subjects are one imperative sentence on the change in behaviour,
  sentence case, no prefix.

## Tests

- **The conformance cases are the tests.** Each row of `spec/CONFORMANCE.md` becomes one test at the boundary an
  agent or the Human uses: commands as a tool sends them, facts as a satellite returns them, the log read back.
- **Fail first.** Put the old behaviour back, or leave the rule out, and watch the test fail before it counts.
- **The kernel** is tested with no I/O and no mocks, and with fast-check running random command sequences and
  checking every invariant after each. Recorded logs are folded by new code, as replay tests.
- **A race is decided by a gate the test holds and releases**, never by a sleep or a count of ticks.
- **No test runs the owner's own `gh`.** One that reaches GitHub's command line puts a stand-in first on `PATH`.
- **A fresh state root has no template installed.** A bridge test that opens a project starts from
  `test/bridge/state-root.ts`, which has SLP installed as the Human would have it.
- Never: a test with no assertion, an expected value the code under test computed, a mock that does the behaviour,
  a second test of one contract, a log written by hand where a workflow would produce it, or a test that invents an
  interface the spec has not settled.

## Runtime content

`templates/slp/` is SLP as it comes with the plugin: what its agents read and what the reflex asks. A team runs the
copy its project took, so an edit here reaches one when the template is installed again and the project synced.

- A prompt keeps only judgement; what code can check is code, and what a tool reply says is not repeated.
- The watched never learn they are watched: no prompt, tool reply or fact to an agent names the watch or a moment.
- Reflex questions and watch moments follow `spec/REFLEX.md`, Asking well: one condition, the smallest state, every
  outcome described, English.
- `NOTICE.md` at the repository root lists the outside sources the skills draw on; a skill drawn from a new source
  adds its row there, and the plugin ships a copy.

## Paseo

Read `spec/PASEO.md` and the `paseo-boundary` skill before touching the agent host or the bridge. Paseo ships weekly;
check a fact against the installed `@getpaseo/*` types or Paseo's source, not memory. Its source is public
(`getpaseo/paseo`, a tag for each release): what it takes for which provider is not in its published types.

- **What an agent is made with is by provider** (`spec/HARNESS.md`, `harness/<provider>.json`): Paseo takes MCP
  servers and pre-approved tools for Claude, Codex and OpenCode only, and refuses a create that hands them to another.
- **The stand-in for Paseo in the tests refuses what Paseo refuses** (`test/bridge/fake-paseo.ts`). When Paseo
  changes what it takes, change the stand-in first and let the tests show what breaks.
- **Claude Code and Pi were seen on live agents on 2 October 2026; Codex and OpenCode have not been.** What the live
  runs showed is in `spec/HARNESS.md` and `spec/PASEO.md`, Seen on a live Paseo; what only a live one can still show
  is in their To check.
