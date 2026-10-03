# Conformance

What an implementation proves before it counts as Seatworks. Each row is a case at the boundary an agent or the Human uses:
commands called as a tool is called, facts fed as a satellite returns them, the log read back. Each is shown to fail
on an implementation without the rule before it is trusted.

## Invariants

| Case | Setup                                                                  | Expect                                                    |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| I1   | A scope with a writer; a second actor tries to take it without handover | Refused                                                   |
| I1   | `handover` moves paths to a sibling                                     | One event; the moved paths' writer changes with them, never two at once |
| I2   | A Lead that writes holds `src/`, and its child `src/net/`               | Each scope has its own writer; in their one worktree the Lead's git is refused a file under `src/net/`, and the child's a file the Lead kept (Workspaces and harness, below) |
| I3   | Two open siblings both hold `src/net/`, neither `after` the other       | Refused; accepted once one waits for the other            |
| I3   | A scope opened `after` an open sibling                                  | No copy and no agent until that sibling is integrated or dropped |
| I3   | A waits for B, and B, which waits too, is set to wait for A             | Refused                                                   |
| I4   | `integrate` citing evidence on an older commit                          | Refused                                                   |
| I4   | `integrate` over a failing check, with a reason                         | Accepted, the reason on the record                        |
| I4   | `integrate` over a failing check, no reason                             | Refused                                                   |
| I4   | `integrate` citing a pass, a failing check on the same commit uncited, no reason | Refused                                          |
| I4   | `integrate` citing a verdict on an older commit                         | Refused                                                   |
| I4   | `integrate` citing a verdict whose reading scope was dropped            | Accepted; once the scope it was cited for is integrated, the verdict leaves memory |
| I5   | A Peer amends its own brief                                             | Refused                                                   |
| I5   | A Reviewer tries to write in its copy's paths through the kernel        | Refused: a reading scope has no paths                     |
| I6   | The Lead amends the goal with no answer from the Human                  | Refused; accepted citing the answer                       |
| I6   | A line marked the Human's with a message that is another's behind it    | Written as its caller's                                   |
| I9   | A line whose `via` names nothing that was made: a line's id given as a message's, a finding never raised | Refused, saying what a `via` names |
| I6   | A term the Human settled is settled again without their word | Refused; accepted citing it                             |
| I7   | The Supervisor sends a Peer a message that directs                      | The Lead has a copy and an obligation; it closes on carried or declined |
| I7   | The Lead cites, or answers, the copy of a direction it was given, once the copy has been delivered to it | The direction's obligation closes: the copy is what it read and names, so it stays in memory until then |
| I7   | The Supervisor asks a Peer an open question                             | The Lead has a copy and no obligation                     |
| I7   | The Human types into a Peer's chat                                      | The Lead has a copy and an obligation; the Human sees whether it was carried in |
| I8   | `classify_finding` as `changes` with no change events                   | Refused                                                   |
| I8   | `classify_finding` as `alternative` with no reason                      | Refused                                                   |
| I10  | A Lead calls `ask_human` in the SLP profile                             | Refused                                                   |
| I10  | A Peer messages another Peer in the SLP profile                         | Refused; accepted in a profile that gives Peers `children` or a Peer edge |
| I11  | A message asking for an answer; its reader is gone                      | The obligation moves to the owner above; never closed by time |
| I11  | A Lead that owes an answer to a finding, a claim's taking in, a direction, a permission and a question it read is gone; then its lane is reseated | The owner above holds each meanwhile; the new Lead owes each after, is sent the question, and answers it and the finding |
| I12  | An observation past its threshold on a finding                          | A note to the relation named; the finding, its obligation and every line unchanged |
| I12  | A reflex question whose `tells` would classify, integrate or answer     | The profile is refused when loaded                        |

## The kernel adds nothing

| Case                                                         | Expect                                         |
| ------------------------------------------------------------ | ---------------------------------------------- |
| A hundred findings to one Lead                               | All accepted; none merged, ranked or capped    |
| A scope integrated with no reading scope ever opened         | Accepted                                       |
| A scope handed back while a scope under it is still open     | Taken: its reply and the note to the owner above both name the scope still open, which is what will refuse its taking in |
| A verdict of changes on a commit                             | Recorded as evidence; nothing held or sent back by it |
| A reader asked a question records its answer with no verdict | Evidence that neither passes nor fails; whoever seated it is told it as an answer; no reason is owed for it at integration; what leaves out whether it is a verdict is not taken |
| A permission asked by a Peer                                 | Answerable by its Lead or the Human, not by another Peer |
| A Peer's permission open when its Lead is reseated or released | Owed by the new Lead, or by whoever released it, who answers it; the Peer still waits |
| A permission whose asker leaves its seat                     | Closed: nothing is owed to it                  |
| A permission answered in the agent's own prompt in Paseo     | Settled on the record: nothing owed, its answerer told, no second answer sent to Paseo |
| A finding raised while its answerer's seat is empty          | Answered by the next owner seated above; past an empty root, by the Human |
| A plan amended ten times                                     | Accepted, each with its reason                 |
| A red check with a reason                                    | Integrated; the kernel never overrules the integrator |
| The actor that holds the machine is released, reseated or gone, or its scope is dropped or integrated | The machine is let go, and what waited on it starts |

## The profile is data

| Case                                                                       | Expect                        |
| -------------------------------------------------------------------------- | ----------------------------- |
| The whole suite run on the SLP profile with every role renamed             | Same results                  |
| A search of the kernel and satellites for any role name in the profile     | None found                    |
| A search of the Human's surface for any role name in the profile           | None found: the agent the Human works with is shown by the name its profile gives the root's role |
| A profile with no `humanDoor` role                                         | Loads; `ask_human` is shown to no one |
| A small template that shares no role with SLP, attached to a project | Its root is seated with its own prompt and flow and the project's note is its own; the root seats a writer, takes its work in on evidence and lands it; a tool a role is not given is refused; the Human's view names the root by its role |
| A profile that gives a role a tool the team does not have: one misspelt, or one only the Human sends | Does not load, saying which role and which tool |

## Workflow

