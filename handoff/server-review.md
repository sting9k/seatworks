<!-- Review report as written on 2026-09-29, before the repository moved: read every `v3-redesign/` path as the repository root. -->

I reviewed the bridge, satellites, core, profile, bin and harness code, and the entry file, against PORTS, PASEO, LEDGER and HARNESS. Nothing in the repo was edited. `tsc --noEmit` passes. Scratch scripts are in `/tmp/claude-0/-home-user-seatworks/2bc2844f-0fa7-5902-ae3d-27b6ae3079de/scratchpad/review-bridge/`: `env-restart.test.ts`, `ws.test.ts`, `remove.test.ts`, `start.test.ts`, `partial.test.ts`, plus a `shimrepo/` probe. Findings are ranked by severity.

## High

**1. Agents resumed after a daemon restart get no git guard and no seat.** `server/bridge/plugin.ts:548-551`
- **Defect:** `envFor` looks up `byHost` before `whenReady()`. `byHost` is filled only by `open()`, which runs at the end of `start()`.
- **Scenario:** the daemon restarts and the first hook is `agent.session_open`. `saw()` starts `start()` but does not wait for it. `envFor` finds no entry and returns null. The agent resumes with no shim on PATH, no `SEATWORKS_*` variables and no Pi home, which is exactly what PASEO.md warns about.
- **Verified:** ran `env-restart.test.ts`. The first `envFor` after restart returns `null`; after ready it returns PATH.
- **Fix:** `await this.whenReady()` before the `byHost` lookup. The same early drop hits `turnEnded`, `permissionAsked`, `permissionResolved` and `archived`; see #11.

**2. The plugin's own git runs a smudge filter an agent planted in the repo config.** `server/satellites/workspace/git.ts:360-372`
- **Defect:** `worktree` is in `REFS_ONLY`, so its local config is never cleaned. But `worktree add` checks files out, and checkout runs filters.
- **Scenario:** an agent writes `filter.x.smudge` into `.git/config` and commits a `.gitattributes`. The next `Workspace.create` (`workspace.ts:55,66`) or evidence copy (`runner.ts:33`) runs that command in the daemon, outside any sandbox.
- **Verified:** ran `ws.test.ts`; the smudge marker file was created.
- **Fix:** remove `worktree` from `REFS_ONLY`.

**3. `putBlock` overwrites the Human's ignored `AGENTS.md` in their checkout.** `server/satellites/workspace/workspace.ts:199-203,232`
- **Defect:** `status --porcelain -- file` does not show ignored files, and `restore --worktree` then writes over them. The ignored file is also committed to base.
- **Verified:** ran `ws.test.ts`. A local ignored "MY PRIVATE NOTES" was replaced by the block alone.
- **Fix:** use `status --porcelain --ignored -- file`, and refuse on `!!` or `??`.

**4. One failure in `start()` disables the plugin until reload.** `plugin.ts:146-148,199-200,596`
- **Defect:** `this.ready ??= this.start()` keeps a rejected promise forever.
- **Scenarios:**
  - A single transient `config.get` error is cached; every later hook and RPC rejects with it.
  - One project whose log no longer folds throws inside `start()` and stops every project. Before 3.0.0 log shapes change with no upgrade step, so this is likely during development.
  - `dispose()` then throws at `await this.ready`, so `holds.close()` never runs. The socket stays open and the test process hung.
- **Verified:** ran `start.test.ts`. The second call still gives "socket reconnecting", dispose threw, and a stale project stopped the whole start.
- **Fix:** clear `this.ready` on rejection; open each project in its own try/catch and report it; in `dispose`, use `readyNow` instead of awaiting `ready`.

## Medium

**5. A removal that fails halfway later deletes the record for good.** `plugin.ts:394-403`
- **Defect:** `host.archive` can throw after `project.json` has been renamed to `project.removing.json`.
- **Scenario:** the project is then listed as "a folder with no project in it". Removing that runs `rmSync(dir)` at `:375-377`, which deletes the ledger that P14 keeps aside. Git still lists the worktrees, and the base note has already been taken out.
- **Verified:** ran `partial.test.ts`. The archive directory never appeared and 2 worktrees were still listed.
- **Also, traced:** on the "kept" path (`:417-419`) the agents are already archived, but `byHost` was cleared, so the ledger keeps them `seated` forever.
- **Fix:** wrap everything after the rename in try/finally that renames back. Archive through the ledger, or record `record_gone` for each agent.

**6. Removing a project whose repo is gone leaves it open in memory.** `plugin.ts:380`
- **Defect:** `runtime` is set to null when the repo is missing, even if the project is loaded.
- **Scenario:** the project is not unloaded. Its `byHost` entries and dispatcher stay live and write into the moved ledger under `archive/`. Attaching the same path again reuses that stale runtime.
- **Verified:** ran `remove.test.ts`; `runtimes.has` was still `true` and `statusOf` still answered.
- **Fix:** `this.runtimes.get(id) ?? (existsSync(repo) ? this.open(...) : null)`.

