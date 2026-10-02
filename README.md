<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/logo-dark.svg" />
    <img alt="Seatworks" src=".github/logo-light.svg" width="440" />
  </picture>
</p>

<p align="center"><b>A team of coding agents in Paseo, working the way you choose.</b></p>

Seatworks is a plugin for [Paseo](https://paseo.sh). It lets several coding agents work on one repository as a team:
each owns a piece of the work, writes in a copy of its own, and what it hands back is taken in only on evidence.

The plugin does not decide how the team works. It keeps the record of who owns what and why, refuses the few things
that would break that record, carries what agents say to each other, and runs git, checks and agents for them. How
the team is arranged, and every word its agents read, is a **template**: plain files you install, change or replace
without touching the plugin. **SLP** is the template that comes with it.

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
| Lead       | One lane: its plan, who writes what, weighing what comes back, acceptance   | Writes code                               |
| Peer       | One task, and the engineering judgement inside it; may argue with its brief | Writes outside its paths                  |
| Reviewer   | Nothing: its verdict on one commit is evidence the Lead weighs              | Changes the work                          |
| Watcher    | Nothing: it tells an owner when one of its agents needs a look              | Speaks to the agent it watches            |

A piece of work goes like this:

1. **You bring work.** The Supervisor asks until nothing you care about is assumed. Your answers become the plan's
   lines, marked as yours.
2. **Lanes open**, one per independent outcome, and each Lead briefs its Peers. Every Peer works on its own branch in
   its own worktree.
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
- A Paseo agent profile for each name the template's roles use (below).
- Optional: a key for **Jev**, the small model the watch asks one question at a time, through OpenRouter or
  TypeSafe's own API. Without it the team still works, less watched, and you are told.

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
Plugin page's check both point at `main`, which is older: update with
`paseo plugin update seatworks --ref open-templates`.

Then, in Paseo:

1. **Install a template.** Open Seatworks in the sidebar, then Plugin. Under Templates, install SLP. Nothing runs
   until a template is installed.
2. **Match its agent profiles.** Under Agent profiles on the same page, match each name the template gives to an
   agent profile you already have, or create one of that name in Paseo's settings. Give each an explicit model.
3. **Set Jev's key**, if you have one, under Settings, Jev.

SLP names these:

| Profile                    | Used by                                     |
| -------------------------- | ------------------------------------------- |
| `slp-supervisor`           | the Supervisor                              |
| `slp-lead`                 | Leads                                       |
| `slp-peer`, `slp-peer-alt` | Peers; the second lets blind designs differ |
| `slp-reviewer`             | Reviewers (they may also use `slp-peer`)    |
| `slp-watcher`              | the Watcher                                 |

Different models for `slp-peer` and `slp-peer-alt` are the point: one model asked one hard question twice tends to
give one answer.

## Using it

- **Attach a project.** On Seatworks' page, attach one of your Paseo projects, or run "Open a Seatworks team here"
  from the command center in a workspace. That seats the template's first agent; talk to it in its chat.
- **A project's page** has four tabs: **Needs you** (questions and permissions waiting on you), **Lanes** (each
  lane's state and what is still owed in it), **Decided** (what agents decided for you) and **Activity**.
- **The Team panel** beside a workspace shows the same lanes, and a pill in each agent's chat counts what waits on
  you.
- **Permissions** an agent asks for reach you on Needs you. Answering one in the agent's own prompt works too.
- **The Plugin page** installs and removes templates, matches agent profiles, checks for a newer release (updating
  is Paseo's `paseo plugin update seatworks`) and cleans up: copies and branches no open work uses, agents whose
  seat ended, whole projects. Only what you pick and confirm is removed, and a copy holding uncommitted work never
  is.

## What it writes into your repository

- **A note in `AGENTS.md`**, between the plugin's markers, committed on your base branch as a commit of that file
  alone, so every agent in the repository, the team's or your own, knows the team is there. It never writes over a
  file you are editing; the note waits until you commit.
- **Branches** under `sw/<project>/`, one per lane and task, in worktrees under the plugin's state directory, never
  in your checkout. Only the plugin makes, merges and deletes them; a git guard on every agent refuses push, pull,
  checkout and the like.
- **What the template's agents keep.** For SLP: `GLOSSARY.md`, the words the project is spoken of in, and
  `docs/adr/`, each written by the agent whose work settled it, in the commit it explains. While the team runs, the
  plugin commits nothing more than the note: your base moves only when work lands.
- **A map, when you remove the project.** For SLP `docs/seatworks/MAP.md`: where the project was going, what had to
  hold and what was chosen, the words settled, and each landed lane with what its owner reported. It is written once,
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
  skills/<skill>/SKILL.md  a skill, read when it applies; its description is read every turn
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
- **Or draw it.** `npm run editor` opens a template as a graph of nodes and wires: change it, read its notes, export.
  The same editor, with the templates others have shared, is at https://sting9k.github.io/seatworks-gallery/.
- **Check and pack it** from a checkout of this repository:

  ```sh
  npm run template -- check <dir>          # does it load, what it needs of a machine, and its notes
  npm run template -- pack <dir> <file>    # the same check, then the one file it is shared as
  ```

Either way you get one file, `<name>.template.json`. Under Templates on the Plugin page, give its path: you are
shown what it brings (its roles, the agent profiles it names, any outside tool server it starts) before it is
installed. To share one, open a pull request on
[`sting9k/seatworks-gallery`](https://github.com/sting9k/seatworks-gallery).

A project runs a copy of the template it was attached with, for its whole life. Nothing you install or change later
reaches a running team until you press **Sync** on that project's page; agents seated from then on are made from the
new files, and an agent already seated keeps what it started with. A template can be removed from the machine, and
projects that run it go on.

Rules of your own that should hold whatever the template says, such as how you want code written, go in
`rules/<template>/` under the plugin's state directory (`~/.local/share/seatworks/rules/slp/` for SLP): `all.md` for
every agent, `<role>.md` for one role. Each agent made from then on reads them after its role's prompt.

## What to expect

- Agents are real and cost real money. Watch the first lanes, and set an appetite with the Supervisor.
- **Agents.** Claude Code and Pi have been run in a team. Codex and OpenCode (version 2) have their settings and
  have not been run. Nothing is shipped for any other, Oh My Pi among them: Paseo refuses to make an agent of any
  other kind with the team's tools.
- **A message never lands inside an agent's turn.** It waits, and everything waiting is delivered as one message
  when the turn ends. Only you can stop a turn, with Paseo's own stop.
- The plugin makes worktrees with git, not through Paseo's worktree setup, so a copy has no `node_modules` or `.env`
  until the project's checks install them. Say so when the checks are set.
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

There is no CI and no build step. Tests run against a stand-in for Paseo and never start a real agent.

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