| Case                                                                                    | Expect                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Intake → open → plan → work → accept → integrate → land, no finding                     | Every step on the record; each line with its origin; once it has landed only the root is in memory |
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
| The Human types into a Lead's chat, and two turns end, each hook carrying the whole history, the Lead's first prompt in it under the id Paseo was given for it | Its Supervisor has one copy of what the Human typed, and none of the plugin's own first words to the Lead |
| The Human types again, and two turns end on each other's heels, the second hook arriving while the first is being taken | One copy still: an agent's turns are taken one at a time, each from where the one before left its history |
| A hand-back in a project with checks set                                                | Those checks run on its commit, as evidence; whoever takes it in is told with the hand-back that they run, and with none set that nothing is run |
| The Lead runs its own acceptance test on a Peer's commit with `run_checks`              | Evidence on that commit, by the Lead; its result says the Lead asked for it and names the checks that ran, where the project's own on a hand-back says they are the project's |
| The Human reseats the Supervisor, who had asked them a question, and then answers it    | Accepted: the Human stands as the root's parent; the answer is told to whoever holds the root's seat now |
| `publish` when the remote moved since the landing                                       | Refused by the workspace; nothing forced                   |
| `drop_scope` while the scope's merge is in flight                                       | Refused: the record cannot call it dropped once the integration is physical                |
| `send_back` while the scope's merge is in flight, and once it is integrated             | Refused both times: its writer would be told it was sent back, and then let go as integrated |
| A profile where the root's role hands back                                              | Its claim waits on the Human, shown to them; their `send_back` or a `published` settles it |
| The Human's view of a team three levels deep, its scopes opened out of the tree's order | Every scope, the root first and each before what is under it, with its parent and whether it is work, a reading or a watch; a question names the scope its asker sits on |
| The Human's view of a project whose checks the Human set                                | Each check with its name and the program and arguments it runs; none before any is set |

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
| A question whose asker was reseated, and then gone, before it is answered | The answer goes to the new holder of the asker's seat; with the seat empty, to the owner above |
| An `answer` to a note of the record's own                   | Refused: nobody reads it                                 |
| A message sent as following one its sender read, which asked nothing and is settled; one following an id never sent | Taken, saying which it follows; the second refused |
| A delivery reported after its reader left and its message moved to the owner above | The message is not marked delivered: its new reader still gets it |
| A queue longer than one delivery holds                      | Several deliveries, the oldest first, the next at the end of the turn the one before began, each saying how many still wait; every message whole |
| Restart with messages queued                                | All delivered after                            |
| A turn the plugin's words began fails on the host's error   | Those words sent again once, saying the turn failed and why; the owner above not told |
| The turn they began fails too                               | A fact to the owner above; nothing sent again  |
| A turn the plugin's words began is cancelled                | Nothing sent again: a stop is the Human's      |

### Into a turn

A reader inside a turn, in a template that lets mail into one, asked for mail as its hook asks.

| Case                                                        | Expect                                         |
| ----------------------------------------------------------- | ---------------------------------------------- |
| A direction from the owner above; then Paseo has the reader between turns before the plugin hears it, and more mail comes | The direction enters at the next pause, once, under words that say it is mail; its hook's file says something waits, then nothing. It is on the record as delivered from then on, and is not sent again with the new mail nor at the turn's end |
| Two questions from below, a remark that asks nothing and a question from above; then another question, and a direction | Nothing enters before the template's patience is out. Then the two questions enter as one numbered delivery, without the remark or the question from above. The further question waits out the rest after an entry; the direction does not. What stayed out goes as one delivery at the turn's end |
| Mail entered a turn that then fails                         | It is not sent again: it is in the reader's own history |
| Mail entered a turn, and the reader's scope ends within that turn | None of it is moved to the owner above as unread |
| A template that names no entry into a turn                  | Nothing enters; an agent's hook is named no file; its first words say nothing arrives while its turn runs |
| What waits 119 and 120 seconds of a patience of 120; a direction beside it; an entry 50 and 90 seconds after the last, with a rest of 90 | Out, then in; the direction takes everything that would wake with it, oldest first; out while the reader rests, in after, and a direction at any time |
| A Claude agent's hook, as its room's settings name it, run as Claude Code runs it from the agent's own environment | Silent, and no answer asked of the plugin, while nothing waits; with mail, the hook's `additionalContext` is the mail; then silent again |
| A timeline in which mail handed into a turn is listed as the agent's own words | None of it is counted as said by the agent, and the turn that follows starts after it |

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
| A satellite throws on an effect, and two commands are taken during its pause | Tried when the pause ends, not at either command |
| A satellite's fact the record throws on                            | A try that failed: paused, tried again, given up on after its fifth and shown as stuck; never tried again at once |
| A listener of committed events throws                              | The command is taken and answered; the listeners after it still hear |
| What the watch counted is not taken by the record                  | Said in the log; nothing is thrown                |
| An agent's create loses its reply and is tried after the record moved on | The seat keeps the one agent made; a key Paseo cannot finish is its owner's fact |
| A scope dropped while Paseo is still making its agent              | The agent is archived once it is made: none works on for a seat that ended |
| Two projects on one daemon start their first agents                | Each is made: the create's key names its project |

## Stuck

What the Human's surface shows as stuck: read from the log and the outbox, changing nothing.

| Case                                                     | Expect                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| An effect whose satellite keeps throwing                 | Shown with how many times it threw; once given up, with its last error |
| An open scope whose seat was left empty                  | Shown, with its parent's owner                                      |
| Words queued for a seated actor whose agent never started | Shown, with how many deliveries wait                               |
| A seated actor that ends a turn while its agent's tool server never said hello; then the server says hello; then the plugin starts again | Shown, saying it has none of the team's tools; no longer shown; still not shown, with no new hello |
| A project where nothing is stuck                         | Nothing shown                                                       |
| A create Paseo refuses, such as a profile with no model            | The seat is gone with Paseo's reason, which its owner hears |
| An agent reopened after a daemon restart                           | Its whole seat's environment again, the git shim first on its PATH |
| Any agent, when made and each time its session opens               | Its process is given no Paseo daemon to find: a host that never resolves, and an empty home; a Claude agent is also denied, by name, every tool of the server Paseo adds and Paseo's command line |
| The plugin's start fails once, then is asked again                 | It starts                                       |
| One project's log cannot be read at start                          | Every other project opens and works             |
| A permission asked while the plugin was down, then its hook too    | On the record once the plugin starts, and once only |
| The same log folded by the daemon and by the surface               | The same state                                  |

