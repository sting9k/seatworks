# Conformance

What an implementation proves before it counts as Seatworks. Each row is a case at the boundary an agent or the Human uses:
commands called as a tool is called, facts fed as a satellite returns them, the log read back. Each is shown to fail
on an implementation without the rule before it is trusted.

## Invariants

| Case | Setup                                                                  | Expect                                                    |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| I1   | A scope with a writer; a second actor tries to take it without handover | Refused                                                   |
| I1   | `handover` of the writer to another child                               | One event; no state in which both are writers             |
| I2   | A Lead's child holds `src/net/`; the Lead's own seat tries to write there | Refused                                                 |
| I3   | Two open siblings both hold `src/net/`, neither `after` the other       | Refused; accepted once one waits for the other            |
| I3   | A scope opened `after` an open sibling                                  | No copy and no agent until that sibling is integrated or dropped |
| I3   | A waits for B, then B is set to wait for A                              | Refused                                                   |
| I4   | `integrate` citing evidence on an older commit                          | Refused                                                   |
| I4   | `integrate` over a failing check, with a reason                         | Accepted, the reason on the record                        |
| I4   | `integrate` over a failing check, no reason                             | Refused                                                   |
| I4   | `integrate` citing a pass, a failing check on the same commit uncited, no reason | Refused                                          |
| I4   | `integrate` citing a verdict on an older commit                         | Refused                                                   |
| I4   | `integrate` citing a verdict whose reading scope was dropped            | Accepted                                                  |
| I5   | A Peer amends its own brief                                             | Refused                                                   |
| I5   | A Reviewer tries to write in its copy's paths through the kernel        | Refused: a reading scope has no paths                     |
| I6   | The Lead amends the goal with no answer from the Human                  | Refused; accepted citing the answer                       |
| I6   | A line marked the Human's with no message or answer from them behind it | Written as its caller's                                   |
| I6   | A term the Human settled is settled again without their word | Refused; accepted citing it                             |
| I7   | The Supervisor sends a Peer a message that directs                      | The Lead has a copy and an obligation; it closes on carried or declined |
| I7   | The Supervisor asks a Peer an open question                             | The Lead has a copy and no obligation                     |
| I7   | The Human types into a Peer's chat                                      | The Lead has a copy and an obligation; the Human sees whether it was carried in |
| I8   | `classify_finding` as `changes` with no change events                   | Refused                                                   |
| I8   | `classify_finding` as `alternative` with no reason                      | Refused                                                   |
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
| A Peer's permission open when its Lead is reseated or released | Owed by the new Lead, or by whoever released it, who answers it; the Peer still waits |
| A permission whose asker leaves its seat                     | Closed: nothing is owed to it                  |
| A permission answered in the agent's own prompt in Paseo     | Settled on the record: nothing owed, its answerer told, no second answer sent to Paseo |
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
| The Lead amends only a brief's goal, beside a constraint that is the Human's              | A new version; every section it did not name as it was, and no word from the Human asked |
| Reseat a Peer mid-task                                                                  | Same scope and copy; its obligations with the new actor    |
| A tool call whose arguments name another agent as caller                                | Recorded as the agent whose key made the call              |
| A Peer's turn fails on the host's error                                                 | A fact to its Lead; the seat, its obligations and mail stay |
| Three turns an agent reports at $1, $3, then $0.50 after its session restarted          | It spent $3.50; its lane and the root the same             |
| The Human types into a Lead's chat, and two turns end, each hook carrying the whole history | Its Supervisor has one copy                          |
| A hand-back in a project with checks set                                                | Those checks run on its commit, as evidence                |
| The Lead runs its own acceptance test on a Peer's commit with `run_checks`              | Evidence on that commit, by the Lead                       |
| The Human reseats the Supervisor                                                        | Accepted: the Human stands as the root's parent            |
| `publish` when the remote moved since the landing                                       | Refused by the workspace; nothing forced                   |

## Delivery

| Case                                                        | Expect                                         |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Three messages while the reader is mid-turn                 | One message after the turn, numbered, in order |
| The same message key posted twice                           | Delivered once                                 |
| Five Peers send to their Lead during its turn               | One numbered delivery when the turn ends, in the order sent |
| Only a copy and a fact are queued for an idle Lead          | The Lead is not woken; they go with the next delivery that asks |
| A delivery refused as busy                                  | Sent again at the next turn's end, once                  |
| A Peer reseated with three messages queued                  | The new Peer receives the three                          |
| A batch longer than one message allows                      | Several deliveries in a row; nothing cut                 |
| Restart with messages queued                                | All delivered after                            |

## Recovery

| Case                                                               | Expect                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Restart with open obligations, a pending evidence run, a held machine | Obligations open, the run asked again once, the hold kept |
| Every snapshot deleted, then restart                               | The same state from the log                     |
| A crash after commit, before an effect is dispatched               | The effect is dispatched once on restart        |
| A crash after a branch advanced, before the integration was recorded | Integrated on restart; no candidate made again  |
| A satellite's fact delivered twice                                 | Recorded once                                   |
| A tool call retried with the same command id                       | The earlier result; nothing appended            |
| A satellite throws on an effect                                    | Tried again after a pause, with no change to wake it |
| An agent's create loses its reply and is tried after the record moved on | The seat keeps the one agent made; a key Paseo cannot finish is its owner's fact |
| Two projects on one daemon start their first agents                | Each is made: the create's key names its project |
| A create Paseo refuses, such as a profile with no model            | The seat is gone with Paseo's reason, which its owner hears |
| An agent reopened after a daemon restart                           | Its whole seat's environment again, the git shim first on its PATH |
| The plugin's start fails once, then is asked again                 | It starts                                       |
| One project's log cannot be read at start                          | Every other project opens and works             |
| A permission asked while the plugin was down, then its hook too    | On the record once the plugin starts, and once only |
| The same log folded by the daemon and by the surface               | The same state                                  |