**7. Removing a project never clears its machine holds.** `plugin.ts:371-432`
- **Scenario:** if one of its actors held the machine, every other project's `workspace.create`, `candidate` and `evidence.run` waits forever (`dispatcher.ts:73`). No ledger is left that could release the hold.
- **Verified:** traced.
- **Fix:** add `holds.releaseProject(id)` to `MachineHolds` and call it in `removeProject`.

**8. Replaying an advance that already succeeded is refused as "moved".** `workspace.ts:101-116`
- **Scenario:** the daemon dies between `update-ref` and the `record_integration` commit. On replay the branch is already at `to`, so the result is "moved" (`react.ts:163-167`). The candidate is rebuilt, an empty merge commit is made, checks re-run for up to 30 minutes, and acceptance is asked again for work already landed.
- **Verified:** ran `ws.test.ts`; the second call returned `{ refused: 'moved' }`.
- **Fix:** if `sha(branch) === to`, return `{ sha: to }`.

**9. The git shim can be bypassed.** `bin/git-shim.ts`
- **Bypasses found:**
  - `git fetch . HEAD:<lane-branch>` moves a lane branch that nobody has checked out, skipping acceptance.
  - `git branch -Df x` deletes a branch; `BRANCH_MOVES` only matches exact tokens.
  - `git --attr-source HEAD checkout lane` is not caught: `parse` treats `HEAD` as the subcommand.
- **Verified:** probed a scratch repo through the shim; all three succeeded.
- **Fix:** refuse `fetch` refspecs whose destination is under `refs/heads`; check combined short flags character by character; add `--attr-source` to the options that take a value.

**10. A retried tool call makes a second command.** `server/bridge/team-socket.ts:137` and `bin/team-line.ts:242`
- **Defect:** each call gets a fresh `randomUUID()`. When the line drops, the agent is told "call again".
- **Scenario:** a call committed just before the drop comes back as a second `open_scope` or `send_message`, starting another scope and its agent. LEDGER §2 says a retry carries the same id.
- **Verified:** traced.
- **Fix:** give each call an id in `Line`, reuse it across a reconnect, and use it as the command id.

**11. Nothing reconciles on start or reconnect (PASEO rule 5).** `server/`
- **Defect:** no code uses `agents.list`, `activeTurn` or `pendingPermissions` to catch up (confirmed by grep).
- **Scenario:** a `permission_requested` or `turn_ended` that arrives before ready (#1) or while the plugin is down is lost for good. The agent waits in its prompt with nobody told, and a `wait`ing delivery stalls until some unrelated commit.
- **Verified:** traced and grepped.
- **Fix:** after `start()`, reconcile each agent in `byHost` from `refresh()`.

**12. Publishing pushes whatever the branch holds when the effect runs.** `shared/contracts/effects.ts:13`, `effects.ts:216`, `workspace.ts:313`
- **Defect:** LEDGER §8 specifies `expectedSha`, but the effect has none.
- **Scenario:** a lane that lands between the request and the dispatch is published without having been approved.
- **Verified:** traced.
- **Fix:** carry `expectedSha`, and refuse when the tip differs.

## Low

- **Checks outlive the plugin.** `runner.ts:83-88`: checks run detached in their own process group and nothing kills them on dispose. `unload` and `removeProject` wait up to 30 minutes in `dispatcher.idle()`. Traced.
- **A half-made copy counts as finished.** `workspace.ts:50`: any existing directory is taken as a ready copy, including one left by a SIGKILLed `worktree add` (300 s timeout). It is also never locked. Traced.
- **A failing `git status` counts as clean.** `workspace.ts:132-135` treats it as clean and force-removes a writer's copy; `onDisk` treats the same failure as unsaved. Traced.
- **Detached HEAD attaches to "main".** `plugin.ts:705-707`: with a detached HEAD and no base given, the project attaches to "main", and `open_project` cannot change the base afterwards. Traced.
- **A throw in fact submit or settle can crash the plugin worker.** `dispatcher.ts:140-145`: it becomes an unhandled rejection through `void this.run(...)` (for example, a reflex listener that throws inside `take`). The reflex's `void this.submit(...)` calls (`reflex.ts:151,354,388,418`) have the same gap. Traced.

## Unverified
- After a restart, the team MCP server may start before the socket listens; `serveStdio` with a rejected factory may leave the agent with no team tools for its session.
- If Paseo lets an old and a new worker overlap on plugin reload, two `ProjectStore` writers on one ledger make every `take` throw, and the second `listen()` unlinks the first socket.
- `harness/codex.json` is missing, though HARNESS.md specifies Codex's mode, approval policy and subagent settings.
- Two `turn_ended` hooks for one agent close together read the same `seen`, so typed words could be recorded twice.
