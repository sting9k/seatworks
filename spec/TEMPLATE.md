# Template

A template is a profile packed to be shared: a way of working that another team takes, changes and runs without
touching the plugin. SLP is the one Seatworks ships. A template is to Seatworks what a workflow template is to
ComfyUI: picked from a gallery, opened as a graph, changed, and run. `EDITOR.md` says how one is opened and changed;
this says what a template is, what the plugin reads of it, and how it reaches a machine.

Built so far: the editor (`EDITOR.md`, steps 1 and 2 below), step 3, what the plugin reads of a template and how
one reaches a machine, and step 4, outside tool servers, in the plugin and in the editor. The gallery and the
report's sections are not built. The order it is built in
is at the end. A change it asks of another spec file is listed under What this changes, and is made in the commit that
builds it, so a spec and the code never disagree.

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
  profile.yaml       roles, their properties, tools, skills and models; outside tool servers
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

A file is for what outlives a lane: the words of the domain, a decision that is hard to reverse, the map, a note of
what was found out. An agent that writes puts it in its own commit, so it lands with the code it explains.

## Each kind of file

`ROLES.md`, What goes where, says where a rule belongs before any of these is written. A rule a machine can check is
code and is not a template's to state.

### A role's prompt

Five parts, after `profile/slp/roles/peer.md`:

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

`project.md` is kept in an attached project's instruction file, as today. The docs the plugin writes from the record
stay the core's: `glossary` and `map`. The docs it only points agents at become a list, `project.docs`, in place of
the single `adr`, so a template names the lasting docs its own way of working keeps. Every agent's first words point
at each.

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

### `template.json`

| Field         | Holds                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `name`        | The template's name, which is also the name of its directory once installed                           |
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

- The state root keeps the profiles the Human installed by name, `profiles/<name>/`, beside the one Seatworks ships,
  `slp`. One installed under the shipped one's name stands in its place, so the shipped way of working is changed
  without a fork.
- Attaching a project names its profile. The surface asks which only when more than one is there; with the shipped
  one alone a project is attached at once. A project keeps the profile it was attached with: its name is in the
  project's own file in the state root, and on the record beside the hash of its files when the project opened.
- The plugin loads a profile for each project, each time the project is opened: its roles for the kernel, its
  prompts, its reflex and its watch. What is edited in a profile (a prompt, a skill, a question, a moment) reaches the
  agents seated once the project is next opened, which is when the plugin starts or the project wakes. That is how a
  look back improves a way of working.
- The Human's own rules are by profile, since they are named by role: `rules/<profile>/all.md` and
  `rules/<profile>/<role>.md`.
- A profile edited so that the role of a seated agent is gone leaves the project running. The agent keeps the prompt it
  was made with and reads the record as before; a tool it calls is refused, saying its role is gone from the profile;
  and the Human's `stuck` view names the seat, until the profile has the role again or the seat is released. Stopping
  the whole project would let one mistaken edit halt a team.
- A project whose profile is no longer installed does not open, and the others do.

## The hash

A bundle's hash covers every file of the profile's directory, each by its path, in the order of the paths: a skill,
a file beside a skill, a question and a moment change what agents do as a prompt does. `template.json` and
`NOTICE.md` are left out, since the plugin reads neither.

## The gallery

A git repository of template directories, and a page that lists them. A template is published by a pull request. No
server and no accounts. SLP is the only one at first.

## Installing

A template is downloaded as the one file it is shared as and installed from the plugin's page in Paseo. The Human
gives the path of the file on their machine, and the plugin:

1. Reads it where it is, unpacks it aside, and loads it as it would load any profile; a file that is not a packed
   template, reaches outside its own directory, or does not load is refused, saying what is wrong.
2. Says what it would bring: the name it would be installed and attached under, whether one of that name is installed
   already, its roles, each Paseo agent profile its roles name with whether the Human has it, each outside server
   with the command it runs or the address it calls, and each variable a server reads with whether it is set.
3. Installs it under its name once the Human agrees, in place of one of that name. What is installed is the file the
   Human read: its hash is checked again, and a file changed since is not installed.

Nothing unpacked to be read is left behind. The plugin fetches nothing from the net. A template steers agents that
ask no leave for what they run, so the Human sees what one brings before it is theirs. A terminal command was the
first plan; the page was chosen since it needs no knowing where the plugin lives.

## Later: the report's sections

`report` takes three sections the kernel knows by name: decided, assumed, still open. They are SLP's, and the kernel
has no rule on any of them. They become the profile's, each a name and a description: SLP declares its three, another
template its own. Three limits:

- A section is a list of lines, not a shape of the template's choosing, so every line keeps its origin (I9) and the
  surface has one thing to draw.
- What an agent writes of its own work is a claim, never evidence: `integrate` cites none of it (N5).
- No section is required (rule 1).

The plan's and the brief's fields stay as they are until a second template is written and meets them. The kernel's
own rules read only `goal`, `appetite`, `terms` and the verdict `changes`.

## What this changes

Each is made in the commit that builds it.

| File             | Change                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `KERNEL.md`      | Later, §4 and §6: `report`'s sections are the profile's                                            |
| `CONFORMANCE.md` | The cases below, and `EDITOR.md`'s                                                                 |

## Cases

They join `CONFORMANCE.md` with the step that builds them.

| Case                                                                          | Expect                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |

## Order

| Step  | What                                                                                              | Plugin code |
| ----- | ------------------------------------------------------------------------------------------------- | ----------- |
| 0     | These two spec files                                                                              | None        |
| 1     | The editor, reading: SLP opened as a graph, with its files                                         | None        |
| 2     | The editor, writing: changes saved, files written from skeletons, the checks                       | None        |
| 3     | A profile for each project, installing, the hash, `project.docs`, `flow`                           | Yes         |
| 4     | Outside tool servers                                                                              | Yes         |
| 5     | The gallery's repository and its page                                                             | None        |
| Later | The report's sections                                                                             | Yes         |

Steps 1 and 2 touch no plugin code and can run beside the owner's test on a real Paseo. Steps 3 and 4 wait for it:
a change to how a profile is loaded, made in the middle of that test, leaves a fault with two possible causes.

## To check before building on it

- Whether an agent under its sandbox can read a file of the profile outside its own copy. This holds for `SKILL.md`
  today and is part of the test on a real Paseo.
- Whether Paseo keeps an agent's server settings on disk once it is made. The team's own server is handed over the
  same way, with the agent's key in its environment, so an outside server's filled-in variable is kept wherever that
  key is.

## To decide

- Whether `profile/slp/reference/ANTIPATTERNS.md`, which no prompt, skill or code points at, goes into a skill or
  goes. It is SLP's content.
