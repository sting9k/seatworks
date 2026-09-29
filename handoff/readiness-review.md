<!-- Review report as written on 2026-09-29, before the repository moved: read every `v3-redesign/` path as the repository root. -->

## Seatworks v3: readiness review for a first run on Paseo 0.10.1

I found five things that could stop or break a first run. None of the "to check" items can be proved without Paseo's daemon source or a live run, but some can be narrowed down from the published types. I changed no repo files. My mutation runs were done on a copy at `scratchpad/review-ready/v3`. On the repo itself, typecheck, ESLint and Prettier are clean and all 91 tests pass. `~/.paseo/daemon.log` does not exist on this machine, so it gave no evidence.

### Blockers for the first real run

1. **The install path points at a branch that doesn't have v3.** `v3-redesign/` is not on `origin/main` (checked with `git ls-tree origin/main`). So the curl URL (`install.sh:4`) returns 404. Without `--ref`, `paseo plugin install sting9k/seatworks:v3-redesign` (`install.sh:76-78`) takes the default branch, which is main.
   - **Fix now:** install with `--ref claude/fervent-pascal-i52dey` (pushed, at 7e9c5b5), or better, with `--dir` (see 2).

2. **The plugin may not find its own directory.** `plugin.ts:174-177` reads `config.get().config.plugins.seatworks.path`. Paseo's config schema only accepts `{source:"directory", path}` there (`@getpaseo/protocol/dist/messages.js:111`, `plugin-config.js` `PluginSourceSchema`). So a plugin installed from Git probably has no entry, and `start()` throws "Paseo's config has no plugins.seatworks with a path". If that happens, nothing starts, and the failed start is cached until the plugin is reloaded.
   - V1 showed that the directory entry does exist for a directory install (`plugin/server/core/paths.ts:108-114`).
   - **First run:** install with `--dir` from a separate clone, not your working checkout, in case Paseo runs `npm ci` there.

3. **The server imports a devDependency at runtime.** `shared/contracts/settings.ts:1` imports `defineSettings` from `@getpaseo/plugin`, which is only in devDependencies, and the manifest builds with `npm ci --omit=dev`. V1's server never did this; only its client did, where Paseo supplies the SDK.
   - **Fix:** move `@getpaseo/plugin` to dependencies, or confirm that Paseo's server bundler supplies it.
   - **First run:** run a plain `npm ci` in the `--dir` clone.

4. **A failed agent create leaves an empty seat, and the surface can't recover it.** `host.ts:69` builds `provider/model` only when the profile has a model. Otherwise it sends a bare provider, and `parseProviderModel` throws (`@getpaseo/client/dist/index.js:432-440`). Any error other than `_request_*` is rethrown (`host.ts:88-93`).
   - The dispatcher then gives up after 5 tries with only a line in `daemon.log` (`dispatcher.ts:117-122`). No `record_gone` is recorded, so the Supervisor stays seated with no agent.
   - The surface only sends `send_message`, `answer_permission` and `answer_question`, so it has no way to reseat.
   - **Fix:** make `PaseoHost.create` catch every error and return `{failed}`.
   - **Owner:** give every `slp-*` profile an explicit model before attaching a project.