## Harness

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| A Pi agent is seated                                        | Its room, with the Human's login linked; the extension gives it the team's tools; Paseo is handed no server and no tool to approve, which it refuses for Pi |
| A Codex agent is seated, in a role that does not write and in one that does | Its mode and options ask nobody and switch its own agents off, with the rest in a config of its room, which links the Human's login and not their config, switches off the server Paseo may add for its own tools, and holds a rule that forbids Paseo's command line; it takes the team's server from Paseo; only the writer's options name the repository's git directory as a root to write |
| An OpenCode agent is seated, and reopened after a daemon restart | It takes the team's server from Paseo, on the agent OpenCode ships for building; its options allow what would ask and deny a subagent, a question and Paseo's command line, none of them a key Paseo's schema refuses; the config its server reads last denies Paseo's own tools, for every agent and last among that agent's own, and it is handed that config again when reopened |
| An agent is seated on Claude Code, on Pi, on Codex and on OpenCode, and a writer under it | Each is given a room of its own, named by the variable its agent reads its home from, that holds a copy of each skill its role has, as its template has it, and none of another role's |
| Two projects attached on one template and a third on another, each seating its root | Three rooms; the first two hold that role's skills as the first template has them, the third as its own has them |
| In a room: a file added to a skill, a skill's file changed, a skill its role lacks put there, its settings written over; its agent's own state and a folder named with a dot among its skills left there; then the agent's session opens again | Its skills are as the project's copy has them and its settings as the harness file does; the agent's state and that folder are as they were |
| A Claude Code agent is seated, and a writer under it         | Its room's settings switch off the skills Claude Code brings and what the Human's account would bring it (skills, plugins, connectors), and deny its own tools for a team, a schedule, a worktree or a plan of its own, and for sending outside the team; its skill tool is left it; the one skill those settings leave is hidden by a variable; its login is kept where the Human's is; Paseo is handed no option but a writer's sandbox |
| A Pi agent is seated                                        | Its room's settings leave out the skills the Human keeps for every agent, by that folder's full path |
| A Codex agent is seated while the Human keeps a skill for every agent; then a skill appears among those Codex brings, and its session opens again | Its room's config switches off its own agents, apps, plugins and suggested tools, its sleep and goals, its browser, computer use and image generation; each of the two skills is written off by its real path, and none of its room's own |
| A Claude Code agent is seated                               | Its room's settings deny it `ScheduleWakeup`, the tool that parks a turn until a time the agent names: the turn stays open in Paseo while it sleeps, and its mail waits for a turn's end |
| The Human keeps `rules/slp/all.md` and `rules/slp/lead.md` under the state root | A Lead seated after gets both after its role's prompt; a Supervisor only `all.md` |
| A rules file edited after one agent was made                | The next agent seated gets the edit                        |

## Tools

A call as an agent's tool server sends it, the answer read back.

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `status`, `record` and `diff` called with no scope named, then with another scope's name | The caller's own scope as the record has it, its history, and its change against its parent's branch; then the other's |
| `look` at an agent, and at the last two things in its history | What it was told, thought and said, newest last; no more of them than asked for, and the newest |
| `diff` of a scope that is not open                          | Said so, by its name                                       |
| `diff` of a change that is none                             | Said so, naming both ends and the paths it was read under, never an empty answer |
| `record` of each scope, after any run of commands             | What the whole log says of that scope, read from the events filed under it alone |
| A read whose arguments do not fit: `look` with no actor, or asking for more turns than it gives; a scope that is no name | Refused, saying which argument; nothing is read |
| Every tool an agent may be shown                            | Each of its arguments says what it is, at every depth; a line's own fields are said once, by each tool that takes lines |
| A writer's scope opened with a commit named; an amendment of a brief, or of a plan, that changes nothing | The writer has a branch of its own and is seated on no commit: only a reader is; each amendment is refused, saying it changes nothing |
| The scope tools, by a team of plain roles each given every tool: open, amend a brief, hand paths over, hold and resume, reseat, release, drop | Each is read back in `status`: children, a brief's version, paths, held, who is seated, the siblings a scope waits for. Both writers are told of paths moved, and a scope's owner of its hold and its resuming. A reseat archives the agent that left and makes another; nothing new is seated in a held scope; a path outside its parent's is refused (I3). The scope's `record` keeps each in order, and a dropped scope's says it was dropped; its parent's `record` keeps each scope opened under it, with its role and paths, and what came of it. A scope that waits for a sibling has no agent, which `status` says of it among its parent's children, and gets one when that sibling is closed |
| The work tools: a writer runs the checks on its own scope, hands back, is sent back, hands back again; a reader's verdict; the owner above runs checks of its own, integrates on evidence, publishes | `run_checks`, `integrate` and `publish` each answer that their caller is told the outcome once its turn has ended, and it is: the check's result, the integration made, the push done. The check's result is evidence both the writer and the owner above are told of, with the checks that ran by name and its id; a send-back reaches the writer and leaves nothing to integrate; a verdict reaches whoever seated its reader, with its id; a failing result on the commit is integrated only with a reason; the base then holds the commit, the writer's agent is let go, and the remote holds it after the publish; the scope's `record` keeps each hand-back and what came of it, once it is closed too |
| Two scopes handed back and checked; the first integrated while the Human edits the base's checkout, then again once it is clean; then the second | The owner above is told the first was not integrated and why, and that its candidate stands: the same `integrate` is taken once the base is clean. The second is refused as the base moved: the owner above is told and woken, another candidate is made, evidence on the old one is refused for it (I4), and on evidence on the new one it lands |
| A scope opened on a commit the repository does not have yet; the commit fetched, then the scope reseated | Its owner above is told the copy could not be made, no agent is made, and `status` says so of the scope and among its parent's children; the reseat asks for the copy again, and its agent is made |
| The edge tools: a wait added to a scope that has started; one added to a scope that waits, and taken away again; `mustTell` from one scope to another, then the first's brief amended, its hand-back, its drop; `mayChange` asked for by the scope's own owner, then given by the owner above, then taken away | The first is refused; the second is read back and its last removal starts the scope; whoever must be told is, each time, in the kernel's own words; a scope's owner cannot take leave to amend another's brief, amends it once given leave, with the owner above told who did and why, and is refused again once the leave is gone; each edge is read at both ends in `status` |
| A commit handed back, checked and read under an abbreviation of its name; the scope then integrated, its reader dropped first, and the base published | The candidate is the commit by its whole name; the check and the verdict on the abbreviation are evidence on it (I4), the verdict still citable once its reading scope is gone; the base holds the commit and the remote has it at the first publish |
| A publish refused, such as one asked for after a commit of the Human's moved the base | The root's owner is woken with why; asked again, the publish finds the tip |
| A hand-back in a project with no check set                   | No run is asked for and nothing is evidence: `status` says no check is set; `integrate` has nothing to cite until the owner above runs checks it names, or a reader gives a verdict |
| The finding tools: raised on a line, kept, reopened on new evidence, carried by the change that answers it, withdrawn | Whoever answers is told each time; a reopening says what is new and its evidence; `changes` is refused until a change carries it (I8); the record keeps the whole chain; a finding about another scope is read in that scope's record too, with the change that carried it, and no other scope's findings are; a withdrawal reaches whoever was to answer, and the finding is answered no more |
| A question sent with why it is asked, what its sender does unanswered and what it points at; its answer with a reason; a direction with what still holds; a message with none of these | The reader is delivered each under its own label, after the words: `Why`, `If unanswered`, `Still holds`, `See`; the last says only its words |
| The talk tools: a message that asks, its answer, a direction from two owners up, a question to the Human and its answer, a report | The message is owed until answered; a role speaks only along its edges (I10); the owner between gets a copy of the direction and owes for it (I7); the question is the Human's to see and its answer wakes the asker; the report is read under its sections; a report with no line is refused, saying so; a reply names the scope and actor an `open_scope` made, a message with its reader, a question and a finding, each by its id; `status` shows a message or a direction owed with its words; a new holder of the seat reads in its first words what it owes, and is sent the question the one before it read and left unanswered |
| The plan tools: set once, amended by line, its goal changed | Each line is read back with its id; a term settled again replaces the old; a second `set_plan` is refused; the goal changes only citing the Human's word (I6), and the line is then theirs |
| The attention tools: a watcher attends, the owner above acknowledges, marks a kind noise; a permission asked; the machine held | The attention reaches the owner above the agent watched, which is told nothing; a kind marked noise for that agent and scope is not told again, and the watcher's reply says nobody was told; only that owner or the Human answers the permission, and the answer reaches the agent's own prompt; one actor holds the machine at a time, and only it or the Human lets it go; while it is held `status` says who holds it, and a check asked for waits; the holder released, the check runs; the `record` of the scope an attention is about keeps it, and what came of it |
| A tool server that says hello for a project the plugin cannot open | Refused, saying so, with the reason in Paseo's log; every other agent's tools go on working |
| A tool server started before the plugin listens             | It waits, and has its tools once the plugin is there       |
| A tool server the plugin refuses                            | Not tried again: the refusal is the plugin's answer        |
| A call sent on a line the plugin refused                    | Answered, in words, that nothing was done; never left waiting |
| A call made while the plugin is away; then once it is back  | Answered in words that the plugin is not answering and nothing was recorded; then carried |