## Harness

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| A Pi agent is seated                                        | Seatworks' home, with the Human's login linked; the extension gives it the team's tools |

## Workspace and evidence

| Case                                                        | Expect                                   |
| ----------------------------------------------------------- | ---------------------------------------- |
| A key with `/` and spaces                                   | Sanitized, with a hash suffix            |
| An agent runs git in another agent's copy                   | Refused                                  |
| A merge with conflicts                                      | Undone; the conflicting paths reported   |
| A hook or a smudge filter planted in the repository's own config, then a copy made | Neither runs          |
| The copy moves while a check runs                           | The run fails                            |
| An evidence run asked while the machine is held             | Starts when the hold is released         |
| Another project on the machine asks for an evidence run during a hold | Deferred the same way          |

## Installing and upkeep

| Case                                                                              | Expect                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Paseo lists a git project no team is attached to                                  | Offered to attach; once attached, no longer offered                 |
| A task is dropped with a commit on its branch and a draft in its copy             | Its copy listed and not removable; its branch listed, not merged     |
| A project is attached                                                             | `AGENTS.md` on its base carries the note after the project's own rules, in a commit of that file alone; what the Human staged stays staged |
| The Human removes a project while a copy holds uncommitted work                   | Refused, naming the copy; nothing touched, its agents still at work |
| The Human removes a project while editing its `AGENTS.md`                         | Refused, naming the file; the edit kept                             |
| A project is attached while the Human keeps an `AGENTS.md` of their own ignored     | Refused, naming the file; their file kept, nothing committed        |
| The root's plan settles a word, and later another                                 | `GLOSSARY.md` on the base holds both between the plugin's markers; a word written by hand below them stays |
| A lane lands after its Lead reported                                              | `docs/seatworks/MAP.md` on the base lists it, with what was decided and assumed; the checkout stays clean |
| An agent is seated                                                                | Its first words point at the glossary, the ADRs and the map         |
| A removal that stops part way, such as an archive that throws                     | The project stays attached, its note back; its agents archived meanwhile recorded gone |
| The Human removes a project whose repository is gone, while one of its agents holds the machine | It leaves memory, and every other project's work that waited starts |
| The Human removes a project                                                       | Its agents archived, every branch made for it and its note gone, its record kept aside; offered to attach again |
| Paseo's check says a newer release is out                                         | Shown with its review links and the command that applies it; nothing installed |
| Paseo's command line is not on the daemon's PATH                                  | Said, with the command to run by hand                               |
| `install.sh --ref` or `--dir` once Seatworks is installed                         | Says the option was not used, and how to install from elsewhere      |

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
| Each event in REFLEX.md's table                             | Its questions asked, and no other's                        |
| A brief given one kind, read as the other                   | Weighed on the other kind, not on the first label          |
| A turn ends in words with no command                        | Its last words asked whether they hand back, ask or wait   |
| A hand-back                                                 | Its diff asked hunk by hunk: test hunks and product hunks their own questions |

## Watch

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| A Peer's thinking says it drops its approach, p past `tell` | One attention to its Lead; nothing to the Peer             |
| The same, p between `consider` and `tell`                   | A candidate to the Watcher, and an obligation on it        |
| A restart with a candidate neither attended nor passed      | Given to the Watcher again                                 |
| Jev's host unreachable                                      | Facts and sweeps reach the Watcher; nothing else changes   |
| No Watcher role                                             | Only `tell` answers, code moments and alarms reach the owners |
| Three moments on one Peer in one turn                       | One numbered message to its Lead, after the Lead's turn    |
| The Lead marks a moment noise for its Peer                  | That moment is not told again for that Peer and scope      |
| A red test calls `addPoints`, which the brief names          | Nothing is asked                                           |
| A test sets `user.points`; neither brief, plan, base nor the Peer's code has it | The reflex asks; past `tell`, an attention |
| A test builds a fake user carrying `points`                 | The same, through the second question                      |
| The Peer wrote `points` in its code first, then the test    | Nothing is asked                                           |
| No new work since the last sweep, however long              | The Watcher is not woken                                   |
| `sweep.everyChars` of new work across its agents            | One sweep: a note that wakes it, each agent's newest items within `digestChars` |
| A profile with no moments                                   | No watch; every other case the same                        |

## Steering

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| An attention about a Peer                                   | To its Lead, not the Supervisor                            |
| An attention about a Lead, or one that crosses lanes        | To the Supervisor                                          |
| The Lead neither acts on nor acknowledges one by the end of its next turn, and it still holds | Climbs to the Supervisor, with the Lead's silence beside it |
| The Lead acknowledges it                                    | It climbs no further                                       |
| The same call fails the same way three times                | A candidate for the Watcher, with no model asked           |
| And five times                                              | An attention to the Lead, now                              |
| A Peer's own turn after an attention about it               | Nothing about the attention reaches the Peer               |
| The Lead messages the Peer after an attention, saying nothing of it | Acted on: it climbs no further                     |
| An attention to the Supervisor left past its next turn      | Climbs no further; shown in the Human's view until they acknowledge it or mark it noise |
| An attention about the root's own agent                     | To the Human, shown in their view, settled by them         |
| A lane's spend passes the amount its appetite names         | An attention to the Supervisor, now, with no model asked   |
| A Peer's turns spend and record nothing, `silentTurns` in a row | An attention to its Lead, once                        |
| A finding still unclassified when its Lead's second turn since it ends | An attention to the Supervisor, once           |
| A Peer changes an existing assertion where its brief asks nothing of tests | An attention to its Lead; another test line, a candidate |

