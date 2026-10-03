---
name: security-check
description: "Use this skill when a task or a change touches input from outside, auth, secrets, file paths, data exposure or outbound calls. It holds how to check for the harm untrusted input or a careless caller could cause, with a failing test per abuse case. Not for infrastructure or dependency audits nobody asked for."
---

# Security check

Look for ways the change lets untrusted input or a careless caller do harm, and turn each abuse case into a test. The
scope is the change and the paths it touches: a check that roams finds noise, and noise buries the one real case.
Nothing found is a real answer, said as such.

## What to check

1. **Where outside data enters.** Requests, model output, queue messages, third-party responses, rows another tenant
   wrote. Trust follows who wrote a value, not the channel it came through. For each: where it enters (`path:line`)
   and where it is validated, or "not validated".
2. **Where it is used.** Follow each input to its sink and hold the sink to the framework's safe form. Two are easy to
   get half right: a file path must resolve, symlinks included, under an allowed root, and a delete or overwrite must
   target something below that root, never the root itself; a URL the server fetches needs a scheme and host
   allowlist its redirects cannot escape.
3. **Who may do it.** For each operation added or changed: who may, where that is checked, and whether the check is
   this caller on this object, not only a signed-in caller. Look for lookups by id with no ownership check, and checks
   that live only in the UI.
4. **Secrets.** Credentials come from the environment or a secret store, stay out of logs and errors, and are
   compared in constant time. A real secret already committed is raised at once: rotating it is not your decision,
   and deleting the line does not take it back.
5. **Edge values.** For each new parameter, option or flag, say what 0, negative, empty, missing, the maximum and a
   very long value mean: `timeout=0` may mean never or at once, an empty allowlist may allow everything. The default
   is the safe one, a parse error denies, no two settings combine into a bypass, and no caller can ignore a failed
   check.
6. **Failure.** A failed check denies. What a caller sees on error carries no stack trace, internal path, query,
   secret or other user's data.

## Each case as a test

An abuse case the change reaches becomes a failing test at its seam, with `test-first`: "another user's record
returns 403", "`../../etc/passwd` is rejected". See it fail, then fix at the source.

## Ends in

- **Working a task.** Each fix is a commit, and each abuse case a behaviour in your `hand_back` with its test as the
  proof. A decision that is not yours (the auth model, accepting a risk, rotating a secret, a CORS or rate-limit
  policy) is a `raise_finding` with the consequence of each option and your default; go on with what it does not
  touch.
- **Reading a change.** Each case is an entry in your verdict, its test described rather than written:

```text
Where        src/files/serve.ts:31
Failure      the `name` query parameter reaches `readFile` joined to the upload root, unresolved: `../../.env` is served
Reproduced   by running it: a request in the scratch copy returned the file
Fix          resolve the path and refuse anything outside the root
Proof        a request for `../../.env` gets 400, and the root's own files still serve
```