## Workspace and evidence

| Case                                                        | Expect                                   |
| ----------------------------------------------------------- | ---------------------------------------- |
| A key with `/` and spaces                                   | Sanitized, with a hash suffix            |
| Two branches made for a project, one merged into the base and one two commits past it; asked against a base that is not there, and against none | None and two; every commit of each, so nothing reads as merged |
| An agent runs git in another agent's copy                   | Refused                                  |
| In a worktree others work in, a writer stages everything, stages its own folder, commits; then commits all that changed, drops every edit, resets, rebases, cleans, amends; with no neighbour; alone in its worktree | Staging or committing everything, and dropping every edit, are refused where a file a neighbour holds is among them, naming the file, the scope and the path; its own passes and the neighbour's edit is as it was; reset, rebase, clean and amend are refused outright; with no neighbour everything is its own, and a seat alone resets as it likes |
| A lane's owner, which does not write: it commits; it merges a branch that conflicts, settles a file a task holds, and concludes the merge; the same merge by a seat that is no lane's owner | The commit is refused; the merge is let through to stop at the conflict, the file is its to settle and the merge commit is made; refused |
| A hand-back that conflicts with its parent's branch, which took in two commits since, one of them in the conflicting file | The conflict names the file, and of what the parent took in, the one commit in that file |
| `git fetch . HEAD:<branch>`, `git branch -Df`, `git --attr-source HEAD checkout` | Refused     |
| A merge with conflicts                                      | Undone; the conflicting paths reported   |
| A publish dispatched after the base moved                    | Refused; the tip it found is recorded, so asking again works |
| A publish asked for at a head the plugin's own commit has since moved: its note at attaching, or the block it keeps in a file; then with a commit of the Human's among them | Pushed, the plugin's commit with it, and whoever asked is told both the head pushed and the head it asked at; refused as moved once anyone else's is there |
| A commit named to the workspace by an abbreviation            | The candidate it gives back is the commit by its whole name |
| A hook or a smudge filter planted in the repository's own config, then a landing checked out in the Human's folder | Neither runs |
| The copy moves while a check runs                           | The run fails                            |
| A check's command ends while a process it started still runs | The step ends at once with the command's exit code, and that process is ended |
| A runner is stopped while a step runs; and while it still makes the copy | The step and what it started are ended, no further step starts, the run fails saying it was stopped; no step starts at all |
| The plugin stops while a check runs                         | The check is ended and nothing is recorded of it; started again, the plugin runs it anew |
| The process that asked for a check is killed outright while the check runs | The check is ended                       |
| A run of checks answers                                     | No process it started is left, its steps' guards included |
| The plugin stops while two projects each have work in flight, the first held up by Paseo | The second's check is ended without waiting for the first |
| An integration asked for while a long check still runs on the same scope | Made at once: the base holds the commit while the check runs on |
| An evidence run asked while the machine is held             | Starts when the hold is released         |
| Another project on the machine asks for an evidence run during a hold | Deferred the same way          |

## Installing and upkeep

