# Conformance

What an implementation proves before it counts as Seatworks. Each row is a case at the boundary an agent or the Human uses:
commands called as a tool is called, facts fed as a satellite returns them, the log read back. Each is shown to fail
on an implementation without the rule before it is trusted.

## Invariants

| Case | Setup                                                                  | Expect                                                    |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| I1   | A scope with a writer; a second actor tries to take it without handover | Refused                                                   |
| I1   | `handover` moves paths to a sibling                                     | One event; the moved paths' writer changes with them, never two at once |
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
| I7   | The Lead cites, or answers, the copy of a direction it was given        | The direction's obligation closes                         |
| I7   | The Supervisor asks a Peer an open question                             | The Lead has a copy and no obligation                     |
| I7   | The Human types into a Peer's chat                                      | The Lead has a copy and an obligation; the Human sees whether it was carried in |
| I8   | `classify_finding` as `changes` with no change events                   | Refused                                                   |
| I8   | `classify_finding` as `alternative` with no reason                      | Refused                                                   |
| I10  | A Lead calls `ask_human` in the SLP profile                             | Refused                                                   |
| I10  | A Peer messages another Peer in the SLP profile                         | Refused; accepted in a profile that gives Peers `children` or a Peer edge |
| I11  | A message asking for an answer; its reader is gone                      | The obligation moves to the owner above; never closed by time |
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
| A finding raised while its answerer's seat is empty          | Answered by the next owner seated above; past an empty root, by the Human |
| A plan amended ten times                                     | Accepted, each with its reason                 |
| A red check with a reason                                    | Integrated; the kernel never overrules the integrator |

## The profile is data

| Case                                                                       | Expect                        |
| -------------------------------------------------------------------------- | ----------------------------- |
| The whole suite run on the SLP profile with every role renamed             | Same results                  |
| A search of the kernel and satellites for any role name in the profile     | None found                    |
| A search of the Human's surface for any role name in the profile           | None found: the agent the Human works with is shown by the name its profile gives the root's role |
| A profile with no `humanDoor` role                                         | Loads; `ask_human` is shown to no one |
| The small template `docs/TEMPLATE-SPEC.md` gives, which shares no role with the shipped one, attached to a project | Its root is seated with its own prompt and flow and the project's note is its own; the root seats a writer, takes its work in on evidence and lands it; a tool a role is not given is refused; the Human's view names the root by its role |
| A profile that gives a role a tool the team does not have: one misspelt, or one only the Human sends | Does not load, saying which role and which tool |

## Workflow

| Case                                                                                    | Expect                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Intake → open → plan → work → accept → integrate → land, no finding                     | Every step on the record; each line with its origin        |
| A finding mid-work, classified `changes`, brief amended, work integrated                 | The chain of change shows all six checkpoints              |
| A finding touching the goal                                                             | Waits on a question; the raiser's default goes on; carried after the answer |
| A small change: the Supervisor seats a Peer under the root and integrates it             | Works with no Lead                                         |
| The Lead amends only a brief's goal, beside a constraint that is the Human's              | A new version; every section it did not name as it was, and no word from the Human asked |
| Reseat a Peer mid-task                                                                  | Same scope and copy; its obligations with the new actor    |
| Reseat a Peer whose scope is held                                                        | Refused: nothing new is seated in a held scope             |
| A tool call whose arguments name another agent as caller                                | Recorded as the agent whose key made the call              |
| A Lead sends a message to the Human, whom its role does not speak to                   | Refused (I10), with what the record shows of where it stands: its seat, the owner above, and whom its role speaks to |
| A refused command that names a scope or an actor                                        | The refusal also says, of each, its owner, its parent and state, or its role and seat |
| A Peer's turn that no words of the plugin began fails on the host's error              | A fact to its Lead; the seat, its obligations and mail stay |
| Three turns an agent reports at $1, $3, then $0.50 after its session restarted          | It spent $3.50; its lane and the root the same             |
| The Human types into a Lead's chat, and two turns end, each hook carrying the whole history | Its Supervisor has one copy                          |
| A hand-back in a project with checks set                                                | Those checks run on its commit, as evidence                |
| The Lead runs its own acceptance test on a Peer's commit with `run_checks`              | Evidence on that commit, by the Lead                       |
| The Human reseats the Supervisor                                                        | Accepted: the Human stands as the root's parent            |
| `publish` when the remote moved since the landing                                       | Refused by the workspace; nothing forced                   |
| `drop_scope` while the scope's merge is in flight                                       | Refused: the record cannot call it dropped once the integration is physical                |
| A profile where the root's role hands back                                              | Its claim waits on the Human, shown to them; their `send_back` or a `published` settles it |

