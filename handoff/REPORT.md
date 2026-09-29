# Handoff: open bugs from the 2026-09-29 review

Temporary folder for whoever fixes these next. Delete `handoff/` once every row below is closed.

Five read-only reviews ran on 2026-09-29 against the code as it was then, under `v3-redesign/`. That code now sits at
the repository root, so read every `v3-redesign/` path in the review files as the root. Three agents were then
started to fix the kernel, server and client findings. They were stopped part way, with their finished commits on
this branch and their unfinished work kept here as patches — all since applied, finished and committed.

Before you start, read `AGENTS.md` and the skills in `.claude/skills/` (`kernel-change`, `satellite`,
`paseo-boundary`, `testing`, `pre-commit-review`). Every fix needs a test that you have seen fail on the old code.
Run `npm run check` before each commit; it passed at the commit that added this folder, 94 tests.

## Files here

| File                    | What it is                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `kernel-review.md`      | Full review of `shared/kernel`, contracts and views, with file:line and a repro for each finding |
| `server-review.md`      | Full review of `server/`, `bin/`, the git shim and upkeep                                      |
| `client-review.md`      | Full review of `client/`, `index.client.tsx`, `install.sh` and the manifest                   |
| `readiness-review.md`   | What stops a first run on a real Paseo, the "to check" items, a 15-step manual test plan, and coverage gaps |