| Case                                                                              | Expect                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Paseo lists a git project no team is attached to                                  | Offered to attach; once attached, no longer offered                 |
| Paseo lists a repository with a commit, a plain folder, a repository with no commit, and a folder inside the first | Each is offered with how it stands with git: ready, not yet, not yet, and a part of another's, named with that repository |
| A folder with two files and an ignored one, set up from the page                  | First it is made a repository and says a first commit would hold two files, with something ignored, and nothing is committed; then one commit of those two, in the Human's name, and it is ready |
| A folder given by its path; a path that is no folder; git asked for in a part of a repository; the folder once attached | Offered as Paseo's own are; each of the others says why not |
| A team attached to a repository Paseo keeps a project for; its root seated, a lane opened under it, and the lane seated again | The root's agent works in the repository itself and no worktree is made for it; the lane's works in a worktree of its own, made when the lane was opened; Paseo lists both under the repository's project, the lane in one workspace both times, is given no project of the copy's folder, and nothing is offered to attach |
| One lane end to end: the root opens a lane, its owner a task under it, the task's commit is handed back, checked and taken in, then the lane's | The lane has a worktree Paseo made, on a branch of its own; the task's agent works in that same worktree and workspace; taking the task in leaves the worktree for the lane; when the lane lands the base holds the work, checked out and clean, and the lane's worktree and branch are gone |
| Two tasks of one lane, on paths that do not meet, each commit on the lane's branch; the first hands back while the branch is at its commit, and its neighbour commits over it after; both are taken in, then the lane | One worktree for the lane however many it seats; each task's change reads as what lies under its own paths; taking them in moves the branch nowhere; the base holds both parts once the lane lands |
| A lane whose branch is there already, from a start that was cut short | Its worktree is made on that branch, and no second branch beside it |
| Two lanes that both change a file neither named; the first lands, the second hands back; the root's owner then says what is done, the lane takes the base in by hand and hands back again | Nothing is merged for them; the root's owner is asked, with the files and what the base took in there since the lane began; the lane's owner is not woken, and reads with the decision that its hand-back conflicted and on whom it waited; its integration is refused until then; what it settled by hand lands |
| An owner that writes and a task under it, each staging everything in their one worktree, then its own | Each is refused the other's file, naming the scope and the path it holds: a file is the innermost scope's that holds it. Its own is staged and committed |
| A lane's owner that writes commits a small change in the lane's worktree with nobody seated under it, hands the lane back, and the root's owner takes it in | Its commit is made through the guard on its `PATH`; the base holds the change, the worktree goes, and no agent was seated for it |
| Two tasks of one lane, seated | Each has a file of whose every path of the lane is, its own first, then its neighbour's and what its owner kept, written again when a neighbour is taken in; the owner's lists what it handed out before its own; the root has none, and only the lane's owner may take a branch in by hand |
| A team attached to a repository Paseo keeps no project for | The repository is a project in Paseo once its first agent is made, the team under it, and no folder a team works in is one |
| Paseo lists a worktree of an attached repository and a folder the plugin keeps for itself; git asked for in the worktree; the plugin's folder given by its path | The worktree is said to be a part of its repository and is not attached; the plugin's folder is not listed; git is not set up in the worktree; the plugin's folder is refused as its own |
| A team attached to a repository with no remote, with one, with `origin` among two, with two and no `origin` | The project is published nowhere yet, at that one, at `origin`, and nowhere until the Human names one |
| A project whose remotes are an HTTPS address with an account and a secret in it, an SSH address, an address that does not parse, and a folder beside it | Each is said by its name with where it points: the host and the path, the same for the first two, and none shows what stood before the `@` |
| A project with no remote put on GitHub as private from the page; then asked for a second | A repository of the folder's name is asked of GitHub's command line as private, named `origin`; the base is pushed there and the record holds the remote; the second is refused |
| GitHub's command line not signed in on the machine                                | The page is told nobody is signed in, and no repository is made      |
| A lane is dropped with a commit on its branch and a draft in its worktree; the draft is then removed and both are cleared | Its worktree listed and not removable; its branch listed as one whose commits would go with it; cleared, Paseo removes the worktree it made and the branch goes |
| A project is attached                                                             | `AGENTS.md` on its base carries the note after the project's own rules, in a commit of that file alone; what the Human staged stays staged |
| The Human removes a project while a worktree holds uncommitted work               | Refused, naming the worktree; nothing touched, its agents still at work |
| The Human removes a project while editing its `AGENTS.md`                         | Refused, naming the file; the edit kept                             |
| A project is attached while the Human keeps an `AGENTS.md` of their own ignored     | Refused, naming the file; their file kept, nothing committed        |
| The root's plan settles a word, and a lane lands                                  | No commit of the plugin's follows on the base: its head is the lane's merge, and no file there holds the plan or the word |
| A project with a plan and a lane landed is removed                                | The file its profile names as the map is left on the base in a commit of that file alone, before the note is taken out: the destination, what must hold apart from what was chosen, the words settled, and each lane landed under what its owner reported and how each finding in it was weighed; the checkout stays clean |
| The Human removes a project while a file of theirs lies where its map would be left | Refused, naming the file; nothing written, the note still there      |
| An agent is seated                                                                | Its first words point at each doc its profile lists, and at nothing the plugin writes |
| An agent is seated                                                                | Its first words say that nothing sent to it arrives while its turn runs, and that it waits by ending the turn |
| An agent with skills is seated                                                    | Neither its standing instructions nor its first words list one: its agent finds them in its room. Its first words end where it stands on the record, as `status` shows it |
| A removal that stops part way, such as an archive that throws                     | The project stays attached, its note back; its agents archived meanwhile recorded gone |
| The Human removes a project whose repository is gone, while one of its agents holds the machine | It leaves memory, and every other project's work that waited starts |
| The Human removes a project                                                       | Its agents archived, every branch made for it and its note gone, its record kept aside; offered to attach again |
| A scan after a lane was dropped with a draft in its worktree; another once the project is removed | The worktree says what it takes on disk, its files among it, and the branch nothing; the record says what it takes and when its project was removed |
| A folder holding two files, one nested, and links to a file and a folder outside it; a folder that is not there | The bytes of the two files, no link followed; nothing |
| Paseo's check says a newer release is out                                         | Shown with its review links and the command that applies it; nothing installed |
| Paseo's command line is not on the daemon's PATH                                  | Said, with the command to run by hand                               |
| `install.sh --ref` or `--dir` once Seatworks is installed                         | Says the option was not used, and how to install from elsewhere      |

## The Human's surface

What the surface says of a team, read from the Human's view and from what Paseo says each agent is doing. The
screens themselves are type-checked and no more, until seen on a live Paseo.

| Case                                                                                      | Expect                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A team three levels deep with one agent in a turn; then a hand-back, a held lane and a question from the root | Each seat says one word for what it is doing now: working or idle by its agent; then handed back, held, and needs you on the scope the question came from |
| That team with nothing waiting; with two agents in a turn; with the root held; with a question; with two things stuck | The pill says idle, then 2 working, held, 1 needs you, 2 stuck: the most pressing thing wins |
| A team whose lane's owner may ask the Human, before and after it asks; a seat picked; a seat picked that is gone | Beside the tree the root is shown, then the lane, which says its role and who sits in it; the picked seat stays shown; a gone one gives way. What waits from the lane is its question alone, and nothing waits from the root |
| A team whose record holds a landing, with a lane still open; with no work open under the root and a watch still seated; the same with nothing landed | The pill says idle, then all landed, then idle |
| One lane end to end, read as the surface reads a project before anything is taken in and after the lane has landed | None landed; then two, the task and the lane, though only the root is left in the state |
| A scan that finds a copy holding a draft, a branch not merged and the attached project itself | Sorted as kept, to check first, and left out; the project is never among what is picked for the Human, whatever the surface knows of what is attached |
| Setting up with no template installed                                                     | Matching agents is not done, whatever else is                        |
| The models of a provider, to offer a new profile; a profile's model changed to one that has its effort, one that lacks it, one with none | The provider's own model at the effort it starts on, the first where none is its own; the effort kept, then the new model's own, then none |
| A check's command typed on one line, an argument in quotes; any arguments shown as a line and typed back | The program and its arguments, the quoted one whole; the same arguments |
| A branch merged, one three commits past the base, a copy holding a draft, an agent; a clean copy and a record | Each line says it in a word or two: merged, 3 commits not merged, uncommitted work, seat ended; the last two say their size and day and no more |
| A thing done under a minute ago, some minutes ago, an hour and more ago                   | Just now; to the minute; to the hour                                |
| How long since a thing happened, for a column of its own: under a minute, minutes, hours, more than a day | Now; to the minute; to the hour; to the day |
| A pick on a project's page for a name whose profile runs one provider, model and effort: the same again, another effort, the model's own effort, another model, another provider; and a model for a profile that names none | Nothing is kept of its own; the effort alone; that too; the model with its effort; the provider with both; the model with its effort. Laid over the profile, what is kept runs what was picked |
| What a scan found for two projects: two copies, a branch, the project itself, another project's copy, a record; two agents; a project with nothing | 2 copies, 1 branch and what the two copies take on disk; 2 agents; nothing to say |
| Sizes from nothing to past a GB, and a day of this year and of last                       | A whole number of the unit that keeps it short, a tenth more past a GB; the day's number and month, with its year when that is not this one |

