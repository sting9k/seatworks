# Template

A template is a profile packed to be shared: a way of working that another team takes, changes and runs without
touching the plugin. SLP is the one that comes with Seatworks. A template is to Seatworks what a workflow template is to
ComfyUI: picked from a gallery, opened as a graph, changed, and run. `EDITOR.md` says how one is opened and changed;
this says what a template is, what the plugin reads of it, and how it reaches a machine.

Built: the editor (`EDITOR.md`), what the plugin reads of a template and how one reaches a machine, outside tool
servers, the gallery's build and the page that reads one, and the check a template written without the editor is put
through, the report's sections as the profile's, and the gallery's own repository with its page. The order is at
the end.

Making a template never asks for a change to the plugin. Where one did, that was a fault of the plugin's and was
mended: the Human's surface wrote a role's name, the reflex read fixed file names, and a template chose where the
Human's key was sent.

## Open, not neutral

The plugin serves any way of working that can be said in what the kernel keeps: scopes in a tree, each with an owner;
one writer for a path; evidence bound to a commit; lines that carry their origin; obligations; and the relations a
role may speak along. A way of working that cannot be said in these is out of reach, and the core does not bend to
take it. ComfyUI is open the same way: anything, so long as it is a graph of typed values.

What a template may do, in four rules:

1. **It arranges and words; it never refuses.** A template says who is seated, what each may call and is shown, and
   what each reads. It adds no reason for the kernel to refuse: no required phase, no required section, no required
   review. `KERNEL.md` §1 holds for every template. A template that could refuse would put back, one template at a
   time, the constraints the governing rule takes off.
2. **It brings no code.** A template is data and text. Nothing of it runs inside the kernel or a satellite, so the
   daemon and the app still fold the same log, a recorded log still replays, and the property tests still cover every
   invariant. What a template adds to an agent's reach is an outside tool server (below).
3. **The core's names stay.** The tools' names and the kernel's nouns (scope, brief, plan, finding, evidence) are
   the core's. A template that calls a brief a ticket says so in its prompts. One vocabulary is what lets a template
   be read by someone who did not write it.
4. **Roles are data**, as they are today: a template with every role renamed behaves the same.

## What a template holds

```text
<template>/
  template.json      its name, description and tags, and the editor's layout
  NOTICE.md          the outside sources its files draw on, with their licences
  profile.yaml       roles, their properties, tools, skills and models; outside tool servers; the classifier
  flow.md            the team's flow, written by the editor from its steps
  project.md         the note kept in an attached project's instruction file
  roles/<role>.md    a role's prompt
  skills/<skill>/
    SKILL.md         the skill
    <files>          what the skill points at: a long document form, a lookup table, JSON
  reflex.yaml        the questions asked of the record's events
  watch.yaml         the moments
```

Everything but `template.json`, `NOTICE.md` and `flow.md` is the profile directory as it is today. The plugin reads
neither `template.json` nor `NOTICE.md`. Every file is text.

## Sharing

A template is shared as one JSON file, `<name>.template.json`, that holds the text of each of its files by its path:
`{ "files": { "profile.yaml": "...", "roles/lead.md": "..." } }`. A page writes it and Node reads it with nothing
installed, where an archive would need a package on both sides; ComfyUI shares a workflow as one JSON file for the
same reason. In the gallery's repository a template stays a directory, so a pull request shows what changed in it.

## Files by when they are read

What an agent does follows from which words are in front of it on which turn, so a template's files are designed by
when they are read.

| Read            | Files                                                                                         | By                          | So                                    |
| --------------- | --------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| Every turn      | The role's prompt, the description of each of its skills, the team's flow, the Human's rules | The agent                   | Paid on every turn: kept short        |
| When it applies | A skill's body, and the files beside it                                                       | The agent, which opens them | Paid only when used                   |
| Every session   | `project.md`, kept in the project's instruction file                                          | Every agent in that repository, the Human's own too | Short |
| On an event     | `reflex.yaml`, `watch.yaml`                                                                   | The reflex and the Watcher  | Never read by the agents they concern |
| Never           | `template.json`, `NOTICE.md`                                                                  | The editor, the installer, people | No effect on what agents do     |