## Delivery

| Case                                                        | Expect                                         |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Three messages while the reader is mid-turn                 | One message after the turn, numbered, in order |
| The same message key posted twice                           | Delivered once                                 |
| Five Peers send to their Lead during its turn               | One numbered delivery when the turn ends, in the order sent |
| Only a copy and a fact are queued for an idle Lead          | The Lead is not woken; they go with the next delivery that asks |
| A check result for a hand-back's candidate                | Wakes the integrator, who was waiting on it                     |
| A check result a Peer asked for with `run_checks`         | Wakes the Peer; the owner above is told without waking          |
| A delivery refused as busy                                  | Sent again at the next turn's end, once                  |
| A Peer reseated with three messages queued                  | The new Peer receives the three                          |
| A batch longer than one message allows                      | Several deliveries in a row; nothing cut                 |
| Restart with messages queued                                | All delivered after                            |
| A turn the plugin's words began fails on the host's error   | Those words sent again once, saying the turn failed and why; the owner above not told |
| The turn they began fails too                               | A fact to the owner above; nothing sent again  |
| A turn the plugin's words began is cancelled                | Nothing sent again: a stop is the Human's      |

## Recovery

| Case                                                               | Expect                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Restart with open obligations, a pending evidence run, a held machine | Obligations open, the run asked again once, the hold kept |
| Every snapshot deleted, then restart                               | The same state from the log                     |
| A crash after commit, before an effect is dispatched               | The effect is dispatched once on restart        |
| A crash after a branch advanced, before the integration was recorded | Integrated on restart; no candidate made again  |
| A satellite's fact delivered twice                                 | Recorded once                                   |
| A tool call retried with the same command id                       | The earlier result; nothing appended            |
| A tool call whose answer is lost with the connection               | Sent again with its call id on a new line, recorded once |
| A satellite throws on an effect                                    | Tried again after a pause, with no change to wake it |
| An agent's create loses its reply and is tried after the record moved on | The seat keeps the one agent made; a key Paseo cannot finish is its owner's fact |
| Two projects on one daemon start their first agents                | Each is made: the create's key names its project |

## Stuck

What the Human's surface shows as stuck: read from the log and the outbox, changing nothing.

| Case                                                     | Expect                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| An effect whose satellite keeps throwing                 | Shown with how many times it threw; once given up, with its last error |
| An open scope whose seat was left empty                  | Shown, with its parent's owner                                      |
| Words queued for a seated actor whose agent never started | Shown, with how many deliveries wait                               |
| A project where nothing is stuck                         | Nothing shown                                                       |
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
| The Human keeps `rules/slp/all.md` and `rules/slp/lead.md` under the state root | A Lead seated after gets both after its role's prompt; a Supervisor only `all.md` |
| A rules file edited after one agent was made                | The next agent seated gets the edit                        |

## Workspace and evidence

| Case                                                        | Expect                                   |
| ----------------------------------------------------------- | ---------------------------------------- |
| A key with `/` and spaces                                   | Sanitized, with a hash suffix            |
| An agent runs git in another agent's copy                   | Refused                                  |
| `git fetch . HEAD:<branch>`, `git branch -Df`, `git --attr-source HEAD checkout` | Refused     |
| A merge with conflicts                                      | Undone; the conflicting paths reported   |
| A publish dispatched after the base moved                    | Refused; the tip it found is recorded, so asking again works |
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

