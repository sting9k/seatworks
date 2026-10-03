<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/logo-dark.svg" />
    <img alt="Seatworks" src=".github/logo-light.svg" width="440" />
  </picture>
</p>

<p align="center"><b>A team of coding agents in Paseo, working the way you choose.</b></p>

Seatworks is a plugin for [Paseo](https://paseo.sh). It lets several coding agents work on one repository as a team:
each owns a piece of the work, each lane of it done in a worktree of its own, and what is handed back is taken in
only on evidence.

The plugin does not decide how the team works. It keeps the record of who owns what and why, refuses the few things
that would break that record, carries what agents say to each other, and runs git, checks and agents for them. How
the team is arranged and what each role is told (its prompt, its skills, the questions asked of its work) is a
**template**: plain files you install, change or replace without touching the plugin. The tools every team is given,
and what they say, are the plugin's. **SLP** is the template that comes with it.

> **Status: in testing.** Nothing has shipped. The tests run against a stand-in for Paseo; Claude Code and Pi have
> been run as real agents, Codex and OpenCode have settings shipped and have not. Read
> [What to expect](#what-to-expect).

## SLP, the template that comes with it

You talk to one agent, the **Supervisor**. It works out with you what the project should do, splits the work into
lanes and lands what is done. Each lane has a **Lead** that plans it and answers for it, and **Peers** that each
write one task. A **Reviewer** reads a commit when a Lead wants evidence, and the **watch** tells an owner when one
of its agents needs a look.

| Who        | Owns                                                                        | Never                                     |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| You        | What the project is for, what must hold, what it may cost                   |                                           |
| Supervisor | Your intent turned into lanes, what happens where lanes meet, landing       | Writes code or decides a technical result |
| Lead       | One lane: its plan, who writes what, weighing what comes back, acceptance   | Writes in what it gave a Peer             |
| Peer       | One task, and the engineering judgement inside it; may argue with its brief | Writes outside its paths                  |
| Reviewer   | Nothing: its verdict on one commit is evidence the Lead weighs              | Changes the work                          |
| Watcher    | Nothing: it tells an owner when one of its agents needs a look              | Speaks to the agent it watches            |

A piece of work goes like this:

1. **You bring work.** The Supervisor asks until nothing you care about is assumed. Your answers become the plan's
   lines, marked as yours.
2. **Lanes open**, one per independent outcome, and each Lead briefs its Peers. A lane has one worktree, made by
   Paseo on a branch of the lane's own, and its Lead and Peers work in it together; the Supervisor stays in the
   project's own folder.
3. **A Peer hands back a commit.** The project's checks run on it. It raises a finding when the code contradicts its
   brief, and may refuse its Lead's framing with evidence.
4. **Work is taken in on evidence.** A Lead integrates a task by citing evidence on that very commit, and the
   Supervisor lands a lane the same way.
5. **You are asked only what is yours:** a change to what a lane is for or what it may cost, and a permission an
   agent asks for. The rest is decided by the team and listed for you as decided, open to question.

## Requirements

- Paseo `0.10.0` or newer, with its daemon running.
- Node.js `22.13` or newer, with npm, where the daemon runs: Paseo builds the plugin with npm.
- git.
- A Paseo agent profile for each name the template's roles use; Seatworks makes those you lack, on your press (below).
- Optional: a key for the template's **classifier**, the small model its watch asks one question at a time. SLP names
  Jev, served through OpenRouter or TypeSafe's own API. Without a key the team still works, less watched, and you are
  told; you may also switch it off, or take it out of the template.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/sting9k/seatworks/main/install.sh | sh
```

`install.sh` checks git, Node, npm and Paseo, adds the plugin to Paseo from this repository and says what to do next.
Run again once installed, it says whether a newer release is out.

```sh
sh install.sh --ref <branch|tag|commit>   # another branch or release
sh install.sh --dir <path>                # a checkout on this machine
```

Until the branch `open-templates` is merged into `main`, what this README describes is on that branch only:

```sh
curl -fsSL https://raw.githubusercontent.com/sting9k/seatworks/open-templates/install.sh | sh -s -- --ref open-templates
```

Paseo does not remember the branch an install came from. Until the merge, `paseo plugin update seatworks` and the
Updates tab's check both point at `main`, which is older: update with
`paseo plugin update seatworks --ref open-templates`.

Then, in Paseo:

Open Seatworks in the sidebar. A strip at the top of its page shows the four steps and which are done.

1. **Install a template.** On the Templates tab, read SLP and install it. Nothing runs until a template is
   installed.
2. **Give it agent profiles.** On the same tab, open the template. One press creates in Paseo an agent profile
   for each name it gives that you do not have yet, on the provider, model and effort you pick; nothing you already
   have is touched. Each name is a line that says what it runs: pick another provider, model or effort on it, or
   from the dots at its end run it on an agent profile of yours instead. What is set here is the default for every
   project; a project can run a name its own way from its own page.
3. **Set a key for the template's classifier**, if you have one, on the Classifier tab, or switch it off there.

SLP names one for each role: `slp-supervisor`, `slp-lead`, `slp-peer`, `slp-reviewer` and `slp-watcher`.

SLP's Reviewer reviews by rule with [Open Code Review](https://github.com/alibaba/open-code-review) where it finds
it, and by the diff alone where it does not. To have it:

```sh
npm install -g @alibaba-group/open-code-review
```

It asks no model and needs no key of its own: it picks the files and the rules, and the Reviewer reads. A project's
own review rules go in `.opencodereview/rule.json` in its repository.

## Using it

- **Attach a project.** On Seatworks' page, the Projects tab lists every project you have in Paseo and takes any
  folder by its path. One with no git yet is set up there: it says what a first commit would hold, then makes it.
  Attach with the template the button names, or run "Open a Seatworks team here" from the command center in a
  workspace. That seats the template's first agent; talk to it in its chat.
- **A project's own page** opens from its line under Projects. **Overview** says what is stuck, in words, seats
  the first agent again when it could not be made and says why, answers what waits on you, and shows the team, what
  it spent and what happened lately. **Agents** is what each agent profile runs in this project: the Templates tab
  sets the default, and here one project runs a name at its own effort, model or provider, for agents seated from
  then on. **Settings** holds its template and Sync, its checks, and where it is published: a project with no
  remote can be put on GitHub there, private or public, through GitHub's `gh` under the account you signed it in
  as.
- **The pill** on every chat of a team says the most pressing thing: what is stuck, what needs you, a held team,
  or how many agents are working. Its popover answers what waits on you, shows the team, holds or resumes it, and
  sends a word to the first agent. The same three are typed as `/team`, `/team-hold` and `/team-resume`.
- **The Team tab**, beside Files and Changes or as a tab of the workspace, has three tabs of its own: **Team** (every
  seat on a line, with one word for what it is doing now; a press opens its chat), **Needs you** (questions,
  permissions, heads-ups and work that is ready, answered in place) and **Record** (what agents decided for you, what
  is still disputed, your words not yet carried in, and what happened lately). A Team button in the workspace's
  header opens it.
- **Permissions** an agent asks for reach you on Needs you. Answering one in the agent's own prompt works too.
- **Seatworks' page** is set-up and upkeep, a job a tab: **Projects** (attach one, sync its template, remove it),
  **Templates** (install, remove, match agent profiles), **Classifier**, **Clean up** and **Updates** (updating is
  Paseo's `paseo plugin update seatworks`). Clean up sorts what teams left behind by what removing it costs: what is
  safe comes picked, a branch whose commits are on no other is yours to pick, and a copy holding uncommitted work
  is never removed. Only what you pick and confirm goes.

## What it writes into your repository

- **A note in `AGENTS.md`**, between the plugin's markers, committed on your base branch as a commit of that file
  alone, so every agent in the repository, the team's or your own, knows the team is there. It never writes over a
  file you are editing; the note waits until you commit.
- **Branches** under `sw/<project>/`, one per lane, each checked out in a worktree Paseo makes and keeps where it
  keeps its own, never in your checkout. No agent makes, merges or deletes them, the plugin does: a git guard on
  every agent refuses push, pull, checkout and the like.
- **What the template's agents keep.** For SLP: `GLOSSARY.md`, the words the project is spoken of in, and
  `docs/adr/`, each written by the agent whose work settled it, in the commit it explains. While the team runs, the
  plugin commits nothing more than the note: your base moves only when work lands.
- **A map, when you remove the project.** For SLP `docs/seatworks/MAP.md`: where the project was going, what had to
  hold and what was chosen, the words settled, and each piece of work that landed with what its owner reported. It is written once,
  from the record, so that what the team knew stays with the repository.

Removing a project leaves the map, takes the note out, archives its agents, deletes its copies and branches, and
sets its record aside until you delete it too.

## Templates: a way of working of your own

A template is a directory of text. Roles are data: nothing in the plugin's code knows a role's name, and making a
template never needs a change to the plugin.

```text
<template>/
  template.json            its name, description and tags
  profile.yaml             the roles: what each is, may call and runs on; a report's sections; outside tool servers
  roles/<role>.md          a role's prompt, read every turn
  skills/<skill>/SKILL.md  a skill, loaded when its description fits; the description is read every turn
  flow.md                  the team's flow, read every turn
  project.md               the note kept in an attached project's instruction file
  reflex.yaml              questions asked of the record's events
  watch.yaml               moments in an agent's turns that an owner is told of
  NOTICE.md                the outside sources its files draw on
```

What a template may do:

- **It arranges and words; it never refuses.** It says who is seated, what each may call, and what each reads. It
  cannot add a required phase, section or review.
- **It brings no code.** What it adds to an agent's reach is an outside tool server, which you are shown before you
  install it.
- **The core's names stay.** The tools and the nouns (scope, brief, plan, finding, evidence) are the plugin's.
- **Every agent reads the record** (`status`, `record`, `diff`, `look`) whatever its role is given. The other 33
  tools are a role's only when its template lists them.

To make one:

- **Start from one that works.** [`templates/slp/`](templates/slp) is SLP whole, and
  [`test/templates/pair/`](test/templates/pair) is a small one of three roles. [`spec/TEMPLATE.md`](spec/TEMPLATE.md)
  says what each file is, [`spec/KERNEL.md`](spec/KERNEL.md) §2 what a role's properties and tools mean, and
  [`spec/REFLEX.md`](spec/REFLEX.md) and [`spec/WATCH.md`](spec/WATCH.md) how a question and a moment are written.
- **Or draw it.** `npm run editor` opens a template as a graph of nodes and wires, or starts one from nothing:
  change it, read its notes, export.
  The same editor, with the templates others have shared, is at https://sting9k.github.io/seatworks-gallery/.
- **Check and pack it** from a checkout of this repository:

  ```sh
  npm run template -- check <dir>          # does it load, what it needs of a machine, and its notes
  npm run template -- pack <dir> <file>    # the same check, then the one file it is shared as
  ```

Either way you get one file, `<name>.template.json`. On the Templates tab of Seatworks' page, give its path: you are
shown what it brings (its roles, the agent profiles it names, any outside tool server it starts) before it is
installed. To share one, open a pull request on
[`sting9k/seatworks-gallery`](https://github.com/sting9k/seatworks-gallery).

A project runs a copy of the template it was attached with, for its whole life. Nothing you install or change later
reaches a running team until you press **Sync** on that project's own page, under its Settings; agents seated from then on are made from the
new files, and an agent already seated keeps what it started with. A template can be removed from the machine, and
projects that run it go on.

Rules of your own that should hold whatever the template says, such as how you want code written, go in
`rules/<template>/` under the plugin's state directory (`~/.local/share/seatworks/rules/slp/` for SLP): `all.md` for
every agent, `<role>.md` for one role. Each agent made from then on reads them after its role's prompt.

A team's agent works from a room of its own under the plugin's state directory, not from your home. It has your
login and its role's skills, which it loads itself when one fits its task. It has none of your own skills, plugins,
servers or settings for that agent, and none of the skills and extra tools the agent ships with. What your Claude
Code, Codex or Pi needs in order to run at all, a key or a provider's address, goes on that provider in Paseo's own
settings, whose `env` every agent of it is given.

## What to expect

- Agents are real and cost real money. Watch the first lanes, and set an appetite with the Supervisor.
- **Agents.** Claude Code and Pi have been run in a team. Codex and OpenCode (version 2) have their settings and
  have not been run. Nothing is shipped for any other, Oh My Pi among them: Paseo refuses to make an agent of any
  other kind with the team's tools.
- **Mail waits for a pause.** What is sent to an agent in the middle of a turn is delivered when the turn ends,
  everything waiting as one message. A template may let some of it in sooner, and SLP does: on Claude Code and Pi,
  what cannot wait (a direction, anything you say, an answer the agent asked for) enters between two of its steps,
  and a question from below once it has waited two minutes. On Codex and OpenCode everything still waits for the
  turn's end. Only you can stop a turn, with Paseo's own stop.
- **A lane's worktree is Paseo's.** Paseo makes it and then runs the repository's own set-up there, in the
  background (`worktree.setup` in its `paseo.json`). A worktree has no `node_modules` or `.env` unless that set-up
  or the project's checks put them there. Say so when the checks are set.
- What the plugin keeps (the record, settings) has no stable format yet: a new release may start it over, and a
  project attached under an older build is removed and attached again.
- Something wrong? `~/.paseo/daemon.log` has what the plugin said, and the Activity tab what the team did.

## Building Seatworks

```sh
npm ci
npm run check    # typecheck, lint, format check and every test; run before every commit
npm run format   # lays the code out as Prettier wants it
npm run editor   # the template editor, with a gallery built from templates/
```

There is no CI and no build step. Tests run against a stand-in for Paseo and never start a real agent; a change that
rests on what Paseo does is run once on a daemon started for it, never on the one you work in.

| Where              | What                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `AGENTS.md`        | The rules for whoever changes this repository, human or agent. Read it first.                     |
| `concept/`         | CONCEPT-V2 and the orchestration analysis: the standard the plugin serves                         |
| `spec/`            | What to build: the kernel's contract, the ports, Paseo's facts, templates, the conformance cases  |
| `shared/`          | The kernel (pure TypeScript: decide, evolve, react) and the zod contracts                         |
| `server/`          | The bridge to Paseo and the satellites that do I/O: store, agent host, workspaces, evidence, delivery |
| `client/`          | What you see in Paseo                                                                             |
| `bin/`, `harness/` | The git guard, the team's MCP server, the template check; each agent's shipped settings           |
| `templates/slp/`   | SLP: everything its agents read                                                                   |
| `editor/`          | The template editor, a web page of its own                                                        |
| `test/`            | The conformance cases as tests, and the stand-in for Paseo they run against                       |
| `.claude/skills/`  | Recipes for building Seatworks: kernel changes, satellites, Paseo's boundary, tests               |

## License

MIT, in [`LICENSE`](LICENSE). What agents read draws on other work, credited in [`NOTICE.md`](NOTICE.md).