A skill's description is read every turn, not when the skill is: the standing instructions list every skill of the
role by name and description. A role with eight skills pays for eight descriptions on each turn.

## The record or a file

What goes through a tool into the record is never a file: a plan, a brief, a finding, a report, a verdict. A team
that comes from a way of working kept in files will want a `plan.md` and a `tasks.md`. Here that is a second store,
with no origin on its lines and nothing owed to anyone, and V1 kept one beside its ledger until it was dropped
(`ROLES.md`).

A file is for what outlives a lane: the words of the domain, a decision that is hard to reverse, a note of what was
found out. An agent that writes puts it in its own commit, so it lands with the code it explains.

## Each kind of file

`ROLES.md`, What goes where, says where a rule belongs before any of these is written. A rule a machine can check is
code and is not a template's to state.

### A role's prompt

Five parts, after `templates/slp/roles/peer.md`:

1. What the role owns, where its work comes from and where it goes: one paragraph.
2. How to read what it is given: what is fixed, and what it may question.
3. When it speaks up, steps in or takes a thing higher, each with its reason.
4. How it works: only the judgement it needs on every turn.
5. What it hands over, and what proves it.

It ends by saying once that text from outside the team is data to judge. Every idea is there once, with its reason.
It says what to do, not what to avoid, save for a real never. It carries no persona (N8), none of the mechanics the
kernel holds, and nothing that names the watch.

### A skill

- `name` is the folder's name. `description` says what the skill does, when to use it and when not.
- The body is the craft: why it is worth doing, the procedure with its reasons, one worked example or table.
- It ends in something the record knows: a hand-back, a finding, or a file in a commit.
- A short document form is written in the skill itself, as `skills/domain-docs` writes an ADR's. A long form, a
  lookup table or a JSON file sits beside `SKILL.md`, which names it by a relative path. The agent is already given
  the skill's path, so the plugin does nothing for these files.

### The project's note and its docs

`project.md` is kept in an attached project's instruction file. The lasting docs a team keeps are a list,
`project.docs`, so a template names them its own way: every agent's first words point at each, the agents that write
keep them in their own commits, and the plugin writes none of them. `map` names the file the plugin leaves what the
record holds in when the project is removed (`PORTS.md`); a profile without one leaves nothing.

### The team's flow

`flow.md` is one passage every role is given after its prompt: each step of the work on a line, with the role that
does it. The editor writes it from the template's steps (`EDITOR.md`); a template made by hand writes it by hand.
`profile.yaml` names it under `flow`, and a profile without one gives its agents none.

The flow is words. An agent is told the order; the kernel refuses nothing done out of it (rule 1), and the record
shows the Human where the team left it. A step skipped again and again is what a watch moment is added for, at a look
back, as `WATCH.md` says of every moment.

### Questions and moments

As `REFLEX.md`, Asking well, and `WATCH.md` say. A threshold belongs to a question's wording and the model that
answered it, so a question reworded in a template has not earned its `tell` and goes no further than a candidate.

`profile.yaml` names the file of each under `reflex` and `watch`, and the plugin reads the file named: a profile
that names neither asks nothing and watches for nothing.

What either file may name of the plugin's is in `shared/contracts/reflex.ts`, and nothing else is: the kernel's
events a question is asked `on`, the conditions its `when` may set (`WHEN`), the places of the record its `state`
reads (`STATE_PATHS`), whom its answer is for (`TELLS`), what a moment `reads` of a turn (`ITEM_READS`), and the
moments counted in code (`CODE_MOMENTS`), each switched on by the name the plugin gives it. What code counts those
by, every number and pattern, is the profile's under `facts` (`WATCH.md`). Every
other name in them is the profile's own, and no code names it: a test reads every role, question and moment SLP
names and finds none in the plugin's code.

### The classifier