## Editor

A template's files in, what a person sees out (`EDITOR.md`).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| The SLP profile opened                                      | A node for each role, skill, question and moment of its files and one for the Human; a wire for each `spawns`, each skill a role has, each role a moment watches and each role that may ask or tell the Human |
| The SLP profile opened                                      | Each role's ticked tools are exactly its `tools` in `profile.yaml`, in its node's groups or on a wire to it |
| Every tool a profile may give a role                        | In one of the editor's groups, and in one only                      |
| A template that names a skill, or a note for the project, it does not carry | Not opened, saying which                             |
| A template that keeps no positions opened                   | Every node placed, no two on top of each other                      |
| The SLP profile packed with nothing changed, and opened again | Every file as it was, to the byte                                  |
| A template whose nodes were put somewhere, then saved       | The places are in `template.json` and in no other file; opened again, each node is where it was put |
| A file that is not a packed template                        | Not opened, saying so                                               |
| A tool unticked for one role                                | Gone from that role's tools, another role's unchanged; no other line of `profile.yaml` touched, every comment kept |
| A property switched on for a role, then off                 | Its groups appear with every tool ticked; switched off, the role's tools are as they were |
| The root switched on for a second role                      | The root moves there: a template has one                            |
| A change that would leave a template that does not load, such as `delegates` off for a role that seats others | Not made, saying why |
| A wire of each kind drawn, then cut                         | In the one file its kind is kept in, then gone                      |
| A role renamed                                              | Every `spawns` and every moment that named it follows, and its prompt's file |
| A role taken away                                           | Nothing names it, and its prompt is gone                            |
| A role added, then taken away                               | Every file as it was, to the byte                                   |
| A skill added, and another taken away                       | The new one is a node before any role has it; the other's folder is gone and no role has it |
| Steps set down, given roles and joined; then taken away      | `flow.md` holds a line a step in order, each with its role and what follows, and `profile.yaml` gains the one line that names it; with the last step gone, the file and that line are gone |
| The SLP profile as shipped                                  | No note                                                             |
| A prompt naming a tool its role is not shown; a prompt naming a role the template lost; a watched role's prompt naming the watch; a prompt, skill or question still holding its skeleton; a skill named otherwise than its folder, not saying when to use it, or pointing at a file not beside it; a question asking of a field not in its state, or with one outcome described | Each a note on the node it is about |
| A writer not shown `hand_back`, a reader not shown `record_verdict`, a watching role not shown `attend`, a role that seats others not shown `open_scope` or `integrate`; a role shown `ask_human`, `attend` or `open_scope` that the kernel always refuses it; a role nobody seats, one with no agent profile, one with no prompt | Each a note on the role |
| A question asked on what is no event of the record, reading a state the record does not have, or telling whom the plugin does not know; a moment watching a role the template lacks, or counted in code under a name the plugin does not count | Each a note on the question or the moment |
| A file put beside a skill that points at it                 | Kept in the skill's folder; no note                                 |
| A skill wired to a role                                     | The role's always-on words rise by the words of the skill's description |
| A question added, ticked as asked, then taken away          | Written and not asked; asked by one line of its file; taken away, the file is as it was to the byte |
| A role's models set                                         | In its own line of the profile, no other line touched               |
| Any text hashed by the page                                 | The hash Node's own SHA-256 gives                                   |
| The wording of each question and moment of SLP, hashed by the page | The hash the plugin earns a threshold for                     |
| A question reworded after its threshold was earned          | Shown as not yet earned, with a note; before the rewording, earned and no note |
| A skill renamed                                             | Its folder's files, its name in its file and its place in every role that has it follow |
| A question renamed                                          | Its key and its line in the list of those asked change, each in its place; nothing else |

