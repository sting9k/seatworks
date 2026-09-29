# Conformance

What an implementation proves before it counts as v3. Each row is a case at the boundary an agent or the Human uses:
commands called as a tool is called, facts fed as a satellite returns them, the log read back. Each is shown to fail
on an implementation without the rule before it is trusted.

## Invariants

| Case | Setup                                                                  | Expect                                                    |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| I1   | A scope with a writer; a second actor tries to take it without handover | Refused                                                   |
| I1   | `handover` of the writer to another child                               | One event; no state in which both are writers             |
| I2   | A Lead's child holds `src/net/`; the Lead's own seat tries to write there | Refused                                                 |
| I3   | Two open siblings both hold `src/net/`, neither `after` the other       | Refused; accepted once one waits for the other            |
| I4   | `integrate` citing evidence on an older commit                          | Refused                                                   |
| I4   | `integrate` over a failing check, with a reason                         | Accepted, the reason on the record                        |
| I4   | `integrate` over a failing check, no reason                             | Refused                                                   |
| I5   | A Peer amends its own brief                                             | Refused                                                   |
| I6   | The Lead amends the goal with no answer from the Human                  | Refused; accepted citing the answer                       |
| I6   | A line marked the Human's with no message or answer from them behind it | Written as its caller's                                   |
| I7   | The Supervisor sends a Peer a message that directs                      | The Lead has a copy and an obligation; it closes on carried or declined |
| I7   | The Supervisor asks a Peer an open question                             | The Lead has a copy and no obligation                     |
| I7   | The Human types into a Peer's chat                                      | The Lead has a copy and an obligation; the Human sees whether it was carried in |
| I8   | `classify_finding` as `changes` with no change events                   | Refused                                                   |
| I8   | `classify_finding` as `alternative` with no reason                      | Refused                                                   |
| I4   | `integrate` citing a verdict on an older commit                         | Refused                                                   |
| I5   | A Reviewer tries to write in its copy's paths through the kernel        | Refused: a reading scope has no paths                     |
| I10  | A Lead calls `ask_human` in the SLP profile                             | Refused                                                   |
| I10  | A Peer messages another Peer in the SLP profile                         | Refused; accepted in a profile that gives Peers `children` or a Peer edge |
| I11  | A message asking for an answer; its reader is gone                      | The obligation moves to whoever is reseated; never closed by time |
| I12  | An observation past its threshold on a finding                          | A note to the relation named; the finding, its obligation and every line unchanged |
| I12  | A reflex question whose `tells` would classify, integrate or answer     | The profile is refused when loaded                        |

## The kernel adds nothing

| Case                                                         | Expect                                         |
| ------------------------------------------------------------ | ---------------------------------------------- |
| A hundred findings to one Lead                               | All accepted; none merged, ranked or capped    |
| A scope integrated with no reading scope ever opened         | Accepted                                       |
| A verdict of changes on a commit                             | Recorded as evidence; nothing held or sent back by it |
| A permission asked by a Peer                                 | Answerable by its Lead or the Human, not by another Peer |
| A plan amended ten times                                     | Accepted, each with its reason                 |
| A red check with a reason                                    | Integrated; the kernel never overrules the integrator |

## The profile is data

| Case                                                                       | Expect                        |
| -------------------------------------------------------------------------- | ----------------------------- |
| The whole suite run on the SLP profile with every role renamed             | Same results                  |
| A search of the kernel and satellites for any role name in the profile     | None found                    |
| A profile with no `humanDoor` role                                         | Loads; `ask_human` is shown to no one |

## Workflow

| Case                                                                                    | Expect                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Intake → open → plan → work → accept → integrate → land, no finding                     | Every step on the record; each line with its origin        |
| A finding mid-work, classified `changes`, brief amended, work integrated                 | The chain of change shows all six checkpoints              |
| A finding touching the goal                                                             | Waits on a question; the raiser's default goes on; carried after the answer |
| A small change: the Supervisor seats a Peer under the root and integrates it             | Works with no Lead                                         |
| Reseat a Peer mid-task                                                                  | Same scope and copy; its obligations with the new actor    |

## Delivery

| Case                                                        | Expect                                         |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Three messages while the reader is mid-turn                 | One message after the turn, numbered, in order |
| The same message key posted twice                           | Delivered once                                 |
| Restart with messages queued                                | All delivered after                            |

## Recovery

| Case                                                               | Expect                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Restart with open obligations, a pending evidence run, a held machine | Obligations open, the run asked again once, the hold kept |
| Every snapshot deleted, then restart                               | The same state from the log                     |

## Workspace and evidence

| Case                                                        | Expect                                   |
| ----------------------------------------------------------- | ---------------------------------------- |
| A key with `/` and spaces                                   | Sanitized, with a hash suffix            |
| An agent runs git in another agent's copy                   | Refused                                  |
| A merge with conflicts                                      | Undone; the conflicting paths reported   |
| The copy moves while a check runs                           | The run fails                            |
| An evidence run asked while the machine is held             | Starts when the hold is released         |
| Another project on the machine asks for an evidence run during a hold | Deferred the same way          |

## Reflex

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| No key set, or the key refused                              | Agents are seated and commands run; a standing alarm to the Human |
| The reflex's host is down during a hand-back                | The command succeeds; the evidence step says `not run`     |
| A state past the budget                                     | Not cut to fit; the step says `too large`                  |
| An answer with one question missing                         | The call fails; nothing is recorded as answered            |
| 400 `max_tokens_exceeded`                                   | Not retried; recorded `too large`                          |
| 401 from Jev's host                                         | Not retried; an alarm to the Human; nothing else stops     |
| 429 with a wait named                                       | Asked once more after that wait, then unread               |
| Twenty questions reading the same fields of one item        | One call                                                   |
| A question past `tell` whose wording changed since its look back | A candidate for the Watcher, not an attention          |
| A question whose answers sit between 0.3 and 0.6 on every subject | Marked weak at the look back                         |
| An edit breaks a compiled project rule                      | A fact to the writer quoting the rule and its line         |
| A check fails with a known missing-dependency message       | An environment fact, with no reflex call                   |
| An instruction file changes                                 | The Supervisor is told to compile the rules again          |
| A question renamed in `reflex.yaml`                         | Asked under its new name with no code change               |

## Watch

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| A Peer's thinking says it drops its approach, p past `tell` | One attention to the Supervisor; nothing to the Peer       |
| The same, p between `consider` and `tell`                   | A candidate to the Watcher, and an obligation on it        |
| A restart with a candidate neither attended nor passed      | Given to the Watcher again                                 |
| Jev's host unreachable                                      | Facts and sweeps reach the Watcher; nothing else changes   |
| No Watcher role                                             | Only `tell` answers and alarms reach the Supervisor        |
| Three moments on one Peer in one turn                       | One numbered message to the Supervisor, after its turn     |
| The Supervisor marks a moment noise for a Peer              | That moment is not told again for that Peer and scope      |
| A red test calls `addPoints`, which the brief names          | Nothing is asked                                           |
| A test sets `user.points`; neither brief, plan, base nor the Peer's code has it | The reflex asks; past `tell`, an attention |
| A test builds a fake user carrying `points`                 | The same, through the second question                      |
| The Peer wrote `points` in its code first, then the test    | Nothing is asked                                           |
| The Watcher's period passes with no new work                | The Watcher is not woken                                   |
| A blind scope's actor reads its sibling's branch            | Refused until the Lead integrates or drops the sibling     |
| A profile with no moments                                   | No watch; every other case the same                        |