## Reflex

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| No key set, or the key refused                              | Agents are seated and commands run; a standing alarm to the Human |
| The reflex's host is down during a hand-back                | The command succeeds; the evidence step says `not run`     |
| A state past the budget                                     | Not cut to fit; the step says `too large`                  |
| An answer with one question missing                         | The call fails; nothing is recorded as answered            |
| 400 `max_tokens_exceeded`                                   | Not retried; recorded `too large`                          |
| 401 from the classifier's host                              | Not retried; an alarm to the Human; nothing else stops     |
| 429 with a wait named                                       | Asked once more after that wait, then unread               |
| Twenty questions reading the same fields of one item        | One call                                                   |
| A question past `tell` whose wording changed since its look back | A candidate for the Watcher, not an attention          |
| A question whose answers sit between 0.3 and 0.6 on every subject | Marked weak at the look back                         |
| An edit breaks a compiled project rule                      | A fact to the writer quoting the rule and its line         |
| A check fails with a known missing-dependency message       | An environment fact, with no reflex call                   |
| An instruction file changes                                 | The Supervisor is told to compile the rules again          |
| A question renamed in `reflex.yaml`                         | Asked under its new name with no code change               |
| Every moment and question of a profile renamed, the moments counted in code apart | The names a test gives the code are still checked on its edit and at its hand-back, each answer under the new name; no code names a moment or a question of the profile |
| Each event in REFLEX.md's table                             | Its questions asked, and no other's                        |
| A brief given one kind, read as the other                   | Weighed on the other kind, not on the first label          |
| A turn ends in words with no command                        | Its last words asked whether they hand back, ask or wait   |
| A hand-back                                                 | Its diff asked hunk by hunk: test hunks and product hunks their own questions |

## Watch

| Case                                                        | Expect                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| A Peer's thinking says it drops its approach, p past `tell` | One attention to its Lead; nothing to the Peer             |
| The same, p between `consider` and `tell`                   | A candidate to the Watcher, and an obligation on it        |
| A candidate, when its Watcher is told of it                 | It reads the moment, its answer and the agent; the item with two either side and no more; the facts the eye counted; the scope's brief; each earlier attention about that agent with what came of it |
| A candidate passed before it was sent                       | Nothing is sent of it                                      |
| An agent reads its own scope's record after an attention about it | Nothing of the attention is in it; an owner above the scope, and one that watches, read it there |
| An agent looks at one above it, at the one that watches, or at an actor that is not there | One same reply: no agent in its scope or below it. An owner looks at those below it, and one that watches at those it watches over |
| An agent reads `status` or `record` of the root, or of the scope that watches | The root's show it no scope that watches, and that scope reads as not open and with nothing on its record; its own agent and the owner above it read both |
| The root's owner reads the root's record                    | It ends with the five signals and, for each question and moment, its answers and how they fall, those past its threshold, the candidates attended and passed, and its attentions with what came of each; any other reader of the root's record is shown none of it |
| A restart with a candidate neither attended nor passed      | Given to the Watcher again                                 |
| The classifier's host unreachable                           | Facts and sweeps reach the Watcher; nothing else changes   |
| No classifier by choice: none in the template, or switched off | Nothing is asked and nothing is said; what code counts still reaches the owner above, a candidate and a sweep the one that watches |
| A team on a template with no classifier, through the plugin: an agent's call fails the same way a third time, the one that watches attends, and more work gathers | The candidate is sent to the agent that watches, its attention reaches the owner above the work, a sweep wakes it, and no call leaves the machine |
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
| A watch file that names its own test paths, what a brief's words ask of tests, what an assertion looks like and how many turns a finding may wait | A changed test line is told by those alone: a path the profile does not call a test is none, an assertion as it writes one is told at once, a brief that asks of tests as it says makes the change ordinary, and the finding is told at the turn it names |
| A name asked of the code, with the caller's own pattern of what a test is | Settled when a path that is no test by that pattern has it, at a revision or in a working tree |
| A profile that names a reflex file and no watch file         | Nothing is counted and nothing is clipped: no number of the plugin's stands in for one the profile did not give |
| A Peer changes an existing assertion where its brief asks nothing of tests | An attention to its Lead; another test line, a candidate |

## Editor