## Templates

What the plugin reads of a profile that a template adds (`TEMPLATE.md`).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Two profiles that differ in a skill, a file beside a skill, a question, a moment or a prompt | Different hashes; two that differ only in `template.json` or `NOTICE.md`, the same |
| A profile that names a flow and lists two docs of its own   | Every agent's standing instructions carry the flow after its role's prompt and before its skills; its first words point at the glossary, both docs and the map |
| A project opened                                            | On the record with the profile it runs, by name and by the hash of its files then |
| Two projects attached with different profiles, and the Human's rules kept for one of them | Each project's agents get their own profile's prompts; the rules reach only the agents of their profile; a profile nobody installed is not attached |
| A role taken out of a profile while an agent sits in it     | The project runs on; a tool the agent calls is refused, saying its role is gone from the profile, and it still reads the record; `stuck` names its seat |
| A profile that names the file of its questions; and one that names none while a `reflex.yaml` lies in its directory | The questions are read from the file named; the second asks nothing |
| A question or a moment named as asked that its file does not write | The profile does not load, saying which                          |
| `docs/TEMPLATE-SPEC.md` read beside the code                | It names every tool a role may be given, every key of `template.json`, `profile.yaml`, a role, the project, the reflex and watch files and a question, every relation, every event a question is asked on, every state path, whom a question tells and every moment counted in code |
| The whole small template `docs/TEMPLATE-SPEC.md` gives      | Loads as the editor and as the plugin load one, and draws no note   |
| The check command on a template's directory that loads      | Says the name it installs under, its roles and the agent profiles it needs; its notes are printed and it still passes |
| The check command on a directory that does not load         | Fails, saying why, and prints nothing else                          |
| The pack command                                            | The one file a template is shared as, holding the directory's very files; nothing is written for a template that does not load |
| A profile whose reflex file names a route of its own, or masks nothing | The reflex has no route but the plugin's, one for each the settings offer; what looks like a secret is still masked |
| A shared template read from a file on the machine           | What it would bring is said: its name, its roles, each agent profile its roles name and whether Paseo has it; nothing is installed and nothing unpacked is left |
| The template installed with the hash of what was read       | Under its name, listed to attach a project with; read again, it says it would replace the one there |
| A shared file that does not load, names a path outside its own directory, is not a packed template or is not there; and one changed since it was read | Refused, saying which; nothing installed, nothing written outside the state root |
| A role given an outside server, on an agent that takes one  | Made with the server beside the team's, its named tools approved ahead, each variable it names filled in; the team's server marked always loaded; a role given none has only the team's |
| A role whose server reads a variable that is not set        | Not seated; the reason names the server and the variable            |
| A role given an outside server, on an agent that cannot take one | Not seated; the reason names the server                        |
| A profile that gives a role a server it does not declare, or names one as the team's own | Does not load, saying which                |
| A shared template that declares an outside server           | What it runs is said, and each variable it reads with whether it is set, before anything is installed |
| In the editor, an outside server declared, said how to reach, given to a role with two tools, one tool taken back, then the server taken away | A node, then a wire carrying the tools; a wire with no tool named is not drawn; taking a tool back changes one line; with the server gone every file is as it was to the byte |
| In the editor, an outside server fresh from its skeleton and given to no role; then one with a secret written in it | A note for each of the first two; a note that a secret belongs in a variable for the last |

## Gallery

Template directories in, what a page lists out (`TEMPLATE.md`, The gallery).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| A gallery built from two template directories               | An index naming each by its directory, with its name and tags, and each as the one file it is shared as; a page reads back the very files |
| A template that does not load, or whose directory is not the name it would be installed under | Left out of the gallery, and said with why |
| A page with no gallery beside it; with a wrong index; with a listed template whose file is gone or does not load | The page says why; the card of that template says why |
| The build command on a directory of template directories    | The gallery written; with a template that does not load among them, it fails naming it and writes the rest |
