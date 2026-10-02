# Editor

Where a template is opened as a graph, changed and saved: a web page, after ComfyUI's three screens. `TEMPLATE.md`
says what a template is; this says how a person makes and changes one. The order it is built in is in `TEMPLATE.md`.

Built: all of this file. A template is picked from the gallery built beside the page (`TEMPLATE.md`, The gallery), or
opened from a file or a folder of the person's own, and opens in a tab. Its graph is drawn and laid out. Roles, skills, steps, questions and moments are added from a
skeleton, changed and taken away; wires are drawn and cut; a file is written in place and read as Markdown; what a
machine can see is noted on the node it is about; every change can be undone; and the template is exported as one
file. What is left is listed under Not built.

## Decided

1. **A web page, not a surface in Paseo.** Paseo 0.10.1 gives a plugin's client lists, text inputs, a modal and
   icons, and publishes nothing to draw wires with or to drag on. The Human's surface in Paseo stays what it is: where
   a running team is followed. A template is made rarely; a team is followed all day.
2. **In this repository, in a folder of its own**, with its own tsconfig as `client/` has. It imports
   `shared/contracts`, so what it calls a sound profile is what the plugin calls one: the same `resolveProfile`.
3. **React Flow** (`@xyflow/react` 12, MIT), and `markdown-it` (MIT) to show a Markdown file as it reads. A node here is a form: a role has switches, a list of models, lists of
   tools to tick. React Flow draws a node as a component, so that is ordinary work. Not taken: LiteGraph, which gives
   ComfyUI's look but draws on a canvas, so every input in a node is drawn by hand; Rete, whose package was last
   changed in June 2025.
4. **dagre lays out a template that has no positions** (MIT). elkjs is not taken: EPL or GPL.
5. **Files come in and go out by import and export.** A page cannot write into the state root, and opening a
   directory in place works only in some browsers. A template comes in as the one file it is shared as or as a folder
   picked from the machine, and goes out as that one file (`TEMPLATE.md`, Sharing). A change lives only in the page
   until it is exported, so the page says when one has not been, and asks before it is left.
6. **The graph is a view of the files.** The files are what the page keeps: every change makes new files, and
   everything shown is read again from them. What is the editor's alone (where a node sits, the steps) is in
   `template.json`.
7. **A file that is not changed is kept to the byte, and a change touches only what it changes.** `reflex.yaml` and
   `watch.yaml` keep the reason for each number in a comment, and a save that drops a comment destroys content. The
   `yaml` package cannot be asked to write a file back: tried on the three files of SLP, its document form joins a
   list written over several lines and folds text again, changing most lines of each. So no file is ever written
   whole from what was parsed. A change is made in the source, at the place of the node it changes.
8. **The editor checks what a machine can check, and no more.** Whether a template makes a team work well is known
   only by running it and looking back.
9. **A change that would leave a template that does not load is not made, and the page says why.** The graph is
   always drawn from files the plugin would load, so there is never a half-made template to draw or to export. One
   change could not be made in two steps under this rule, so it is one: switching the root on for a role switches it
   off for the role that had it.

## Three screens

| Screen       | Shows                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Gallery      | The templates of the gallery built beside the page, each with its name, description, tags and its graph as a cover; one that does not load says why on its card |
| Graph        | One template: its nodes wired, a panel of its files, its faults on the nodes they concern        |
| Node library | Every kind of node, in families, to drag onto the graph                                          |

## The look

After ComfyUI's own page, so a person who knows one finds their way in the other.

- A strip of tabs over everything: the gallery, and a tab for each template open, marked while it holds a change
  that has not been exported.
- Down the left, a rail of icons that opens one panel beside it: the nodes, or the files. The nodes panel has two
  tabs, the nodes of this template to find one by, and the kinds of node to add, dragged onto the graph.
- The canvas takes the rest, with its tools floating over it: at the top left a menu for the template as a whole
  (rename, tidy up, export, close); at the top right undo, redo, whether it is exported, the export button and the
  switch for the panel on the right; at the bottom right the zoom and the small map.
- The picked node has its own few actions floating above it: take away, duplicate, about.
- On the right, a panel says the rest of the picked node, lets what is not on the node be set, and shows the file the
  node is kept in.
- One dark ground of neutral greys. Nodes are neutral; colour is kept for the wires, their sockets and the dot before
  a node's name, one colour to a kind of wire. The picked node is outlined in white.
- What comes into a node is on its left, named in lower case. What goes out is on its right, named by its kind in
  capitals, as ComfyUI names a type.
- A setting is a row: its name on the left, its value on the right.
- A node with one socket and nothing to set is its title alone, as a collapsed node is.
- A family no wire places sits in a titled frame that carries its nodes when it is moved: the reflex questions.
- A card in the gallery is covered by the template's own graph, drawn small, with its name over it. No picture is
  kept beside a template, so a cover is never out of step with what it covers.

## Nodes