A template's files in, what a person sees out (`EDITOR.md`).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| The SLP profile opened                                      | A node for each role, skill, question and moment of its files and one for the Human; a wire for each `spawns`, each skill a role has, each role a moment watches and each role that may ask or tell the Human |
| The SLP profile opened                                      | Each role's ticked tools are exactly its `tools` in `profile.yaml`, in its node's groups or on a wire to it |
| Every tool a profile may give a role                        | In one of the editor's groups, and in one only                      |
| A template that names a skill, or a note for the project, it does not carry | Not opened, saying which                             |
| A template that keeps no positions opened                   | Every node placed, no two on top of each other; the nodes of a family no wire places share no row with another's, so each frame holds its own; the classifier and the two stacks on one row |
| SLP opened with nothing unfolded                            | On the canvas: its roles, the Human, the classifier and a report's sections; each role says how many skills, and how many tool groups and servers, are folded into it |
| A role opened; a role picked; a stack opened                | What is wired into the opened role is shown, a skill two roles have among it; picking opens nothing; the stack's family is shown |
| A skill no role has; a node that carries a note; a node picked from a list | Each shown, whatever is folded                        |
| A skill two roles have, one of them open; the same skill picked with both folded | Wired into the open role alone; wired into both, and the team's own wires drawn either way |
| What of a template is laid out                              | Not what sits beside a role, of which the role says how many there are; a stack for each family that folds; only the wires that place a node are followed |
| Two roles one role seats, each with more beside it than it is tall | Laid out far enough apart for each to open all of it          |
| A role's opened skills, tool groups and servers             | In a column at its left, clear of the role and of what is one rank before it, about the role's middle |
| A role's job changed to another, then to none; a job a role that seats others cannot leave | The old job's tools go and the new one's come, in one change; none leaves it no job; the last is not made, saying why |
| A template started from nothing under a name; under a name with no letter or digit | It loads as the plugin would load it: one role that is the root and may ask the Human, wired to the Human, and nothing else; its notes are an agent profile to name and a prompt to write, and none of a tool it lacks or is refused; the second is not started, saying why |
| The SLP profile packed with nothing changed, and opened again | Every file as it was, to the byte                                  |
| A template whose nodes were put somewhere, then saved       | The places are in `template.json` and in no other file; opened again, each node is where it was put |
| A file that is not a packed template                        | Not opened, saying so                                               |
| A tool unticked for one role                                | Gone from that role's tools, another role's unchanged; no other line of `profile.yaml` touched, every comment kept |
| A property switched on for a role, then off                 | Its groups appear with every tool ticked; switched off, the role's tools are as they were |
| The root switched on for a second role                      | The root moves there: a template has one                            |
| A role that hands out work switched to write too, and back; a role that reviews switched to write | The first has both properties and the tools it had, its job still to hand out work, and its node says both; the last is not made, saying a role that reviews or watches is nothing else |
| A change that would leave a template that does not load, such as `delegates` off for a role that seats others | Not made, saying why |
| A wire of each kind drawn, then cut                         | In the one file its kind is kept in, then gone                      |
| A role renamed                                              | Every `spawns` and every moment that named it follows, and its prompt's file |
| A role taken away                                           | Nothing names it, and its prompt is gone                            |
| A role added, then taken away                               | Every file as it was, to the byte                                   |
| A skill added, and another taken away                       | The new one is a node before any role has it; the other's folder is gone and no role has it |
| Steps set down, given roles and joined; then taken away      | `flow.md` holds a line a step in order, each with its role and what follows, and `profile.yaml` gains the one line that names it; with the last step gone, the file and that line are gone |
| SLP as it comes with the plugin                             | No note                                                             |
| A prompt naming a tool its role is not shown; a prompt naming a role the template lost; a watched role's prompt naming the watch; a prompt, skill or question still holding its skeleton; a skill named otherwise than its folder, not saying when to use it, or pointing at a file not beside it; a question asking of a field not in its state, or with one outcome described | Each a note on the node it is about |
| A writer not shown `hand_back`, a reader not shown `record_verdict`, a watching role not shown `attend`, a role that seats others not shown `open_scope` or `integrate`; a role shown `ask_human`, `attend` or `open_scope` that the kernel always refuses it; a role shown `report` in a template that names no section of one; a role nobody seats, one with no agent profile, one with no prompt | Each a note on the role |
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
| In the editor, the classifier taken away, put back by a route, the route said where it is served, a second added and taken away; a route named wrongly or twice, served over plain http elsewhere, or the last taken alone | No node and no `classifier` in the profile; a node again with that route; its host and model on the node; the files as they were; each refused, saying why |
| In the editor's checks, a question whose `when` sets what the plugin does not read; a moment that sets a `when`, or reads what a turn does not hold | A note on each, saying what the plugin does read |
| A template with no classifier, in the editor's checks; one with a route still its skeleton; one nothing is asked of | A note on each question and each moment a model would answer, and none on what code counts; a note on the classifier naming the route; a note that nothing is asked of it |

## Templates