5. **After a restart, the plugin loses its first hooks and the reopened agent's environment.** `envFor`, `turnEnded`, `permissionAsked` and `archived` look up `byHost` before `whenReady()` (`plugin.ts` ~476-560). After a restart that map is empty until `start()` finishes.
   - A probe in the copy confirmed this: `envFor` returns null right after a restart and works once the plugin is ready. That means the reopened agent gets no git shim and no `SEATWORKS_*` variables.
   - There is no reconcile step (PASEO.md rule 5 isn't implemented), so a missed `turn_ended` can leave queued deliveries waiting forever.
   - **Fix:** await `whenReady()` before the lookup, and add the reconcile.

### Gaps that won't stop the run but will show up

- **Only Claude and Pi have harness files.** Codex, Oh My Pi and OpenCode agents start with no guards: nothing blocks their subagents, and Codex can't write the git directory to commit. Use Claude profiles for the first run.
- **Copies are made with a plain `git worktree add`** (`workspace.ts:47-70`), not Paseo's worktree setup, which `PASEO.md` says v3 uses. Peer and evidence copies have no `node_modules` or `.env`, so a check like `npm test` fails as "environment". Include an install step in the checks.
- **The plugin's own commands run with the daemon's `PATH`.** This covers checks, git and push (`runner.ts:82-87`, `git.ts` spawns `git`). A daemon started from the app may not have Homebrew on its `PATH`. `publish` needs your git credentials to be available to the daemon.
- **`process.execPath` is used as `node`** for the team tool server and the git shim (`plugin.ts:620`, `shim.ts:8`). This breaks if the daemon is Electron. V1 guarded against this (`plugin/server/core/paths.ts:73-76`).
- **Claude's sandbox** is passed as `providerOptions.sandbox`; V1 used `providerOptions.settings.sandbox`. On Linux the sandbox needs bubblewrap. Also check that a commit in a worktree can write to the repository's `.git`.
- **Landing on a base you have checked out** needs your working tree to be clean (`workspace.ts:101-107`).
- **The Jev route disagrees with the spec.** `REFLEX.md:330` says to use V1's `/api/alpha/decisions` until OpenRouter's data-collection opt-out is shown to hold. `reflex.yaml` uses `/api/v1/systemone`. This is a privacy decision for you.
- **`NOTICE.md` is not in `v3-redesign/`**, though `AGENTS.md` says the plugin ships a copy.
- **Profile names and V1:** install.sh also asks for an `slp-peer-alt` profile. If V1 (`seatworks-v2`) is installed, disable it for the test.

### The "to check" items

**PASEO.md**
1. **Per-agent control of Paseo's tools: settled, there is none.**
   - `AgentSessionConfig` has no such field (`messages.js:294-306`).
   - Control is global, through `mcp.injectIntoAgents` (`messages.js:79-83`), or per provider, through `paseoTools {enabled, disabledTools}` (`provider-config.js:24-27`).
   - v3 checks neither. If injection is on, agents get Paseo's own tools such as `create_agent`, which is orchestration outside the plugin's record.
2. **Branch names and locking through `workspaces.create`: settled, and it doesn't apply.** v3 doesn't use it. Paseo's request takes `branchName` and `worktreeSlug` but has no lock (`messages.js:2180-2219`). The cost is losing Paseo's worktree setup (see above).
3. **Paseo's command line on the daemon's `PATH`:** can't be settled offline. Both cases are handled and tested (`update-check.ts:22-24`).
4. **`projects.list`: partly settled.** It returns one full array with `projectRootPath` and `projectKind` (`messages.js:3606-3622`, `3754-3761`). What's unknown is whether the team's own copies show up as projects. If they do, `unattached()` would offer them for attaching.
5. **New items found in this review, all unsettled:**
   - `config.plugins` for a Git install (blocker 2).
   - Whether Paseo supplies the SDK to the server bundle (blocker 3).
   - Whether a directory install runs the `build` step.
   - Which Node the plugin worker runs on. `node:sqlite` needs 22.13 or later.

**HARNESS.md:** all three unsettled.
- The Codex item doesn't apply yet, since there is no `harness/codex.json`.
- The `settingSources` item matters now: Lead and Reviewer copies check out a Peer's commit. So a `.claude/settings.json` that a Peer planted could run hooks in their sessions.

**REFLEX.md:** both unsettled; they need OpenRouter's live behaviour. The code already uses the route the spec hasn't cleared.

**WATCH.md:** all three need measuring on a real lane.

### Manual test plan

1. Clone the branch into a new folder, run `npm ci`, then `sh install.sh --dir <clone>/v3-redesign`. Check that `paseo plugin ls` shows seatworks as running.
2. Reload the plugin. In `daemon.log`, look for `[seatworks]` lines. There should be no "could not start" and no "no plugins.seatworks". Look for an `ExperimentalWarning: SQLite` line, which shows `node:sqlite` loaded.
3. In Paseo's settings, check that MCP injection into agents is off. Create the `slp-supervisor`, `slp-lead`, `slp-peer`, `slp-peer-alt`, `slp-reviewer` and `slp-watcher` profiles, each on Claude with an explicit model.
4. Open the Seatworks sidebar. Your repository should be listed to attach, and none of `~/.local/share/seatworks/...` should be. Check that your checkout is clean and on main.
5. Attach the project. In git, check `git log -1 main -- AGENTS.md` shows a commit by "seatworks" with only that file, and that anything you had staged is still staged. The Supervisor's chat should open, and the activity feed should show no "is gone" line.
6. Make sure the Supervisor's copy is actually in use: its working directory is `~/.local/share/seatworks/projects/<id>/copies/root`, and running `echo $PATH` in its shell starts with `.../seatworks/bin`. The team server should be running as a process (`ps`).
7. In the Supervisor's chat, ask for a small change and answer its grilling. Have it set checks that start with an install step.
8. When it opens a lane, check that `git branch --list 'sw/*'` shows the lane branch and that `git worktree list` shows locked copies.
9. When a Peer is seated, check that in its chat `git push` is refused with "seatworks: refused". Check that `git commit` works inside its sandbox and that `touch ~/outside` fails.
10. When the Peer hands back, the checks' results should appear on the record, and the Lead should integrate the task into the lane.
11. When the lane lands, main should move by fast-forward, and `docs/seatworks/MAP.md` (and `GLOSSARY.md` if a word was settled) should be committed. Your checkout should stay clean.
12. Ask for `publish` with `origin` only if you want it. Watch `daemon.log` for credential errors.
13. Permissions: Claude runs in bypass mode, so expect none. If one appears on the panel, answer it and check it isn't answered twice.
14. Restart the daemon and reopen a Peer's chat. Expect the missing git shim (blocker 5): `git push` will not be refused.
15. Clean up, which should list what the team left behind. Remove the project. Its agents should be archived, the `sw/<id>/*` branches gone, the note removed from `AGENTS.md`, and the record kept under `archive/`.

### Coverage gaps, highest risk first

**Rows of `spec/CONFORMANCE.md` with no test or code:**
1. **Delivery:**
   - the same key posted twice;
   - busy, then re-sent once;
   - restart with messages queued;
   - five Peers sending during the Lead's turn;
   - a batch too long for one message (no splitting in `render.ts`).
2. **Recovery:** an agent reopened after a real restart (see weak test 3).
3. **Workflow:** `publish` when the remote moved.
4. **Workspace:** the copy moving while a check runs.
5. **Evidence:** another project asking for a run during a hold.
6. **Verdicts:** "`integrate` citing a verdict on an older commit" and "a verdict of changes recorded as evidence". `record_verdict` is never called in any test.
7. **Profile loading:**
   - I12: a question whose `tells` would classify, integrate or answer is not refused when the profile loads (`tells` is a free string in `reflex/config.ts:21`).
   - A profile with no `humanDoor` role.
8. **Reflex:**
   - compiled project rules and "an instruction file changes": not implemented at all;
   - 400 `max_tokens_exceeded` (the code exists at `jev.ts:98`);
   - twenty questions reading the same fields as one call;
   - a question renamed in `reflex.yaml`;
   - wording changed since its look back;
   - marked weak at the look back.
9. **Watch:** a profile with no Watcher role, no moments, a candidate given again after restart, Jev unreachable, and three moments in one turn.

**Tests that stay green with the behaviour broken** (each checked by mutating the copy):
1. **`invariants.test` "I2" and `properties.test`:** removing the I2 check from `checkState` leaves all 91 tests green. The property test uses `checkState` itself as its oracle, so it can't catch a gap in it.
2. **`invariants.test` "I1":** removing the one-writer check also leaves the suite green. The first I1 row (taking a writer without handover) is never tried.
3. **`pi.test` "an agent reopened after a daemon restart…":** it reuses the same plugin instance, so it never restarts. A real restart returns a null environment.
4. **`delivery.test` "a reader inside its turn is not sent anything":** the stub itself returns busy. Deleting `PaseoHost.send`'s `activeTurn` check leaves everything green, so the Paseo fact that a send replaces a running turn is unprotected.
5. **Publish and the moved-copy check:** making `publish` always report success, or removing the runner's check that the copy moved, both stay green.