| Family    | Node                | Holds                                                                    | Wires                              |
| --------- | ------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| Team      | Role                | Its name, its properties as switches, its tool groups as ticked lists, its prompt, its models | `spawns`, in and out |
| Team      | Human               | One, fixed                                                               | From each role that may ask or message the Human |
| Equipment | Skill               | Its folder: `SKILL.md` and the files beside it. A node once the folder is there, wired or not | To each role that has it |
| Equipment | Outside server      | Its command or address, the variables it names. Set in its panel         | To a role; drawing the wire asks which of its tools the role may call, and the wire says them |
| Equipment | Optional tool group | Findings; the machine's hold. Always on the graph, to be wired           | To a role                          |
| Attention | Reflex question     | The events it is asked on, its question, each outcome, its thresholds, whom it tells | None                   |
| Attention | Watch moment        | Its question, what it reads, its thresholds                              | `watches`, to each role watched    |
| Flow      | Step                | Its name and a line on what happens in it                                | `then`, to the next; from the role that does it |

The sections of a report join as a family of their own when `TEMPLATE.md`'s last step is built.

## Wires

A wire has a kind, a socket takes only its own kind, and every kind says what it becomes when the template is saved.

| Family    | Wire                       | Becomes                                              | Held by                                      |
| --------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Authority | `spawns`                   | `spawns` in `profile.yaml`                           | The kernel: no wire, refused                 |
| Authority | To the Human               | `humanDoor`, `human` in `speaksTo`                   | The kernel (I10)                             |
| Authority | `watches`                  | A moment's `watches` in `watch.yaml`                 | The watch                                    |
| Equipment | Skill, model, server, tool group | `skills`, `models`, `servers`, `tools`         | The agent host: a role has only what is wired |
| Flow      | `then`, and `does` from a role to a step | A line of `flow.md`: the step, who does it, what follows | Nobody: the record shows where it was left |

- **Speaking is not a free wire.** A role speaks to its `parent`, its `children`, its `descendants` or the Human,
  counted along the tree of scopes. So it is four switches in the role's node, drawn as arrowheads on its `spawns`
  wires and as a wire to the Human.
- **The wire to the Human is `human` in the role's `speaksTo`.** Cutting it also switches `humanDoor` off: a role that
  may not speak to the Human does not ask them either.
- **A server's wire carries tools.** Paseo approves an outside tool by its name, so a wire with no tool named gives
  nothing: drawing one asks for the names, the wire shows them, and the server's panel changes them role by role.
- **Nor is whom a question tells.** `tells` names a relation (`root`, `parent`, `evidence`, `answerer`, `self`), never
  a role, so it is a field in the question's node and no wire leaves it.
- **`then` is soft.** It makes words an agent reads, and nothing the kernel refuses (`TEMPLATE.md`, rule 1). A hard
  wire would stop the one thing SLP is for: whoever touches the code sending the plan back.
- **A step is its own node** because a way of working reuses its roles: SLP's stages are done by three of them, and a
  `then` between roles could not say that.

## Tool groups

The kernel refuses a command from anyone but the caller it names (`KERNEL.md` §6), so most tools mean something only
to a role with one property. A group follows that property: switching the property on puts the group in the role's
node, every tool ticked, and the author unticks what the role is not to be shown.

| Group       | Tools                                                                                                    | Follows                  |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| Record      | `status`, `record`, `diff`                                                                               | Every role               |
| Talk        | `send_message`, `answer`                                                                                 | A role that speaks to anyone |
| Scopes      | `open_scope`, `amend_brief`, `handover`, `reseat`, `release`, `drop_scope`, `hold_scope`, `resume_scope` | `delegates`              |
| Plan        | `set_plan`, `amend_plan`, `add_edge`, `remove_edge`                                                      | `delegates`              |
| Acceptance  | `integrate`, `send_back`, `classify_finding`                                                             | `delegates`              |
| Attention   | `acknowledge`, `mark_noise`, `answer_permission`, `look`                                                 | `delegates`; `look` alone, `watches` too |
| Hand-back   | `hand_back`, `run_checks`, `report`                                                                      | `writes` or `delegates`  |
| The Human   | `ask_human`                                                                                              | `humanDoor`              |
| Project     | `set_checks`, `publish`                                                                                  | `root`                   |
| Reading     | `record_verdict`                                                                                         | `reading`                |
| Watching    | `attend`, `pass`                                                                                         | `watches`                |
| Findings    | `raise_finding`, `withdraw_finding`, `reopen_finding`                                                    | Optional: a node         |
| The machine | `hold_machine`                                                                                           | Optional: a node         |

- Every tool an agent may be shown is in one group and only one.
- A group in a role's node keeps that role's own ticks, which a node shared by several roles could not. Only the
  optional groups and outside servers are nodes; a wire from one that gives a role only part of the group says how
  much.
- A group is in a role's node when the role has its property, or is shown any of its tools: what a file holds is
  never left off the graph.
- Groups are the editor's. The template saved keeps the flat `tools` list the plugin reads today, and one opened is
  folded back into groups.
- The SLP profile is these defaults less what it hides: the root's `hand_back` and `report`, the writer's `report`,
  the watcher's `status` and its talk. Its two optional groups go to every role but the root and the watcher.
- How many a role is shown is judged role by role. The record counts every command by its caller, so what a role
  never calls is cut by unticking it, after a look back and not before.

