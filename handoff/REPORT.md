# Handoff: open bugs from the 2026-09-29 review

Temporary folder for whoever fixes these next. Delete `handoff/` once every row below is closed.

Five read-only reviews ran on 2026-09-29 against the code as it was then, under `v3-redesign/`. That code now sits at
the repository root, so read every `v3-redesign/` path in the review files as the root. Three agents were then
started to fix the kernel, server and client findings. They were stopped part way:
- their finished commits are on this branch;
- their unfinished work is saved here as patches.

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
| `kernel-wip.patch`      | Unfinished fix for kernel #3 (delivery after a reseat). Apply with `git apply`             |
| `server-wip.patch`      | Unfinished fix for server boot #c (a failed create leaves an empty seat)                   |
| `client-wip.patch`      | Unfinished fix for client mediums (false empty states when a call fails)                   |

The profile review (prompts and skills against the kernel's rules) is already fixed in commit `4165575`. One item
remains open from it; see "Owner decisions" below.

## Status

Status values:
- **DONE**: committed, with a test that failed first.
- **WIP**: in a patch here, not verified. Apply it, finish it, and prove it.
- **OPEN**: not started.
- **NOT A BUG**: judged so by the fixing agent, with its reason.

### Kernel: `shared/kernel`, `shared/contracts`, `shared/views` (`kernel-review.md`)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | High | `amend_brief` wiped every section it did not name. zod 4 `.partial()` still applies `.default([])`, so a goal-only amendment emptied constraints, choices and context, and was refused under I6 when a Human line was among them | **DONE** `732c5cc` |
| 2 | High | A permission's obligation closed when its answerer (the Lead) left, so the Peer's pending permission was lost and the Human's answer was refused as unknown. When the asker itself left, nothing closed it | **DONE** `9e4f0c1` |
| 3 | High | Messages and attentions moved at a reseat never reach the new agent. `react` emits no `deliver` for `message_moved`, nor for attentions moved by `reseated`, so the only delivery still targets the released actor and is dropped. This breaks CONFORMANCE "a Peer reseated with three messages queued receives the three" | **WIP** `kernel-wip.patch`: `react.ts` adds `deliver` on `message_moved` and for the attentions `reseated` moves; `effects.ts`, LEDGER §effects, and new tests in `delivery.test.ts` and `workflow.test.ts`. Not run to green yet |
| 4 | Med | I4: a red gate on the candidate can be passed without a reason by citing only a passing verdict and leaving the failing check uncited | OPEN. Decide against KERNEL I4's wording: "any failing result on that commit" needs a reason, cited or not |
| 5 | Med | Dropping a Reviewer's scope prunes its verdict evidence, so `integrate` citing it is then refused ("unknown evidence"), which is not an invariant | OPEN. `prune.ts`: keep evidence while its subject scope is open, or while anything may still cite it |
| 6 | Med | `after` is recorded but nothing makes a scope wait: overlapping siblings get agents at once and write the same paths | OPEN. Check WORKFLOW and KERNEL for what `after` promises, then either seat the agent only when every `after` sibling is integrated or dropped, or change the spec |
| 7 | Med | An attention about the root's actor goes to the Human, but no view shows it and the Human cannot acknowledge it, so it stays open forever | OPEN. Show it in `human.ts` and let the surface acknowledge it, or route it elsewhere per STEERING |
| 8 | Low | `drop_scope` closes the same obligation once per doomed scope (`scopes.ts:268-271`) | OPEN. Run that loop once |
| 9 | Low | `reviewsThatChanged` never counts a verdict: verdicts are keyed to the reading scope, send-backs to the reviewed one (`record.ts:118-126`) | OPEN. Match on the subject commit |
| 10 | Low | Citing the copy of a direction (`copyOf`) does not close it, in amend `via` or `answer` (`decider.ts:67`, `talk.ts`) | OPEN. Resolve `copyOf` |
| 11 | Low | `activity.ts:219` hard-codes "the Supervisor", a role name in `shared/`, and is wrong when an attention climbs from a vacant seat | OPEN |
| 12 | Low | A Peer cannot raise a finding while its Lead's seat is empty (`findings.ts:37-38`), which is not an invariant | OPEN. Route it to the next seated owner up |
| 13 | Low | `chainOf` and `mapText` keep the old verdict after `finding_reopened` (`record.ts:48`, `docs.ts`). Now reachable: `4165575` gave Peers, Leads and Reviewers `reopen_finding` | OPEN |

Kernel spec against code (fix the code or the spec, in the same commit):
- `handover` moves paths but never the writer, while KERNEL §6, I1, WORKFLOW and CONFORMANCE say it moves the writer,
  and `invariants.test.ts:7` asserts the opposite.
- KERNEL §3 says a gone actor's seat, obligations and mail stay; LEDGER §5 and the code empty the seat and move them.
- `reseat` is accepted on a held scope, while KERNEL §4.8 says nothing new is seated in one.
- I6 guards only the root plan's goal and appetite (`scopes.ts:160`), while CONFORMANCE's I6 row expects a lane's goal
  amended with no answer to be refused.
- LEDGER names differ from the code: `publish` has no `expectedSha`; `via` vs `cites`; `attend` has a `scope` argument
  in LEDGER only.
- `rpc.ts` says `lanes.owes` counts attentions; `human.ts` counts obligations only.

Unverified from the same review:
- A Lead waiting on its checks may never be woken when the result lands (`react.ts:120-126`).
- `drop_scope` can land between `integration_started` and `record_integration`.
- If the root's owner hands back, the Human owes the claim.

### Server: `server/`, `bin/`, `package.json` (`server-review.md`, `readiness-review.md` blockers)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| a | Blocker? | The plugin finds its files through `config.plugins.seatworks.path` (`plugin.ts` ~174) | **NOT A BUG**, per `00fdaa7`: Paseo records a Git install as a directory source at its checkout, and `import.meta` is empty in the bundle, so the config stays the way. Still confirm on a real install: the log must not say "no plugins.seatworks" |
| b | Blocker | The server imports types from `@getpaseo/client` and `@getpaseo/protocol`, which were devDependencies only, and the manifest builds with `npm ci --omit=dev` | **DONE** `00fdaa7` (both now dependencies at 0.10.1; `@getpaseo/plugin` is supplied by Paseo's worker) |
| c | Blocker | `PaseoHost.create` rethrows every error except the two idempotency refusals, so a profile with no model leaves a seat with no agent forever: the dispatcher gives up after 5 tries with only a log line | **WIP** `server-wip.patch`: create catches, looks for the agent by its labels, and returns `{failed}` when none was made; the fake Paseo gets a `refuse` gate, with a lane test, a CONFORMANCE row and a PASEO.md note. Not run to green yet |
| d | Blocker | After a daemon restart, `envFor`, `turnEnded`, `permissionAsked` and `archived` look the agent up before the plugin is ready (`plugin.ts` ~476-560). A resumed agent gets no git shim and no `SEATWORKS_*` environment, and early hooks are lost. No reconcile runs on start (PASEO.md rule 5) | OPEN. Await readiness, bounded under the 30 s hook timeout; add the reconcile |
| e | Med | `process.execPath` is used as `node` for the MCP server and the shim (`plugin.ts:620`, `shim.ts:8`); if Paseo's worker runs under Electron this breaks | OPEN. Verify against Paseo's worker first |
| 1 | High | `git.ts` treats `worktree` as a refs-only subcommand, so the repository's local config is not emptied first; `worktree add` checks files out and runs a smudge filter an agent could plant in `.git/config` | OPEN. Take `worktree` off that list |
| 2 | High | `putBlock` checks the file's status without `--ignored`, so a Human's gitignored `AGENTS.md` is overwritten with the note and committed | OPEN |
| 3 | High | One failure at start (a transient error, or one project whose log no longer folds) disables every project until the plugin reloads; `dispose()` then throws and leaves the socket open | OPEN. Isolate per project; make `dispose` safe |
| 4 | Med | `removeProject`: an agent archive that throws half way leaves a state where the next removal deletes the record meant to be kept; with the repository gone, the project stays loaded and keeps writing into the moved ledger; the project's machine hold is never cleared, which stalls checks in every other project | OPEN |
| 5 | Med | An advance that succeeded before a crash comes back as "moved" on retry: the candidate is rebuilt, an empty merge commit made and the checks re-run | OPEN |
| 6 | Med | Git shim bypasses: `git fetch . HEAD:<branch>`, `git branch -Df`, `git --attr-source HEAD checkout` | OPEN |
| 7 | Med | A tool call retried after a dropped connection gets a new command id, so it is recorded twice | OPEN |
| 8 | Med | Nothing catches up on start or reconnect: a permission request or turn end that arrives early or while down is lost | OPEN; the same fix as `d` |
| 9 | Med | The `publish` effect has no `expectedSha`, so it pushes whatever the branch holds when it runs | OPEN |

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
| 4 | Med | A failed RPC call renders a false empty state ("No project is attached yet", "This project has no Seatworks team") instead of an error | **WIP** `client-wip.patch`: `client/state/problem-text.ts` plus a "Seatworks did not answer" state with "Try again" in home, the project view, the team panel, the plugin page and the surface. Not typechecked yet |
| 5 | Med | Permission text is cut to 6 lines, so the end of a long command can be allowed unseen (`permission-card.tsx:45`) | OPEN. Show it whole, or expandable |
| 6 | Med | The clean-up confirmation still says removing a project deletes its record; the server now keeps it as "Record kept" | OPEN (`plugin-page.tsx`) |
| 7 | Med | Invalid stored Jev settings leave the Jev screen showing only an error, with no reset | OPEN (`jev-settings.tsx`) |
| 8 | Low | "Your words not yet carried in" shows message ids, not text | OPEN |
| 9 | Low | `install.sh` silently ignores `--ref` and `--dir` when already installed | OPEN |
| 10 | Low | The pill count lags up to 10 s after the Human answers | OPEN |
| 11 | Low | Saving a Jev key gives no feedback, and the field keeps the key | OPEN |

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
