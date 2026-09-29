<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg" />
    <img alt="Seatworks" src="docs/images/logo-light.svg" width="440" />
  </picture>
</p>

# Seatworks

A [Paseo](https://paseo.sh) plugin that runs a team of coding agents on your project the **SLP** way.
You tell a **Supervisor** what you want. It splits the work into lanes; a **Lead** owns each lane and
splits it into tasks; each task gets a **Peer** of its own. The plugin carries the work, the mail and
the evidence between them, and brings you in for what only you can decide.

> **Pre-release.** Nothing has shipped: no releases, no compatibility promises.

<p align="center">
  <a href="docs/video/seatworks.mp4"><img alt="Play the film: Seatworks in 75 seconds" src="docs/video/poster.jpg" width="720" /></a>
  <br />
  <sub>▶ <a href="docs/video/seatworks.mp4">Seatworks in 75 seconds</a>: the plugin, the SLP seats, the desk, and a night of work</sub>
</p>

![Seatworks at a glance: you, the Supervisor, a Lead per lane with its Peers, review and the watch around them, and the desk under them](docs/images/overview.svg)

## How a piece of work goes

1. **You set the intent.** Start the Supervisor in your project and say what you want. Before new work
   starts, it asks you questions in numbered rounds, each with the answer it recommends, and writes
   what you settle about the project into its `CONTEXT.md`, which lives outside your repo. Then it
   reads the plan back: the lanes, what each must deliver, and what will wake you. What you settle for
   every lane becomes a standing order: the paths you want to see before they land, and where lanes
   work.
2. **The team works, and you may leave.** The Supervisor opens each lane with an outcome and
   acceptance criteria, keeping apart what must hold, what it chose and what nobody knows yet, and the
   plugin starts its Lead. Where a split would be blind, the Lead first has a Reviewer scout the
   code, then splits the lane into tasks by the files they change, each done by a Peer of its own on
   a branch of its own, with a brief in the same three parts. Where a doubt calls for a reader, it
   has a Reviewer, an Architect or an Auditor read the work, and accepts it, which merges it into the
   lane, sends it back or cuts it. A Peer whose evidence shows a premise or a choice of its brief
   does not fit challenges it, and whoever answers says why the plan changes or stands. A Lead with a
   question asks the Supervisor and carries on with its default meanwhile; a Peer asks its Lead, with
   its best guess. A Peer measuring holds the machine, so no gate runs under its numbers. A decision only
   you can make goes on your question queue, with the Supervisor's recommendation and what goes
   ahead while you are silent. A command that cannot be undone reaches the Supervisor at once, to
   hold the lane if it must.
3. **Lanes land on your base.** When a Lead reports its lane ready, the plugin runs your test
   command (the gate), and the rehearsal of each risk rule the lane's change reaches, where the rule
   has one. The Supervisor lands the lane: the plugin merges in your base if it moved, runs the gate
   on the result, and lands the lane on your local base branch. If a seat's turn is in the way, the
   landing becomes a standing order: the plugin lands the lane once that turn ends and tells the
   Supervisor LANDED, or NOT LANDED and why. A lane that touches a path you asked to see first waits
   for your approval.
4. **You come back to a report.** A card in the Supervisor's chat tells you, from the record and since
   you last marked it read: what needs you, what was decided for you, what went ahead on a
   recommendation, what landed. Pushing and releasing are yours while you are in the loop, and the
   Supervisor's while you are not, which the plugin runs for it and never forces; then a lane that
   audits the push runs beside the last lanes, checking each line of `CONTEXT.md` against what
   ships. Every seat's own `git` refuses to push.

![A lane, from open to landed, one step a row: who acts, and who the desk hands it to](docs/images/flow.svg)

## What it does, and what it doesn't

The plugin runs the team and keeps its record. Whether the work is right is always a seat's call, or
yours.

| It does                                                                                                                                     | It enforces                                                                                                                                                                           | It never does                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Starts one agent per seat, set up for its role                                                                                              | Tasks running side by side in a lane may not hold the same paths                                                                                                                      | Judge the work                                                             |
| Keeps a shared record of lanes, tasks, questions and incidents                                                                              | One writer per working copy                                                                                                                                                           | Tell a seat what the watch concluded about it                              |
| Carries mail between seats, each letter ending with what it asks of its reader, and holds it until its reader can take it, for up to 7 days | A red gate stops a task merging into its lane, unless its Lead accepts it over the gate with a reason, and a lane landing, unless the Supervisor lands it over the gate with a reason | Write your project's concept for you                                       |
| Keeps a durable record outside your repo                                                                                                    | A landing that touches a path you asked to see first waits for you                                                                                                                    | Write your project's files, but for the Seatworks block in its `AGENTS.md` |
| Watches Leads and Peers and tells the Supervisor what it sees                                                                               | Each role's permissions, where its agent allows it, and git commands only the desk runs                                                                                               | Push or release unless told to                                             |

## The team

SLP is not a chain of command: each role decides what is its own, and the plugin decides none of it.

![SLP: what the Supervisor, a Lead and a Peer each own, decide and never do](docs/images/slp.svg)

| Role       | Owns                                                                                                               | Starts and ends                                                                                                                | Default agent                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Supervisor | Your intent, across lanes: opens, lands and drops them, answers Leads, and is the only seat that asks you anything | You start it                                                                                                                   | Claude Code · `claude-opus-5` · high   |
| Lead       | One lane: its tasks, their order, and what is accepted                                                             | Started with its lane; stays after the lane closes until the Supervisor releases it                                            | Claude Code · `claude-opus-5` · medium |
| Peer       | One task, and the engineering judgement inside it                                                                  | Started with its task; stays after the task is accepted until its Lead releases it or the lane closes, and never takes another | Claude Code · `claude-opus-5` · medium |
| Reviewer   | A review of one change, or an answer on the lane's code (a scout before a split, a council lens), in its own copy  | Started with its review; ends when its Lead cuts the review or the lane closes                                                 | Claude Code · `claude-opus-5` · medium |
| Second reviewer | A Reviewer on another model, so two review lenses are not one model read twice                                | As the Reviewer                                                                                                                | Claude Code · `claude-sonnet-5` · medium |
| Architect  | A judgment on a hard design decision: the designs the code allows, what each costs, drops and adds                 | As the Reviewer                                                                                                                | Claude Code · `claude-opus-5` · medium |
| Auditor    | Whether a lane's tests and end-to-end runs prove what they claim, by running them and breaking the behaviour       | As the Reviewer                                                                                                                | Claude Code · `claude-opus-5` · medium |
| Watcher    | The watch's questions, one case at a time, when you choose a seat to answer them                                   | Started when a case first needs it; let go once no lane is open                                                                | The Peer's, until you set its own      |

Roles are data in `plugin/roles.json`, not code, and each has the tool set it names in
`plugin/mcp/tools.json`.

## Review

A Lead asks for a review when a doubt a reader can settle calls for one, not by rote: a scout's answer where a split
would be blind, a review of one task's change, a review of the whole lane where its tasks met in code nobody read
whole, a lens of a council, an Architect's judgment on a hard design, or an Auditor's run of the lane's proof. The
Report counts how many reviews changed the work, so one that seldom does can be dropped. The Reviewer works in a copy of its
own, proves each acceptance behaviour with a check it ran, rates every defect from P0 to P3 and changes nothing. Its
verdict is evidence: the Lead sends reproduced P0 to P2 back, carries P3 in its report, and decides.

![Review is evidence, not a verdict: what a Lead asks for, what the Reviewer does, and how the Lead weighs it](docs/images/review.svg)

## Supported agents

Any role can sit on any of these five agents. You pick one per role in the panel, with its model and
thinking level where the agent offers them.

| Agent       | Before its first seat                                                                                   | Sandbox |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------- |
| Claude Code | `claude` signed in once, outside any seat; every Claude seat shares that login                          | yes     |
| Codex       | `codex login` once; the `codex` CLI must be on the machine that runs the daemon                         | yes     |
| Pi          | `pi` signed in, and `pi install npm:pi-mcp-adapter` once: the adapter is how a Pi seat reaches the desk | no      |
| Oh My Pi    | `omp` signed in once, outside any seat (`/login`)                                                       | no      |
| OpenCode    | `opencode auth login` once, outside any seat                                                            | no      |

No agent is sent mail inside a running turn: a seat's letters wait for its turn to end, or come with
the reply to its next desk call, as one message that lists them first. Only holding a lane cuts a
turn short.

Every seat reads your project's own instructions: Claude Code reads `CLAUDE.md`, or `AGENTS.md` when
the project has no `CLAUDE.md`, and the others read `AGENTS.md`. Every seat's `PATH` refuses the
desk's git commands, `gh` and `paseo`. Claude Code, Codex, Oh My Pi and OpenCode seats are also
denied `git push`, `gh`, `paseo` and starting other agents by their own rules. Pi has no command
rules, so a Pi seat can start another agent: its `PATH` cannot refuse one, since its own agent
starts through that same `PATH`. A Codex Lead or Supervisor reads the project through a Codex
permission profile, which needs a Codex recent enough to have them (0.154 has).

The Supervisor speaks to you in the language set as the Human's language in the machine settings
(`language`), on every agent; every other seat writes English, which the watch reads best.

Gates, rehearsals and each copy's setup command share your machine's processors: at most half as
many run at once as it has, the rest waiting their turn, unless the machine settings say otherwise
(`gatesAtOnce`).

## Install

You need:

- Paseo `>=0.10.0`
- Node.js 24 or newer; there is no build step
- `git`
- `python3`, and optionally `jq` and the `ocr` CLI, for the Lead's `ultra-review` skill
- the CLI of each agent you use, signed in
- optionally `gh` (or the tracker `catalog/ecosystem.json` names under `issues`), to open a lane
  from an issue, and `uv`, for code search

```bash
cd plugin
npm install
paseo plugin install "$PWD"
```

Paseo remembers where the clone is. If you move it, install it again.

**Keeping it current.** The **Plugin** page, under Seatworks in Paseo's sidebar, shows the version that
runs and, once checked, the one on the clone's branch. **Update** only moves forward, runs
`npm install` when the packages changed, and reloads the plugin. It is offered only once no seat is
left in any project, idle ones included, because every project moves to the new version at once.
Seats started before this version are named, in each project.

**Clean up** lists seat folders, working copies and copies nothing uses any more, and removes only
what you pick.

## First run

1. In Paseo, open **Seatworks** in the sidebar.
2. **Add project**, pick the repository, choose an agent for each role, or start from a level, and
   attach. The levels, Cheap, Balanced and Max, are yours to set under **This machine › Defaults**:
   each gives some roles an agent and model, and a project copies the one you pick. Attaching puts a
   Seatworks block, between `<!-- seatworks:begin … -->` and `<!-- seatworks:end -->`, at the end of
   the project's `AGENTS.md`, and every seat also gets it through its agent's own instructions. Commit
   it: the Supervisor is told whenever attaching changes it, and a lane in your checkout does not
   land over a tracked file with uncommitted changes.
   Attaching also opens the project in Paseo's own project list, and gives Paseo one provider for each
   role and the agent your team gives it there; they follow your settings, and go once no attached
   project uses them.
3. Open **Health** and choose **Run**.
4. In Paseo, open that project, start an agent with the Supervisor's provider, such as
   **Supervisor · Claude Code (sw2)**, and tell it what you want.

The plugin starts everyone else as the work needs them. A lane works in your checkout on a new
branch, unless the Supervisor or your standing order (`laneHome`) keeps it on the branch you are on or
gives it a working copy of its own. Your checkout holds one lane at a time, so a lane opened meanwhile
takes a copy of its own or waits its turn. When neither has said, and your checkout has uncommitted
work or is on a branch other than the base, the lane takes a copy of its own, and the Supervisor is
told this was decided for it.

**Your project's files stay yours.** The plugin writes nothing into them but the Seatworks block, and
everything it keeps lives under `~/.local/share/seatworks-v3/`.

## When the team needs you

Whether you are in the loop is one switch, `hitl.on`, off by default. In the loop or out of it, a
change to what a lane is for, or its spend past the appetite it was opened with, is yours: the
Supervisor asks you.

![The Human in the loop is one switch: what reaches you in the loop, and what the Supervisor decides out of it](docs/images/hitl.svg)

Seatworks plugs into Paseo's own places rather than a screen of its own:

- **The Supervisor's chat** is where you meet the work. A question for you is a card drawn like
  Paseo's own question: its choices, the Supervisor's recommendation first, and what goes ahead while
  you are silent. A question that can be undone goes on with the recommendation at once, a costly one
  until its lane reports ready, and one that cannot be undone holds its lane now. Choose, decline or
  withdraw it, with a note if you like. A landing held for you is a card with the desk's evidence
  first; approve it and it lands, send it back and your note goes to the Lead. A card turns into one
  line where it stands once it is settled. The report card is read from the record and written by no
  agent, from where you last marked it read: what needs you, what was decided for you (pushes and
  tags, merges and landings over a red gate with their reasons, permissions given or refused, asks a
  Lead settled when nobody answered, the Supervisor's own choices and what each Lead decided or
  assumed), each challenge the plan was kept against and why, your own words to a Lead or Peer and
  whether they reached the plan, what went ahead on a recommendation, what landed, what could not be
  undone, how often your answers took the recommendation and how fast, how many of a review's
  findings the next review found resolved, how many reviews changed the work and challenges changed
  the plan, the asks Leads sent up by kind, and what each lane spent, as its agents report it.
- **A pill above every seat's chat** counts what waits for you in its project, and opens the same
  cards, so you can answer from whichever chat is open.
- **The Team tab**, beside Files and Changes, is the team at a glance: a line a lane, with what it is
  doing or who it waits on, opened to its seats, each task with the brief it works to; a seat opens
  its chat.
- **The Seatworks page** in Paseo's sidebar is for setup only: your projects, **Add project**, and for
  each project **Team** (an agent per role, the watch, and whether you are in the loop), **Rules**
  (the paths you see first, the risk rules, where lanes work, and `CONTEXT.md`, read only: you change
  them by telling the Supervisor), **MCP** (optional servers, the roles that get each, and their
  settings) and **Health**, which checks itself.

You can also answer a question in the Supervisor's chat, and it records your answer in your own words.
You may type into any seat's chat: what you write to a Lead or a Peer is passed on to the Supervisor.
The Supervisor can stop a lane at once with a hold, until it resumes the lane, and while you are in
the loop asks you at most three questions a day across all projects (`questionsPerDay`).

## The watch

The watch only sees and reports; what to do about it is the Supervisor's. It reads three things:
each Lead's and Peer's new thinking, words and calls, every few minutes while it works and when its
turn ends; each decision a seat makes through the desk, as it makes it (an accept, a sending-back, a
ready report, a brief, a review's verdict); and each lane's record.

Code turns what it can count or match into facts: a destructive command, a secret, data sent off the
machine, a test that lost its assertions, going round in circles, a task sent back again and again,
an accept with nothing read since the hand-back, a review that accepted with nothing run, a lane
reported ready with no push-back from any seat. What takes judgement goes to the brains, which ask
the new text one condition at a time from a catalog of patterns (`catalog/patterns.json`): a Lead
settling how the system is built, a Peer struggling with what something means or building a stand-in
for something missing, an agent dropping its approach or saying it was wrong, a brief that tells a
Peer how, a decision against a line of `CONTEXT.md`. On the Watcher's chip in **Team** you pick the
brains: Jev, a small model asked over OpenRouter with your key, which stays on this machine and is
never shown again; the Watcher seat; both, where Jev sifts and the seat judges only what it flagged;
or none, which leaves the code's facts.

Everything the watch finds becomes an **incident** and goes to the Supervisor, which decides whether
and how to step in: nothing, one open question, a council, a hold, or you. There is no switch per
signal: the Supervisor marks each incident `useful`, `noise` or `unknown`, and a kind it marked noise
is not told again about the same seat and task. The seat an incident is about never hears of it, and
the watch speaks to no one else. The brains' questions and answers are kept in the project's
`assessments.log`. [ANTIPATTERNS.md](docs/ANTIPATTERNS.md) lists the ways a team of agents goes
wrong and which of them the watch catches.

![The watch sees and reports: what it reads, how it reads it, and who decides](docs/images/watch.svg)

## Known Paseo behaviour

- **Opening an archived seat's history starts its agent again, and leaves it running.** Paseo resumes
  an archived agent to show its history, from the app or `paseo logs`, and never closes it. A Pi seat
  leaves a `pi` process, an Oh My Pi seat an `omp` one, an OpenCode seat an `opencode serve`. The
  plugin never reads an archived seat itself. To be rid of them, with no seat of yours running:
  `pkill -f "pi --mode rpc"`, `pkill -f "omp --mode rpc-ui"` or `pkill -f "opencode serve"`.
- **An agent gets only the provider keys Paseo's daemon has.** A key set in your shell, such as
  `NVIDIA_API_KEY` for Pi, does not reach the daemon, so those models are neither listed nor usable.
  Put the key where the agent keeps its own (`~/.pi/agent/auth.json` for Pi).
- **Paseo keeps a project for a folder you have deleted.** List them with `paseo project ls` and remove
  one with `paseo project delete <id>`.

## How it is built

One plugin inside Paseo's daemon. Each seat is an agent in a directory of its own, and reaches the desk through its
team MCP server over one socket; the desk keeps the record outside your repository and runs git for everyone.

![How it is built: the Paseo app, the seats, the plugin inside the daemon, and what is kept on disk](docs/images/architecture.svg)

## Development

```bash
cd plugin
npm run check
```

This type-checks the code and runs every test. Don't launch seats to test a change: they are real
agents, with real permissions, and they cost money.

## Docs

| Read                                    | When you want                                                         |
| --------------------------------------- | --------------------------------------------------------------------- |
| [ANTIPATTERNS.md](docs/ANTIPATTERNS.md) | How a team of agents goes wrong, and which of those the watch can see |
| [AGENTS.md](AGENTS.md)                  | The rules this code follows, before you change it                     |

## License

MIT, see [LICENSE](LICENSE). [NOTICE.md](NOTICE.md) lists where the shipped skills come from.