## Steps and the flow

The steps are kept in `template.json`. On each change to them the editor writes `flow.md` again: one line a step, in
the order they were set down, with the role that does it and the steps that follow, and names it under `flow` in
`profile.yaml`, which is how every role is given it. `flow.md` is not edited by hand in a template that has steps;
when the last step goes, the file goes and the profile names none.

## Files

The rail opens every file of the template by folder. A click on a role opens its prompt; on a skill, `SKILL.md`; on
a question or a moment, the file it is written in. The file is written in the panel on the right and set when the
person leaves it; a Markdown file is also read there as a reader sees it. HTML written in a file is shown as text and
never run: a template may come from anyone.

A skill's panel lists what is in its folder and takes a file dropped on it, kept beside `SKILL.md`.

A new role, skill, question or moment starts from a skeleton: the five parts of a prompt and the form of a skill
(`TEMPLATE.md`, Each kind of file); for a question or a moment, the fields `REFLEX.md` asks for. What a skeleton
leaves to be written is a line in italics, and one left standing draws a note. A new question or moment is written
and not asked: it joins its file's `active` list when its author ticks it, in one line of that file.

A question's or a moment's own words are changed in its file. A role's models are set in its panel, and so is how an
outside server is started or reached: its kind, its command or address, and its environment or headers. A role, a
skill, a step, a question and a moment are each renamed in their panel, and everything that named them follows.

## Checks

What a machine can see, each as a note on the node it is about: a count on the node, the words in its panel, and all
of them in a panel of the rail. A note stops nothing, neither a change nor an export.

- **The always-on words of each role**: its prompt, the descriptions of its skills and the flow, counted on its node,
  and in its panel beside the fewest and the most a role of SLP reads. This is the cost a template raises without
  anyone seeing it.
- A prompt that names, in backticks, a tool its role is not shown. It cannot tell a role told to call a tool from
  one told that others have it, so it is a thing to look at: SLP's watcher once named the owners' `status` so, and
  was reworded, since a role that reads a tool's name may try to call it.
- **A role with no way on.** One that no role seats and that is not the root; one that names no agent profile; one
  with no prompt. One whose properties need a tool it is not shown: a writer without `hand_back`, a reader without
  `record_verdict`, a watching role without `attend`, a role that seats others without `open_scope` or without
  `integrate`. And one shown a tool the kernel refuses every role like it: `ask_human` without `humanDoor`, `attend`
  without `watches`, `open_scope` with nobody to seat. Each is certain from `profile.yaml` alone, and each would
  otherwise show only as a team that stalls.
- A prompt or a skill that names a role the template has lost since it was opened.
- A prompt of a watched role that names the watch.
- A skill whose folder and `name` differ, whose description does not say when to use it, or which points at a file
  that is not beside it.
- A question or a moment that asks of a backticked field not in its `state`, or lacks the description of an outcome.
- **A question or a moment that would never be asked, or never reach anyone.** A question asked `on` what is not an
  event a question is asked on; a `state` that reads what the record does not have; a `tells` the plugin does not
  know; a moment that watches a role the template does not have; a moment `by: code` under a name the plugin counts
  nothing for. The lists these are held against are the plugin's own (`shared/contracts/reflex.ts`), which the code
  that asks is typed by.
- A prompt, a skill, a question, a moment or a server that still holds a skeleton's words.
- An outside server no role is given; and one whose settings hold what looks like a secret, by the patterns the
  plugin masks before text leaves a machine. A secret is named as a variable, never written.
- A question or a moment whose words changed since its threshold was earned: it is not yet earned again. A threshold
  is earned for a hash of the wording (`REFLEX.md`). The plugin makes that hash with Node's own SHA-256, which a page
  has only by waiting on it, so the page makes the same hash in plain code, held to Node's and to the plugin's by
  tests. The panel of a question says which of the three holds: earned, reworded since, or not yet.

A change `resolveProfile` would refuse (no root or more than one; a role that spawns but does not delegate; a role
with two kinds; a `spawns` that names no role; a tool the team does not have) is never there to note: it is not made
(Decided 9). Nor is one that leaves a file the template names and does not carry, or a question or a moment named as
asked and not written.

The same notes are printed by `npm run template -- check <dir>` for a template written without the page
(`TEMPLATE.md`, Checking one without the editor).

## Easy to use

A template is some five to thirty nodes, so drawing is never slow; what is felt is the handling.

- A wire dropped on empty space opens the node search, already narrowed to what that socket takes, with a new node
  of that kind last in it.
- A kind of node is dragged from the panel onto the graph, or clicked to land in the middle of the view.
- While a wire is dragged, the sockets it cannot go to are dimmed.
- Undo and redo by the keys a person expects; copy and paste make a second role of the picked one; delete by key
  takes away the picked wire, role, skill or step; and the menu tidies the layout.

## Not built

- The sections of a report as nodes: `TEMPLATE.md`'s last step.

## To check before building on it

- Whether the flow, added to a role's standing instructions, repeats what SLP's hand-written prompts already say. It
  is tried on the SLP profile before any template relies on it.
