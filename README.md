<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg" />
    <img alt="Seatworks" src="docs/images/logo-light.svg" width="440" />
  </picture>
</p>

<p align="center"><b>A team of coding agents in Paseo, working the SLP way.</b></p>

Seatworks is a plugin for Paseo. You talk to one agent, the **Supervisor**. It works
out with you what the project should do, splits the work into lanes, and lands what is done. Each lane has a **Lead**
that plans it and answers for it, and **Peers** that each write one task in a copy of their own. A **Reviewer** reads a
commit when a Lead wants evidence, and the **watch** tells an owner when one of its agents needs a look.

The plugin does not decide how the team works. It keeps the record, checks the few things that must hold, carries
what agents say to each other, and runs git, checks and agents for them. The agents decide what to build and how,
from prompts and skills that are plain files you can replace.

> **Status: in testing.** Nothing has shipped yet. The test suite runs against a stand-in for Paseo; the first runs on
> a real Paseo are happening now. Expect rough edges, and read [What to expect](#what-to-expect).

## Who does what

| Who        | Owns                                                                             | Never                                        |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| You        | What the project is for, what must hold, what it may cost                        |                                              |
| Supervisor | Your intent turned into lanes, what happens where lanes meet, landing            | Writes code or decides a technical result    |
| Lead       | One lane: its plan, who writes what, weighing what comes back, acceptance         | Writes code                                  |
| Peer       | One task, and the engineering judgement inside it; may argue with its brief     | Writes outside its paths                     |
| Reviewer   | Nothing: its verdict on one commit is evidence the Lead weighs                   | Changes the work                             |
| Watcher    | Nothing: it tells an owner when one of its agents needs a look                    | Speaks to the agent it watches               |

Authority runs along each role's own axis, not down a chain of command. A Peer may refuse its Lead's framing with
evidence, and keeping a plan needs a reason as much as changing it does.

## How a piece of work goes

1. **You bring work.** The Supervisor asks until nothing you care about is assumed: numbered rounds, each question with
   its recommended answer. Your answers become the plan's lines, marked as yours, and settled words become the
   project's glossary.
2. **Lanes open.** One per independent outcome. Whatever several lanes will meet on (a shape, a contract, a record)
   goes first. Each Lead gets a directive that keeps apart what must hold, what was chosen, and what nobody knows yet.
3. **Tasks run.** The Lead briefs Peers the same way. Each Peer works on its own branch in its own worktree. It raises
   a finding when the code contradicts its brief, and hands back a commit with each behaviour beside what proves it.
4. **Evidence, not claims.** The project's checks run on every hand-back. A Lead integrates a task only by citing
   evidence on that very commit; a red result needs a reason. The Supervisor lands a lane the same way.
5. **You are asked only what is yours:** a change to what a lane is for or what it may cost, and a permission an
   agent asks for. Everything else is decided by the Supervisor or a Lead, and listed for you as "decided for you".
6. **Looking back.** From the record, the Supervisor reads how each finding changed the work and five signals of how
   the team is doing, and proposes at most one change, usually taking something away.

## Requirements

- Paseo `0.10.0` or newer, with its daemon running.
- Node.js `22.13` or newer, with npm, where the daemon runs. Paseo builds the plugin with npm.
- git.
- A Paseo agent profile for each role, named below. Claude Code and Pi are the agents with settings shipped for them.
- A key for **Jev**, the small model the watch asks one question at a time, through OpenRouter or TypeSafe's own
  API, set on the plugin's settings page. Without it the team still works, less watched, and you are told.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/sting9k/seatworks/main/install.sh | sh
```

`install.sh` checks git, Node, npm and Paseo, adds the plugin to Paseo from this repository, and lists the Paseo agent
profiles the roles run on. Run it again later and it tells you whether a newer release is out.

```sh
sh install.sh --ref <branch|tag|commit>   # install another branch or release
sh install.sh --dir <path>                # install a checkout on this machine
```

Then, in Paseo's settings, create an agent profile for each name the roles use, with the agent and model you want:

| Profile                        | Used by                                   |
| ------------------------------ | ----------------------------------------- |
| `slp-supervisor`               | the Supervisor                            |
| `slp-lead`                     | Leads                                     |
| `slp-peer`, `slp-peer-alt`     | Peers; the second lets blind designs differ |
| `slp-reviewer`                 | Reviewers (they may also use `slp-peer`)  |
| `slp-watcher`                  | the Watcher                               |

Give every profile an explicit model. Different models for `slp-peer` and `slp-peer-alt` are the point: one model asked
one hard question twice tends to give one answer.

## Using it

- **Attach a project.** Open Seatworks in Paseo's sidebar and attach one of your Paseo projects, or run "Open a
  Seatworks team here" from the command center in a workspace. Attaching starts the project's Supervisor. Then talk to
  the Supervisor in its chat.
- **The Seatworks page** has a tab per project: **Needs you** (questions and permissions waiting on you), **Lanes**
  (each lane's state, and how much its Lead still owes), **Decided** (what agents decided for you, open to question),
  and **Activity**.
- **The Team panel** beside a workspace shows the same lanes, and a **"needs you" pill** in each agent's chat counts
  what waits on you.
- **Permissions** an agent asks for reach you on the Needs you tab. Answering one in the agent's own prompt works too;
  the record catches up.
- **The plugin's page** checks for a newer release (updating stays Paseo's `paseo plugin update seatworks`) and cleans
  up: copies and branches no open work uses, agents whose seat ended, whole projects, and the records of removed ones.
  Only what you pick and confirm is removed, and a copy holding uncommitted work never is.

## What it writes into your repository

- **A note in `AGENTS.md`**, between the plugin's markers, committed on your base branch as a commit of that file
  alone, so every agent in the repository, the team's or your own, knows the team is there and which branches are its.
  It never writes over a file you are editing; the note waits until you commit.
- **Branches** under `sw/<project>/`, one per lane and task, in worktrees under the plugin's state directory, never in your checkout. Only the plugin makes,
  merges and deletes them; a git guard on every agent refuses pull, checkout, push and the like.
- **`GLOSSARY.md`** (the words settled with you) and **`docs/seatworks/MAP.md`** (where the project is going, what
  must hold, what the team chose so far, each landed lane with what it decided, assumed and left open, and what is still
  in dispute), written from the record between the plugin's markers.
- **`docs/adr/`**, written by the agent whose decision it records, only for a decision that is hard to reverse,
  surprising without its reason, and a real trade-off.

These stay with your repository after the team is gone. Removing a project takes the `AGENTS.md` note out, archives
its agents, deletes its copies and branches, and sets its record aside until you delete it too.

## Your own way of working

SLP is a template, not the plugin. Everything its agents read is in [`profile/slp/`](profile/slp): roles and what each
may do (`profile.yaml`), prompts (`roles/`), skills (`skills/`), and what the watch looks for (`watch.yaml`,
`reflex.yaml`). A way of working of your own is another template: a directory of the same kind of files, installed
beside SLP with no change to the plugin's code. Roles are data; nothing in the code knows their names.

- **Have an agent write it.** Give your coding agent [`docs/TEMPLATE-SPEC.md`](docs/TEMPLATE-SPEC.md), which is
  everything a template is, and say how you want the team to work. It checks what it wrote with
  `npm run template -- check <dir>` and packs it into one file.
- **Or make it by hand**, on a canvas of nodes and wires: `npm run editor`, open SLP, change it, export.
  [`docs/EDITOR-GUIDE.md`](docs/EDITOR-GUIDE.md) walks through it.

Either way you get one file, `<name>.template.json`. In Paseo, open Seatworks, then Plugin, and under Templates give
its path: you are shown what it brings (its roles, the agent profiles it needs, any outside tool server it starts)
before it is installed. Attaching a project then asks which template it runs.

Rules of your own that should hold whatever the template says, such as how you want code written, go in
`rules/<template>/` under the plugin's state directory (`~/.local/share/seatworks/rules/slp/` for SLP on Linux and
macOS): `all.md` for every agent, `<role>.md` for one role (`lead.md`). Each agent made from then on reads them after
its role's prompt; an agent already running keeps what it started with.

## What to expect

- Agents are real and cost real money. Watch the first lanes, and set an appetite with the Supervisor.
- Only Claude Code and Pi have settings shipped for them. Other agents run, without the plugin's guards tuned for them.
- The plugin makes worktrees with git, not through Paseo's worktree setup, so a copy has no `node_modules` or `.env`
  until the project's checks install them. Say so to the Supervisor when it sets the checks.
- What the plugin keeps (the record, settings) has no stable format before 1.0: a new release may start it over.
- Something wrong? `~/.paseo/daemon.log` has what the plugin said, and the Activity tab what the team did.

## Building Seatworks

```sh
npm ci
npm run check    # typecheck, lint, format check and every test; run before every commit
npm run format   # lays the code out as Prettier wants it
```

There is no CI and no build step. Tests run against a stand-in for Paseo and never start a real agent.

| Where             | What                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `AGENTS.md`       | The rules for whoever changes this repository, human or agent. Read it first.                 |
| `concept/`        | CONCEPT-V2 and the orchestration analysis: the standard the plugin serves                    |
| `spec/`           | What to build: the kernel's contract, the ports, Paseo's facts, the watch, the conformance cases |
| `shared/`         | The kernel (pure TypeScript: decide, evolve, react) and the zod contracts                    |
| `server/`         | The bridge to Paseo and the satellites that do I/O: store, agent host, workspaces, evidence, delivery |
| `client/`         | What you see in Paseo, in React Native                                                        |
| `bin/`, `harness/` | The git guard and the team's MCP server; each agent's shipped settings                       |
| `profile/slp/`    | The SLP profile: everything agents read                                                        |
| `editor/`         | The template editor, a web page of its own: `npm run editor`                                  |
| `docs/`           | For whoever makes a template: the spec an agent writes one from, and the guide to the editor   |
| `.claude/skills/` | Recipes for building Seatworks: kernel changes, satellites, Paseo's boundary, tests          |

## License

MIT, in [`LICENSE`](LICENSE). What agents read draws on other work, credited in [`NOTICE.md`](NOTICE.md).