The model the questions and the moments are asked of is the template's, under `classifier` in `profile.yaml`: each
route a place it is served, with its `endpoint`, the `model` as that place names it, its `budget` and what its `body`
adds to every request (`REFLEX.md`). A template with none asks no model and loses nothing else. The plugin names no
model and no host of its own.

### What a template never chooses

Where the Human's key goes, and what is masked before text leaves. A template says where its classifier is served;
the key is the Human's, kept in the plugin's settings for one host, and a question goes only by a route served at
that host. So a template cannot be handed a key or the record's text by naming a host of its own: with no key for
that host nothing is sent there, and the hosts a template names are shown before it is installed. The patterns of
what looks like a secret are the plugin's (`REFLEX.md`), so no template can leave one out.

### `template.json`

| Field         | Holds                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `name`        | The template's name; in lower case with dashes it is the name it is installed and attached under      |
| `description` | A sentence or two for the gallery                                                                    |
| `tags`        | Words the gallery filters by                                                                         |
| `seatworks`   | The release of Seatworks it was made against                                                         |
| `editor`      | The editor's own: where each node sits, and the steps the flow is written from                       |

The page reads all of these but `seatworks` so far, and refuses a file with any other key.

What a template needs of a machine (the Paseo agent profiles its roles name, the variables its servers read) is read
from `profile.yaml` by the gallery and the installer, never declared a second time here, where it could fall out of
step. A template for an older core is not upgraded when read. It loads or it fails with what is wrong, as any profile
does.

### `NOTICE.md`

One row for each file drawn from an outside source, with the source and its licence, as the repository's own
`NOTICE.md` does for SLP. It travels with the template.

## Outside tool servers

A role may be given tools from an MCP server that is not the team's.

```yaml
servers:
  tickets:
    type: stdio
    command: npx
    args: [-y, some-ticket-server]
    env: { TOKEN: $TICKETS_TOKEN }

roles:
  lead:
    servers: { tickets: [search, create_issue] }
```

- A server is declared once; each role names the servers it is given and the tools of each. Paseo approves an MCP
  tool ahead of time by its server and its name and takes no wildcard (`ToolPolicy`, 0.10.1), so the tools are named.
- `servers` is apart from `tools`. `tools` is what the kernel reads; an outside server is read by the agent host
  alone, as a prompt or a model is.
- **A secret is never in a template.** A server's command, arguments, `env`, `headers` and address name an
  environment variable as `$NAME`, and the plugin keeps no key for it. When an agent is made the plugin fills each in
  from its own environment, which is the daemon's, and hands the server to Paseo as it hands the team's own.
- **A role whose server reads a variable that is not set is not seated**, and the reason names the server and the
  variable. A server started without what it reads fails where nobody looks.
- **An agent that cannot be given a server is not seated**, and the reason names the server. Paseo says whether a
  provider takes MCP servers only of an agent already made, so which providers cannot is kept in each one's harness
  file: Pi, which takes one only with the Human's `pi-mcp-adapter` (`HARNESS.md`). Where Paseo itself refuses, the
  reason is Paseo's. An agent missing a tool with nobody told is the fault hardest to trace.
- **The team's tools are never put behind a tool search.** The team's own server is marked `alwaysLoad`, which Paseo's
  Claude provider honours: they are how the record is reached, however many tools a role is given beside them.
- **The guards do not reach it.** An outside server is a process of its own: it does not go through the git shim, and
  nothing confines it to a copy. `HARNESS.md` says the guards hold against mistakes, not intent, and a server is
  where that shows.
- What a server's tools return is not evidence (N5). It reaches the record only through a hand-back or a check.
- The SLP profile declares none. This is built so a template can reach what its team works with, which is what open
  means here.

## A profile for each project

- **The core has no profile of its own.** Every profile a project runs is one the Human installed, kept by name in the
  state root, `profiles/<name>/`. SLP comes with the plugin as a template, `templates/slp/`, and is installed like any
  other: by a press on the plugin's page. Nothing is read from the plugin's own directory when a project runs.
- **So nothing is written over behind the Human's back.** A new release of the plugin brings a new SLP beside the one
  installed, and leaves that one alone until the Human installs again; a copy they changed is theirs. The page says
  of each template that comes with the plugin whether it is not installed, installed as it comes, or installed and
  not as this release brings it.