The profile review (prompts and skills against the kernel's rules) is already fixed in commit `4165575`. One item
remains open from it; see "Owner decisions" below.

## Status

Status values:
- **DONE**: committed, with a test that failed first.
- **WIP**: in a patch here, not verified. Apply it, finish it, and prove it.
- **OPEN**: not started.
- **NOT A BUG**: judged so by the fixing agent, with its reason.

### Where it stands (checkpoint for the next session)

- Every row below is **DONE** or **NOT A BUG**; the three `.patch` files are deleted. This folder now holds only the
  report and the reviews for the owner.
- `npm run check` passes at 121 tests. The client has no Node test runner for its React Native surface, so client
  fixes are verified by typecheck, lint and review, not by failing-first tests.
- **Push is blocked**: `git push` to `sting9k/seatworks` returns HTTP 403 — account `long7400` has no write access.
  All work is committed locally on `rebuild`; ask the owner for access or a fork to push to.

### Kernel: `shared/kernel`, `shared/contracts`, `shared/views` (`kernel-review.md`)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | High | `amend_brief` wiped every section it did not name. zod 4 `.partial()` still applies `.default([])`, so a goal-only amendment emptied constraints, choices and context, and was refused under I6 when a Human line was among them | **DONE** `732c5cc` |
| 2 | High | A permission's obligation closed when its answerer (the Lead) left, so the Peer's pending permission was lost and the Human's answer was refused as unknown. When the asker itself left, nothing closed it | **DONE** `9e4f0c1` |
| 3 | High | Messages and attentions moved at a reseat never reach the new agent. `react` emits no `deliver` for `message_moved`, nor for attentions moved by `reseated`, so the only delivery still targets the released actor and is dropped. This breaks CONFORMANCE "a Peer reseated with three messages queued receives the three" | **DONE** `37a3979` (patch applied, finished, test failed first) |
| 4 | Med | I4: a red gate on the candidate can be passed without a reason by citing only a passing verdict and leaving the failing check uncited | **DONE** `6ec72dd`: a reason is asked for any failing result on the commit, cited or not, per KERNEL I4 |
| 5 | Med | Dropping a Reviewer's scope prunes its verdict evidence, so `integrate` citing it is then refused ("unknown evidence"), which is not an invariant | **DONE** `b9a8fc2`: evidence stays while a live candidate, claim or obligation may still cite it |
| 6 | Med | `after` is recorded but nothing makes a scope wait: overlapping siblings get agents at once and write the same paths | **DONE** `c29c670`: a scope opened `after` a sibling gets its copy and agent only once that sibling is integrated or dropped |
| 7 | Med | An attention about the root's actor goes to the Human, but no view shows it and the Human cannot acknowledge it, so it stays open forever | **DONE** `e283b1e`: the Human's view shows these attentions, with acknowledge / mark-as-noise |
| 8 | Low | `drop_scope` closes the same obligation once per doomed scope (`scopes.ts:268-271`) | **DONE** `c055504` |
| 9 | Low | `reviewsThatChanged` never counts a verdict: verdicts are keyed to the reading scope, send-backs to the reviewed one (`record.ts:118-126`) | **DONE** `824140a`: matched on the commit the evidence read |
| 10 | Low | Citing the copy of a direction (`copyOf`) does not close it, in amend `via` or `answer` (`decider.ts:67`, `talk.ts`) | **DONE** `05b2cfe` |
| 11 | Low | `activity.ts:219` hard-codes "the Supervisor", a role name in `shared/`, and is wrong when an attention climbs from a vacant seat | **DONE** `da8b2c8`; the architecture test now reads words in all strings the code says, and found two more (fixed in the same commit) |
| 12 | Low | A Peer cannot raise a finding while its Lead's seat is empty (`findings.ts:37-38`), which is not an invariant | **DONE** `b83df48d`: the finding climbs past empty seats to the next seated owner, past the root to the Human (who gained `classify_finding` for it) |
| 13 | Low | `chainOf` and `mapText` keep the old verdict after `finding_reopened` (`record.ts:48`, `docs.ts`). Now reachable: `4165575` gave Peers, Leads and Reviewers `reopen_finding` | **DONE** `4d8f687` |

Kernel spec against code — all resolved:
- `handover` moves paths but never the writer, while KERNEL §6, I1, WORKFLOW and CONFORMANCE said it moves the writer.
  The code was right — a handover atomically moves the paths and so their writer (the writer of a scope's paths is
  its owner); moving a seat between scopes is `reseat`'s job. Spec wording fixed in `6b9df4bd`.
- KERNEL §3 said a gone actor's seat, obligations and mail stay; LEDGER §5 and the code empty the seat and move them
  to the heir. KERNEL.md wording fixed in `6b9df4bd` (I11: owed work must not die with the leaver).
- `reseat` was accepted on a held scope, against KERNEL §4.8. Code fixed in `90c2c9c5` — nothing new is seated in a
  held scope.
- I6 guarded only the root plan's goal and appetite (`scopes.ts`). Code fixed in `a023f7f3` — a plan's goal or
  appetite cites the Human at every level. (A brief's goal still asks no word, per the workflow row.)
- LEDGER named an `attend` `scope` argument and a `via` citation the code does not have; `attend` derives the scope
  from the watched actor and I6 citations use `cites` (`via` is per-line provenance). LEDGER fixed in `6b9df4bd`.
- `rpc.ts` documented `lanes.owes` as counting open attentions too; `human.ts` counted obligations only. An unacked
  attention does wait on its owner, so the doc was the better contract — `de461ecc`.
- `publish`'s missing `expectedSha`: fixed under server `9` (`82b1fb62`).

Unverified items from the same review — all confirmed and fixed:
- A Lead waiting on its checks was never woken when the result landed: `evidence_recorded` told the parent owner in
  a note that `asks: false`, so the dispatcher never delivered it to an idle Lead. `2cb1952a`: `evidence_requested`
  records who asked and `evidence_recorded` carries `wake` — the asker and any integrator with an open claim on the
  scope are woken; the parent owner still gets the plain note.
- `drop_scope` could land between `integration_started` and `record_integration`, writing "dropped" over a merge the
  branch physically holds. `41c19556` refuses it on `integrating`, as `integrate` and `hand_back` already did.
- If the root's owner hands back, the Human owed the claim with no way to settle it: `send_back` was not a Human
  command, `published` did not close it, and no view showed it. `11faa721`: the Human may `send_back` (the root's
  parent owner is the Human), `published` closes a live claim on the root, and the Human's view shows such claims
  with publish / send-back cards. The shipped SLP profile never grants `hand_back` to the root's role, so this is
  reachable only in a profile that does — the kernel's contract now holds for both.

### Server: `server/`, `bin/`, `package.json` (`server-review.md`, `readiness-review.md` blockers)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| a | Blocker? | The plugin finds its files through `config.plugins.seatworks.path` (`plugin.ts` ~174) | **NOT A BUG**, per `00fdaa7`, now verified against `@getpaseo/protocol` 0.10.1: `config.plugins` is a record of `{ source: "directory", path, enabled? }` — `directory` is the only source kind, so `path` is always present. Still confirm on a real install: the log must not say "no plugins.seatworks" |
| b | Blocker | The server imports types from `@getpaseo/client` and `@getpaseo/protocol`, which were devDependencies only, and the manifest builds with `npm ci --omit=dev` | **DONE** `00fdaa7` (both now dependencies at 0.10.1; `@getpaseo/plugin` is supplied by Paseo's worker) |
| c | Blocker | `PaseoHost.create` rethrows every error except the two idempotency refusals, so a profile with no model leaves a seat with no agent forever: the dispatcher gives up after 5 tries with only a log line | **DONE** `d4c6f45` (patch applied, finished, test failed first) |
| d | Blocker | After a daemon restart, `envFor`, `turnEnded`, `permissionAsked` and `archived` look the agent up before the plugin is ready (`plugin.ts` ~476-560). A resumed agent gets no git shim and no `SEATWORKS_*` environment, and early hooks are lost. No reconcile runs on start (PASEO.md rule 5) | **DONE** `2f2b769` + `dbd25d2` |
| e | Med | `process.execPath` is used as `node` for the MCP server and the shim (`plugin.ts:620`, `shim.ts:8`); if Paseo's worker runs under Electron this breaks | **DONE** `d9f4faee` — verified against Paseo's source: the desktop daemon runs its Electron binary with `ELECTRON_RUN_AS_NODE=1` and forks plugin workers on `process.execPath`, so a clean-env child gets the Electron binary. The shim launcher and the team tool server now set `ELECTRON_RUN_AS_NODE=1` themselves |
| 1 | High | `git.ts` treats `worktree` as a refs-only subcommand, so the repository's local config is not emptied first; `worktree add` checks files out and runs a smudge filter an agent could plant in `.git/config` | **DONE** `4055a6b` |
| 2 | High | `putBlock` checks the file's status without `--ignored`, so a Human's gitignored `AGENTS.md` is overwritten with the note and committed | **DONE** `fe656c7` |
| 3 | High | One failure at start (a transient error, or one project whose log no longer folds) disables every project until the plugin reloads; `dispose()` then throws and leaves the socket open | **DONE** `dbd25d2` + `2f2b769` |
| 4 | Med | `removeProject`: an agent archive that throws half way leaves a state where the next removal deletes the record meant to be kept; with the repository gone, the project stays loaded and keeps writing into the moved ledger; the project's machine hold is never cleared, which stalls checks in every other project | **DONE** `0f1050c` (+ `b9f716b`, a create-key collision found en route) |
| 5 | Med | An advance that succeeded before a crash comes back as "moved" on retry: the candidate is rebuilt, an empty merge commit made and the checks re-run | **DONE** `28a5d2f` |
| 6 | Med | Git shim bypasses: `git fetch . HEAD:<branch>`, `git branch -Df`, `git --attr-source HEAD checkout` | **DONE** `5d4a99a` |
| 7 | Med | A tool call retried after a dropped connection gets a new command id, so it is recorded twice | **DONE** `0835dd2` |
| 8 | Med | Nothing catches up on start or reconnect: a permission request or turn end that arrives early or while down is lost | **DONE** `2f2b769`, the same fix as `d` |
| 9 | Med | The `publish` effect has no `expectedSha`, so it pushes whatever the branch holds when it runs | **DONE** `82b1fb62`: the record tracks the base's head on the root (`workspace_ready`, `integrated`, `published`, `publish_refused`), `publish_requested` carries it, the workspace refuses when the tip moved and reports the tip it found, so asking again publishes the new head |

Also from `readiness-review.md` (gaps, not bugs):
- Only Claude and Pi have harness files.
- Copies are made with plain `git worktree`, so they have no `node_modules` or `.env`.
- The daemon's `PATH` may lack Homebrew.
- Claude's sandbox key differs from V1's.
- Landing on a checked-out base needs a clean tree.

### Client: `client/`, `index.client.tsx`, `install.sh` (`client-review.md`)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | High | The "needs you" pill never appeared on agents started after the app loaded (listing without `subscribe: {}`) | **DONE** `b7590d6` |
| 2 | High | The question card preselected the agent's recommendation even when it was not an option, so one press answered for the Human | **DONE** `aede238` |
| 3 | High | "Open a Seatworks team here" dropped errors and refusals, and attached a folder that is not a git repository | **DONE** `78a75f8` |
| 4 | Med | A failed RPC call renders a false empty state ("No project is attached yet", "This project has no Seatworks team") instead of an error | **DONE** `065b4d4` (patch applied and finished; typecheck/lint — the client has no Node test runner) |
| 5 | Med | Permission text is cut to 6 lines, so the end of a long command can be allowed unseen (`permission-card.tsx:45`) | **DONE** `767d7b9` (same caveat) |
| 6 | Med | The clean-up confirmation still says removing a project deletes its record; the server now keeps it as "Record kept" | **DONE** `68d0e96` (same caveat) |
| 7 | Med | Invalid stored Jev settings leave the Jev screen showing only an error, with no reset | **DONE** `fb75778` (same caveat) |
| 8 | Low | "Your words not yet carried in" shows message ids, not text | **DONE** `0218e24` (same caveat) |
| 9 | Low | `install.sh` silently ignores `--ref` and `--dir` when already installed | **DONE** `84efabd` (shell test against a stand-in `paseo` on PATH) |
| 10 | Low | The pill count lags up to 10 s after the Human answers | **DONE** `8d3607b` (typecheck/lint) |
| 11 | Low | Saving a Jev key gives no feedback, and the field keeps the key | **DONE** `aa0db2c` (same caveat) |

## Owner decisions, not bugs

- **Jev route.** `profile/slp/reflex.yaml` uses OpenRouter's `/api/v1/systemone`. `spec/REFLEX.md` says to keep V1's
  `/api/alpha/decisions` until `data_collection: deny` is shown to hold on the new route. This decides where the
  agents' words are sent.
- **Evidence on a lane's head.** A Lead cannot `run_checks` on its own lane: only a scope's writer or its parent's
  owner may. The profile now routes this through a Reviewer. Letting a scope's owner run checks is a kernel change the
  spec does not settle.
- **Install from `main`.** `install.sh` and the README install from `sting9k/seatworks` on `main`. Until this branch
  is merged, install with `sh install.sh --ref rebuild`.
- **`docs/images` and `docs/video`.** Everything there except the logos shows V1's design, and the README no longer
  links to it.

## Suggested order

1. Server `d`, `c`, `1`, `2`, `3`: a first real run is unsafe or fails without them.
2. Kernel `3`, then `4` to `7`.
3. Client `4` to `7`.
4. The lows and the spec mismatches.
5. The manual test plan in `readiness-review.md`, in a real Paseo, by the owner.
