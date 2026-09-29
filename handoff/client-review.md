<!-- Review report as written on 2026-09-29, before the repository moved: read every `v3-redesign/` path as the repository root. -->

## Client review of v3-redesign: 3 high, 4 medium, 4 low findings

`npm run check` passes: exit 0, 91/91 tests. shellcheck is not installed, so I ran `at_least` under dash instead. To check against the real Paseo, I read the published `@getpaseo/cli`, `@getpaseo/server` and `@getpaseo/plugin` 0.10.1 packages from npm (the server package includes the app's web bundle), unpacked under the scratchpad. I edited nothing.

### High

**1. The "needs you" pill never learns about agents created after the client loads.** `client/pill/waiting.tsx:101-112`
- **Defect:** `client.paseo.agents.subscribe` never fires. In `@getpaseo/client`'s `createPaseoApi`, its listeners are fed only by `agents.list({ subscribe: {} })`. This code calls `list` without `subscribe`. The host gives each plugin its own `createPaseoApi(...)`, and the daemon sends `agent_update` only to a subscription (`session.js` `handleFetchAgents`: "No unsolicited agent list hydration").
- **Failure:** the Human attaches a project and its Supervisor, Leads and Peers start. None of their chats ever get the pill until the app or plugin reloads. Archived agents' pills are never removed either.
- **Fix:** call `client.paseo.agents.list({ filter: { includeArchived: false }, subscribe: {} })`, keep the returned `subscription`, and release it in cleanup.

**2. An empty "Answer" records the agent's recommendation as the Human's answer.** `client/decide/question-card.tsx:26`
- **Defect:** `choice` starts as `question.recommend` even when that value is not among `options`. `askHuman` (`shared/kernel/decide/findings.ts:117-138`) never checks it.
- **Failure:** a question with `options: []` and `recommend: "X"` shows no radios, an empty "Your answer" box and an enabled Answer button. One press sends `"X"` as the Human's answer, which then counts in `humanWords` as citable Human words (`evolve.ts:196`). The same happens when `recommend` is not one of the options: nothing looks selected, but it is sent.
- **Fix:** start from `recommend` only when `question.options.includes(recommend)`, otherwise `options[0] ?? ""`.

**3. The "Open a Seatworks team here" command swallows both errors and refusals.** `index.client.tsx:28-32`
- **Defect:** `onSelect` wraps the call in `void` and has no catch. The host does `try { await w.onSelect(...) } catch (n) { s.reportError(n) }` (web bundle), so returning `undefined` skips its error report. `ok: false` is ignored too.
- **Failure:** running it on an already-attached project gets the refusal "the project is open already", or a thrown RPC error. Either way the Human lands on the Seatworks home page with no message; a throw also becomes an unhandled rejection.
  - The item appears in every workspace, including `projectKind` `non_git` and `directory`.
  - `Plugin.openProject` writes `project.json` before any check (`server/bridge/plugin.ts:214-216`). A plain folder, or a refused attach from the Surface, therefore shows as "attached" from then on.
- **Fix:** return the promise, toast `r.text` when `!r.ok`, and skip workspaces whose `projectKind !== "git"`.

### Medium

**4. Failed RPCs show up as false empty states.**
- **Where:** `client/surface/surface.tsx:30,79-87`; `client/surface/plugin-page.tsx:42-61,86`; `client/panel/team-panel.tsx:26`; `client/pill/waiting.tsx:28`.
- **Defect:** `refresh`, `attach`, `scan`, `remove` and `check` have no catch.
- **Failure:** while the plugin reloads (the host rejects pending RPCs), the Human sees:
  - Home: "No project is attached yet" and "Every git project Paseo has is attached".
  - The Team panel: "This project has no Seatworks team" (its rejection handler sets the project to `null`).
  - The pill popover: "Reading what waits on you." forever.
  - Clean up: a failed `clean` leaves the button in its confirm state and never rescans.
- **Fix:** catch each call and put the message in an error state or a toast.

**5. A permission's text is cut to 6 lines on the card where the Human allows it.** `client/decide/permission-card.tsx:45`
- The server builds the text from the tool input, up to 2000 characters (`index.server.ts`, `permission_requested`).
- **Failure:** a long Bash command whose dangerous tail falls past line 6 can be allowed without being seen.
- **Fix:** drop `numberOfLines`, or add a "show all" toggle.

**6. The Clean up confirmation says a project's record is removed, but the server keeps it.**
- **Where:** `client/surface/plugin-page.tsx:150`, and `README.md:110` ("deletes its copies, branches and record").
- `removeProject` moves the record to the archive and says "its record is kept in … until you delete it".
- **Fix:** reword both to say the record is kept until the Human deletes it separately.

**7. JevSettings has no way out of an invalid settings state.** `client/jev-settings.tsx:22`
- Any status other than `ready`, including `invalid`, renders only the error text.
- **Failure:** stored settings that fail the schema leave the Human stuck with no route or key. The server applies settings only when they are `ready`, so the reflex stays keyless.
- **Fix:** when the status is `invalid`, show a `SettingsAction` that calls `settings.reset()`.

### Low

**8. "Your words not yet carried in" shows message ids instead of the words.** `client/surface/project-page.tsx:115`
- `humanView` puts `o.about.id` into `message`, so the rows read like "m7 · owed by a2".
- Actor ids ("a3 asks", lane owner) are also shown raw.
- **Fix:** carry the message text in `directions`.

**9. `install.sh` ignores `--ref` and `--dir` when the plugin is already installed.** `install.sh:67-72`
- It exits after the "already installed" check, so `sh install.sh --dir ~/checkout` over a Git install silently does nothing.
- **Fix:** when either flag is given, say it was ignored and point to `paseo plugin update --ref` or `remove`.

**10. The pill's count lags after the Human answers.**
- After answering in the popover, the label stays "1 needs you" for up to 10 s, until the next `poll`.
- **Fix:** trigger a `poll()` from `onAnswered`.

**11. JevSettings gives no sign a key was saved.**
- The input is uncontrolled, so after saving the typed key stays in the field and Save stays enabled, with no confirmation.
- Also, the docstring "never read back" does not hold: `settings.values.key` reaches the client.

### Checked and correct
- **Manifest:** it matches `PluginManifestSchema` (strict) in `@getpaseo/server` 0.10.1.
  - The `requirements.paseo` value `>=0.10.0` is sound: `@getpaseo/plugin` and `@getpaseo/client` 0.10.0 have identical `dist` to 0.10.1.
  - `@getpaseo/plugin` and `zod` are host externals, so `npm ci --omit=dev` is fine.
- **Client entry:** returns a function, as the host requires.
- **Client modules:** every one it imports is on the host's allow-list.
- **Icons:** all are Lucide names the host resolves.
- **Pill id:** `"waiting"` is unique per agent in the host's button store.
- **RPC shapes:** each client call matches its `server.handle` output, including the `human` command bodies against `parseBody`.
- **Hooks:** none are called conditionally, and list keys are stable.
- **install.sh:**
  - `paseo --version` prints a bare version, and `at_least` gave the right answers under dash.
  - `paseo plugin ls <id>` exits non-zero when the plugin is not configured.
  - `owner/repo:path` resolves to GitHub, and `ls --json` returns an array with `path`.

### Unverified
- Whether the popover `Content` renders inside the plugin's RPC provider (V1 relied on it too).
- Whether plugin RPCs time out before the update check's 120 s `execFile` timeout.
- Whether `sort -C` works on older macOS and BusyBox.
- Whether `paseo --version` (the CLI) can differ from the running daemon's version.
- What `open_project` goes on to do for a non-git directory once `project.json` is written.

Scratch files are under `/tmp/claude-0/-home-user-seatworks/2bc2844f-0fa7-5902-ae3d-27b6ae3079de/scratchpad/review-client/`.