- Attaching a project names its profile. With none installed no project is attached, and the reason says to install
  one; with one, a project is attached with it at once; with more, the surface asks which.
- The Human's own rules are by profile, since they are named by role: `rules/<profile>/all.md` and
  `rules/<profile>/<role>.md`.

## A project's own copy

A project runs a copy of its template that is its own, taken when it is attached. What is installed on the machine
is where templates are kept and changed; what a team runs is what its project took.

- **One template for the life of a project.** Its name is in the project's own file in the state root, with the hash
  of the copy the project runs. Attaching the project again under another name changes nothing; a team that is to
  work another way is removed and attached again.
- **The copy is kept under its hash**, `projects/<id>/profile/<hash>/`, and the files a project runs are read from
  there alone. So what is installed may be changed, installed again or removed, and the plugin started again, with
  no team running other words than it did. A copy is written whole before the project points at it.
- **Sync takes the installed files anew**, on the project's row of the plugin's page, for the agents seated from then on. An agent
  already seated keeps the prompt it was made with, since Paseo fixes it then, and the files it was pointed at stay
  where they were; its owner or the Human reseats it to give it the new ones. Sync takes only files that load: a
  template no longer installed, or one that does not load, is refused with the reason, and the project runs on as it
  was. That is how a look back improves a way of working: change the template, install it, sync the project.
- **A role gone from the files a project took** leaves it running. An agent seated in that role keeps its prompt and
  reads the record as before; a tool it calls is refused, saying its role is gone from the profile; and the Human's
  `stuck` view names the seat, until the profile has the role again or the seat is released. Stopping the whole
  project would let one mistaken edit halt a team.
- **Removing a template** takes it off the machine, on the plugin's page. No project is attached with it after, and
  a project that runs it goes on with its own copy, with nothing to sync from until it is installed again. The
  Human's matching and rules for it are theirs and are left.

## The hash

A bundle's hash covers every file of the profile's directory, each by its path, in the order of the paths: a skill,
a file beside a skill, a question and a moment change what agents do as a prompt does. `template.json` and
`NOTICE.md` are left out, since the plugin reads neither.

The hash is how anyone's change is seen, with nothing kept but files and the record:

| Compared                                                   | Says                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| The template that comes with the plugin, and the installed | Whether it is installed as it comes, or differs: changed by the Human, or brought anew by a release |
| The installed template, and the hash a project took        | Whether the project is behind what is installed: Sync is offered |
| The files of a project's copy, and the hash it was taken at | Whether the copy was changed by hand since: said on its page, and put back by Sync |
| The files a project loads, and the hash on its record      | Whether the record still says what the team runs: when not, the bridge records the hash loaded |

The record keeps the hash a project opened with and each one it took after (`profile_taken`), so a look back knows
which words were in force when.

## The gallery

A git repository of template directories, and a page that lists them. A template is published by a pull request. No
server and no accounts. SLP is the only one at first.

```text
<gallery repository>/
  templates/<name>/     a template's directory, as What a template holds lays it out
<built beside the page>/gallery/
  index.json            each template's directory name, its name, description and tags, and its file
  <name>.template.json  the template as the one file it is shared as
```

- **The gallery is built, never written by hand.** `bin/gallery.ts <out> <directory of template directories>...`
  reads each directory that holds a `profile.yaml`, loads it as the page loads any template, and writes the index and each
  template as its one file. In a pull request a template is a directory, so what changed in it is read line by line;
  in the gallery it is the file a person opens, exports and installs.
- **The build is the check a template passes to be published.** A template that does not load, or whose directory is
  not the name it would be installed under, is left out and said with why, and the build fails. So is one whose name
  two of the directories built from both hold: a name is one template to install. What a machine can note beyond
  that stops nothing (`EDITOR.md`, Checks); whether a template is worth listing is its reviewers' to say.