What the plugin reads of a profile that a template adds (`TEMPLATE.md`).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Two profiles that differ in a skill, a file beside a skill, a question, a moment or a prompt | Different hashes; two that differ only in `template.json` or `NOTICE.md`, the same |
| A profile that names a flow and lists two docs of its own   | Every agent's standing instructions carry the flow after its role's prompt, and nothing after it; its first words point at each doc it lists and name no skill |
| A project that takes its profile's files anew; the same files again | `profile_taken` with their hash, which the state then has; nothing for the hash the record already has |
| A project opened                                            | On the record with the profile it runs, by name and by the hash of its files then |
| Two projects attached with different profiles, and the Human's rules kept for one of them | Each project's agents get their own profile's prompts; the rules reach only the agents of their profile; a profile nobody installed is not attached |
| A project attached; then the installed template changed and the plugin started again | The project runs the copy it took: an agent seated after reads the words as they were; its page says it is behind what is installed |
| Sync on a project whose installed template changed          | An agent seated after is made from the installed files; one seated before keeps its agent; the record has the new hash, once however often Sync is pressed |
| A role taken out of the installed template and the project synced while an agent sits in it; the template gains a role | The project runs on; a tool the agent calls is refused, saying its role is gone from the profile, and it still reads the record; `stuck` names its seat; the kernel seats the role gained |
| Sync when the template is no longer installed, or the installed one does not load | Refused, saying which; the project runs on as it was |
| A template removed from the machine; a name not installed, such as a path out of the profiles | No project is attached with it after; a project that runs it goes on, the plugin started again too; the second is refused |
| A project removed, then attached again                      | Its root is seated with an agent of its own: what Paseo keeps of the first attachment, archived under the same project and actor names, is never taken for it |
| A project attached again under another template's name      | It runs the one it was first attached with                          |
| A project's own copy changed by hand                        | Said on its page; when the project is next opened the record takes the hash of the files loaded; Sync puts the installed files back |
| A profile that names the file of its questions; and one that names none while a `reflex.yaml` lies in its directory | The questions are read from the file named; the second asks nothing |
| A profile that names the sections of its own a report has, and an agent given `report` | The agent is shown each section with what it holds, in the profile's order, and no other; its report reaches the owner above, the scope's record and a question asked on it under those names, in that order, a section left out not there at all |
| A report that names a section the profile does not have      | Refused, saying which sections a report has; nothing is recorded      |
| A question or a moment named as asked that its file does not write | The profile does not load, saying which                          |
| A small template that shares no role with SLP, read as the editor reads one | Draws no note                                       |
| The check command on a template's directory that loads      | Says the name it installs under, its roles and the agent profiles it needs; its notes are printed and it still passes |
| The check command on a directory that does not load         | Fails, saying why, and prints nothing else                          |
| The pack command                                            | The one file a template is shared as, holding the directory's very files; nothing is written for a template that does not load |
| A profile whose reflex file masks nothing of its own                  | What looks like a secret is still masked: the patterns are the plugin's |
| A template's classifier, on a machine whose key is for one of its hosts, then for the other, then for neither, then with no key | A brief is asked about at that host alone, with that route's model and body and the Human's key; for neither host or with no key nothing leaves, and the Human's surface says which hosts the template is served at |
| The same, switched off on the machine; and a template that names no classifier | Nothing leaves and nothing is said, whatever key the machine has |
| A classifier served over plain http anywhere but the machine itself, at a host not written plainly, or by no route | The profile does not load, saying why |
| A template read before it is installed                               | Each host its classifier is served at is listed with the model asked there |
| A plugin just installed, with nothing of the Human's yet     | The template that comes with it is listed as not installed; no project is attached, the reason saying to install one; installed from the plugin's own, it is listed as installed as it comes and a project attaches with it |
| An installed copy changed since, or a release that brings another | Said to differ, and left as it is until it is installed again, which the offer says replaces it |
| A name that is no template of the plugin's, such as a path out of them | Read from nowhere, saying so; nothing unpacked is left     |
| More than one profile installed and none named at attach; a project attached already opened again with none named | The first is refused, saying the page asks which; the second opens |
| A shared template read from a file on the machine           | What it would bring is said: its name, its roles, each agent profile its roles name and whether Paseo has it; nothing is installed and nothing unpacked is left |
| The template installed with the hash of what was read       | Under its name, listed to attach a project with; read again, it says it would replace the one there |
| The page of agent profiles read; then a name of an installed profile matched to an agent profile the Human has | Each name its roles give is listed with what it runs on and whether Paseo has that, beside the Human's own; the root's agent is made from the profile matched |
| A matching of a profile nobody installed, such as a path out of the profiles; of a name its roles do not give; or to an agent profile Paseo lacks | Refused whole, saying which; nothing kept |
| A matching whose file does not read                         | The page says so; the agent is not seated, with that reason on its seat, and nothing throws; matched again and reseated, the seat is taken |
| A name matched to an agent profile the Human has since removed | The page says Paseo lacks it; the agent is not seated, the reason naming the profile and the name matched to it |
| A template with one name matched to a profile Paseo has, one matched to a profile since removed and one Paseo has no profile for; the Human has them made on a provider, a model and an effort; then asks again | Only the name Paseo lacked is made, under its own name with that provider, model and effort; every profile Paseo held goes back as it was; the stale name runs on its own again and the matched one keeps its match, so nothing is left to match, and a name is still matched by itself after. Asked again, nothing is written |
| A Paseo that holds no agent profile; the Human has a template's made on a model with no effort named | Every name the template gives is made at once on that model, with no effort |
| Agent profiles asked for on a provider Paseo says is not available, on one it does not know, on a model the provider lacks, at an effort the model lacks, or for a template nobody installed | Each refused, saying which; nothing is written in Paseo |
| The models of a provider read for the page; of a provider Paseo does not know | Each with its label, its efforts, the one it starts on, and whether it is the provider's own; refused, naming the provider |
| The model and effort of one of the Human's agent profiles changed from the page; then to a model with no effort; then a profile Paseo lacks, a model the provider lacks, an effort the model lacks | That profile alone changes in Paseo, every other as it was; the effort is no longer named; each refused, and nothing written |
| The provider of one of the Human's agent profiles, which names a mode and feature values, changed from the page: first its model alone, then to another provider Paseo finds; then to a provider Paseo says is not available, one it does not know, and a model the new provider lacks | On the same provider the mode and the feature values stay; on another, the profile runs that provider's model and effort and names neither, and the page reads the provider back; each of the rest refused, and nothing written |
| Two projects on one template; one is given its own effort for a name, then its own provider and model, then nothing of its own; each time its root is seated again | Its agent is made at that effort with the rest of the Human's profile; then on that provider and model, without the profile's feature values; then as the profile runs. The other project's agent is made as the profile runs throughout, and nothing is written in Paseo |
| A project's own for a name its template does not give, for a name whose profile Paseo lacks, on a provider Paseo says is not available, on a model the provider lacks, at an effort the model lacks; and one read for a project not attached | Each refused, saying which; nothing is kept |
| What a project keeps of its own does not read; its root is seated again; then a name's own is picked again | The page says so; no agent is made, with that reason on the seat, and nothing throws; picked again it is kept, and the seat is taken at it |
| A Paseo agent profile that names no model, on the root's role; then the profile is given a model and the Human seats the root again | No agent is made, the seat says which profile names no model, and the page says the root has nobody seated and why, in the seat's own words, beside the project's base; seated again, it gets its agent on that model, nothing is stuck, and no reason is left to give |
| The page is shown what the names of a template run | Each with every role that names it, the profile it runs on, whether Paseo has it, and that profile's provider, model and effort |
| A Paseo that cannot say which providers it finds                | The page still reads what each name runs on, and offers no provider to make a profile on |
| A template installed again                                  | The matching of its name is as it was                               |
| A shared file that does not load, names a path outside its own directory, is not a packed template or is not there; and one changed since it was read | Refused, saying which; nothing installed, nothing written outside the state root |
| A role given an outside server, on an agent that takes one  | Made with the server beside the team's, its named tools approved ahead, each variable it names filled in; the team's server marked always loaded; a role given none has only the team's |
| A role whose server reads a variable that is not set        | Not seated; the reason names the server and the variable            |
| A role given an outside server, on an agent that cannot take one | Not seated; the reason names the server                        |
| A profile that gives a role a server it does not declare, or names one as the team's own | Does not load, saying which                |
| A shared template that declares an outside server           | What it runs is said, and each variable it reads with whether it is set, before anything is installed |
| In the editor, an outside server declared, said how to reach, given to a role with two tools and to a second with one of them and one more, one tool taken back, then the server taken away | A node, then a wire carrying the tools; a wire with no tool named is not drawn; the tools the template knows of it are every name either role is given, each once; taking a tool back changes one line; with the server gone every file is as it was to the byte |
| In the editor, an outside server fresh from its skeleton and given to no role; then one with a secret written in it | A note for each of the first two; a note that a secret belongs in a variable for the last |
| In the editor, a report section added, said what it holds, renamed, then taken away; a name that is not one, or is taken; the last section of a template taken away, and one added to it | A node after the others, in the order a report is read; saying what it holds and renaming it change its one line; taken away, every file is as it was to the byte; the two names are refused; with the last gone the profile names no `report`, and gains it again with the first |
| In the editor, a report section fresh from its skeleton     | A note on the section, gone once it says what it holds              |

## Gallery

Template directories in, what a page lists out (`TEMPLATE.md`, The gallery).

| Case                                                        | Expect                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| A gallery built from two template directories, one of them named as the plugin's own | An index naming each by its directory, with its name and tags and where it is from, the plugin's own as coming with Seatworks and the other as shared, and each as the one file it is shared as; a page reads back the very files |
| A template that does not load, or whose directory is not the name it would be installed under | Left out of the gallery, and said with why |
| A page with no gallery beside it; with a wrong index; with a listed template whose file is gone or does not load | The page says why; the card of that template says why |
| The build command on a directory of template directories    | The gallery written; with a template that does not load among them, it fails naming it and writes the rest |
| The build command on two directories of template directories; on the plugin's own `templates/` and another; then with a template of one name in both | The templates of both are listed, each as shared; SLP as coming with Seatworks and the other as shared; the one both hold is left out, saying where each is, and the build fails |
| The page built                                              | Every script and style it asks for is beside it, by a relative path, so it is served from any path, as a repository's own page is; the three families it is set in are files beside it, and no style asks another host for one |