- **A template has one name to install it under**, made from the name in its `template.json`: lower case, with a
  dash for whatever is neither letter nor digit, so `Night Crew` is `night-crew`. Its directory in the gallery carries
  that name, the file it is shared as is `<that name>.template.json`, and so do the state root and a project's
  record. A shared file holds no directory, which is why the name is made from what it does hold.
- **The page reads the gallery built beside it**, `gallery/index.json` and the files it lists, from wherever the page
  is served: built, it asks for its own scripts, styles and type by a relative path too, so it is served from any path and calls no other host. A page with no gallery beside it says so, and still opens a file or a folder of the person's own; a
  listed template whose file is gone or does not load says why on its own card.
- **This repository builds a gallery of its own from `templates/`**, which holds SLP, each time the editor is
  served or built (`npm run gallery`). So SLP is in the gallery from the one place it is kept, and never copied.

The gallery's repository builds its page with this one, and keeps no copy of it. Its build checks Seatworks out
beside itself, builds the gallery from Seatworks' `templates/` and from its own (`npm run gallery -- <its
templates>`), builds the editor beside that, and publishes the result from its `main` as the repository's own page.
On a pull request the same build runs and publishes nothing: that is the check a template passes. So a template is
only ever text in the gallery's repository, and the page a person opens is this repository's editor at the branch
the gallery names.

The repository is `sting9k/seatworks-gallery`, and its page that repository's own on GitHub Pages,
https://sting9k.github.io/seatworks-gallery/. The branch of Seatworks it builds from is its variable `SEATWORKS_REF`.
The page keeps the commit it was built from (`built-from`, beside the page), and the gallery's repository looks every
quarter of an hour: when that branch has moved past it, the page is built again from where the branch is, once for a
commit, so a build that fails is not started over and over. So what is pushed here reaches the page with nobody
running anything, and nothing in this repository tells the gallery of a push. Nothing in this repository depends on where
the gallery is.

## Checking one without the editor

A template written by hand, or by an agent, is checked from a terminal in a checkout of this repository:

```sh
npm run template -- check <dir>          # does it load, what it needs of a machine, and its notes
npm run template -- pack <dir> <file>    # the same check, then the one file it is shared as
```

- **It loads a template both ways**, as the editor reads it and as the plugin does, so one that passes installs. It
  fails, saying why, on the first thing that stops either.
- **It says what the template needs of a machine**: the name it installs under, each role with the words it reads on
  every turn, the Paseo agent profiles its roles name, the variables its servers read, and each host its classifier
  is served at.
- **It prints the editor's notes** (`EDITOR.md`, Checks), which stop nothing here either.

## Installing

A template is installed from the plugin's page in Paseo, from one of two places: one that comes with the plugin,
picked from the list the page shows, or one downloaded as the one file it is shared as, by the path of that file on
the Human's machine. Both go the same way, and the plugin:

1. Reads it where it is, unpacks it aside, and loads it as it would load any profile; a file that is not a packed
   template, reaches outside its own directory, or does not load is refused, saying what is wrong. A name that is not
   a template of the plugin's is read from nowhere.
2. Says what it would bring: the name it would be installed and attached under, whether one of that name is installed
   already, its roles, each Paseo agent profile its roles name with whether the Human has it, each outside server
   with the command it runs or the address it calls, each variable a server reads with whether it is set, and each
   host its classifier is served at with the model asked there.
3. Installs it under its name once the Human agrees, in place of one of that name. What is installed is the file the
   Human read: its hash is checked again, and a file changed since is not installed.

Nothing unpacked to be read is left behind. The plugin fetches nothing from the net. A template steers agents that
ask no leave for what they run, so the Human sees what one brings before it is theirs. A terminal command was the
first plan; the page was chosen since it needs no knowing where the plugin lives.

## Agent profiles on a machine

A profile names its agent profiles its own way, and a Human who had to make one in Paseo's settings for every name of
every template they try would not try many. So on the plugin's page each name a profile's roles give is matched to an
agent profile the Human already has, for every profile installed.

- **One matching for a profile, set in one place.** The page lists every profile a project may be attached with, each
  name its roles give, what that name runs on and whether Paseo has it, beside the Human's own agent profiles to pick
  from. A pick is kept at once. Installing takes no matching of its own: a template just installed is in the list.
- **It is the Human's and their machine's**, so it is kept beside the profiles, in `agents/<profile>.json` under the
  state root, and never in the template. A template's files and hash stay as shared, and one installed again keeps
  the matching of its name.
- **It is read when an agent is made**, as the Human's rules are, so it holds for agents seated from then on. A role's
  agent is made from the profile its name is matched to, or from the Paseo profile of that very name. The record
  keeps the name the profile gives, so a log reads the same on every machine.
- **A matching is refused whole** when it names a profile nobody installed, a name the profile's roles do not give, or
  an agent profile Paseo does not have. Nothing is kept of one refused.
- **What goes wrong later is said, and stops one seat only.** A name matched to an agent profile the Human has since
  removed, or a matching whose file no longer reads, leaves that agent not seated with the reason on its seat, as a
  missing agent profile always did; the page says the same. Matched again, the seat is taken by a reseat. Nothing
  throws where an agent is made: that would leave a seat with no agent and nobody told.

## The report's sections

A report is lines under sections, and the sections are the profile's: each a name and what it holds, under `report`
in `profile.yaml`, in the order they are read. SLP names three (`decided`, `assumed`, `open`); another template names
its own. The kernel has no rule on any of them, and knows none by name.

- **An agent given `report` is shown the profile's sections and no other**, each with the words the profile gives it.
  A report that names another section is refused, saying which a report has: lines dropped in silence would be worse.
  No section is required (rule 1), and one left out is not on the record at all.
- **A section is a list of lines**, not a shape of the template's choosing, so every line keeps its origin (I9) and
  every reader has one thing to draw.
- **A report is read under its sections' names** wherever it is read: by the owner above, in the scope's record, in
  the project's map, and by a question asked on it (`report.lines`). The event keeps each name, so a report made
  before the project took other sections reads as it was made.
- **What an agent writes of its own work is a claim, never evidence**: `integrate` cites none of it (N5), and the map
  says so over every report.
- A profile that names no section loads; a role shown `report` there draws a note, since its reports would say
  nothing (`EDITOR.md`, Checks).

The plan's and the brief's fields stay as they are until a second template is written and meets them. The kernel's
own rules read only `goal`, `appetite`, `terms` and the verdict `changes`.

## What this changes

Each is made in the commit that builds it.

| File             | Change                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `KERNEL.md`      | §2 and §6: `report`'s sections are the profile's; `LEDGER.md` its arguments and its event          |

## Order

| Step  | What                                                                                   | Plugin code | Built |
| ----- | -------------------------------------------------------------------------------------- | ----------- | ----- |
| 0     | These two spec files                                                                   | None        | Yes   |
| 1     | The editor, reading: SLP opened as a graph, with its files                             | None        | Yes   |
| 2     | The editor, writing: changes saved, files written from skeletons, the checks           | None        | Yes   |
| 3     | A profile for each project, installing, the hash, `project.docs`, `flow`               | Yes         | Yes   |
| 4     | Outside tool servers                                                                   | Yes         | Yes   |
| 5     | The gallery's build and its page; the gallery's own repository                         | None        | Yes   |
| 6     | The check from a terminal                                                              | Yes         | Yes   |
| 7     | The report's sections                                                                  | Yes         | Yes   |

Its cases are in `CONFORMANCE.md`: Editor, Templates and Gallery.

## To check before building on it

- Whether an agent under its sandbox can read a file of the profile outside its own copy. This holds for `SKILL.md`
  today and is part of the test on a real Paseo.
- Whether Paseo keeps an agent's server settings on disk once it is made. The team's own server is handed over the
  same way, with the agent's key in its environment, so an outside server's filled-in variable is kept wherever that
  key is.

## To decide

Nothing open. SLP's list of anti-patterns, which no prompt, skill or code pointed at, lies beside its `retrospective`
skill, which names an episode by it at a look back; it no longer says what notices each one, since those names are
the watch's and are kept in one place, the profile's own files.
