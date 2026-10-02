# Editor

Where a template is opened as a graph, changed and saved: a web page, after ComfyUI's three screens. `TEMPLATE.md`
says what a template is; this says how a person makes and changes one. The order it is built in is in `TEMPLATE.md`.

Built so far: a template is picked from the gallery, or opened from a file or a folder of the person's own, and read.
Its graph is drawn and laid out, its files are shown as text, and the node library lists the nodes it has and finds one
by name. A node is moved and stays where it was put, and the template is exported as one file. Nothing else of it is
changed yet.

## Decided

1. **A web page, not a surface in Paseo.** Paseo 0.10.1 gives a plugin's client lists, text inputs, a modal and
   icons, and publishes nothing to draw wires with or to drag on. The Human's surface in Paseo stays what it is: where
   a running team is followed. A template is made rarely; a team is followed all day.
2. **In this repository, in a folder of its own**, with its own tsconfig as `client/` has. It imports
   `shared/contracts`, so what it calls a sound profile is what the plugin calls one: the same `resolveProfile`.
3. **React Flow** (`@xyflow/react` 12, MIT). A node here is a form: a role has switches, a list of models, lists of
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

## Three screens

| Screen       | Shows                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Gallery      | The templates, each with its name, description, tags and its graph as a cover                    |
| Graph        | One template: its nodes wired, a panel of its files, its faults on the nodes they concern        |
| Node library | Every kind of node, in families, to drag onto the graph                                          |

## The look

After ComfyUI's, so a person who knows one finds their way in the other.

- One dark ground. Nodes are neutral; colour is kept for the wires, their sockets and the dot before a node's name,
  one colour to a kind of wire.
- What comes into a node is on its left, named in lower case. What goes out is on its right, named by its kind in
  capitals, as ComfyUI names a type.
- A setting is a row: its name on the left, its value on the right.
- A node with one socket and nothing to set is its title alone, as a collapsed node is. The side panel says the rest
  of the node that is picked, and shows the file it is kept in.
- A family no wire places sits in a titled frame that carries its nodes when it is moved: the reflex questions.
- A card in the gallery is covered by the template's own graph, drawn small, with its name over it. No picture is
  kept beside a template, so a cover is never out of step with what it covers.

## Nodes

| Family    | Node                | Holds                                                                    | Wires                              |
| --------- | ------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| Team      | Role                | Its name, its properties as switches, its tool groups as ticked lists, its prompt, its models | `spawns`, in and out |
| Team      | Human               | One, fixed                                                               | From each role that may ask or message the Human |
| Equipment | Skill               | Its folder: `SKILL.md` and the files beside it                           | To each role that has it           |
| Equipment | Outside server      | Its command or address, the variables it names                           | To a role; the tools are picked on the wire |
| Equipment | Optional tool group | Findings; the machine's hold                                             | To a role                          |
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
| Flow      | `then`                     | A line of `flow.md`                                  | Nobody: the record shows where it was left   |

- **Speaking is not a free wire.** A role speaks to its `parent`, its `children`, its `descendants` or the Human,
  counted along the tree of scopes. So it is four switches in the role's node, drawn as arrowheads on its `spawns`
  wires and as a wire to the Human.
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

The steps are kept in `template.json`. On each save the editor writes `flow.md` from them: one line a step, in
order, with the role that does it and where the work goes back to. `flow.md` is not edited by hand in a template
that has steps.

## Files

A click on a role opens its prompt; on a skill, its folder. The panel shows the files as a tree, edits Markdown with
its rendering beside it, and takes a file dropped into a skill's folder.

A new role, skill, question or moment starts from a skeleton: the five parts of a prompt and the form of a skill
(`TEMPLATE.md`, Each kind of file); for a question or a moment, the fields `REFLEX.md` asks for, with an outcome to
describe for each answer.

## Checks

Shown on the node they concern, as the template is changed.

- What `resolveProfile` refuses: no root or more than one; a role that spawns but does not delegate; a role with two
  kinds; a `spawns` that names no role.
- **The always-on words of each role**: its prompt, the descriptions of its skills and the flow, counted, beside
  SLP's own as the mark. This is the cost a template raises without anyone seeing it.
- A prompt that names, in backticks, a tool its role is not shown.
- A prompt or a skill that names a role the template no longer has.
- A prompt of a watched role that names the watch.
- A skill whose folder and `name` differ, whose description does not say when to use it, or which points at a file
  that is not beside it.
- A question whose backticked field is not in its `state`, or which lacks the description of an outcome.
- A question whose words changed: shown as not yet earned, since its threshold was earned for the old wording
  (`REFLEX.md`).

## Easy to use

A template is some five to thirty nodes, so drawing is never slow; what is felt is the handling.

- A wire dropped on empty space opens the node search, already narrowed to what that socket takes.
- A node is dragged from the library onto the graph.
- While a wire is dragged, the sockets it cannot go to are dimmed.
- Undo and redo, copy and paste, delete by key, and one button that tidies the layout.

## Cases

They join `CONFORMANCE.md` with the step that builds them; those of reading are there already.

| Case                                                                 | Expect                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `delegates` switched on for a role                                   | Its five groups appear, every tool ticked                        |
| A tool unticked in one role's group                                  | Gone from that role's `tools`; another role's list unchanged     |
| A wire dragged to a socket of another kind                           | Not made                                                         |
| The root switch turned on for a second role                          | The fault `resolveProfile` gives, on that node                   |
| A tool unticked that the role's prompt names in backticks            | A fault on the role, naming the tool                             |
| A role renamed                                                       | Its prompt's file and every `spawns` follow; a prompt still naming the old one is a fault |
| A file dropped into a skill's folder that `SKILL.md` does not name   | Kept; no fault                                                   |
| A question's words changed                                           | Shown as not yet earned                                          |
| A template with steps saved                                          | `flow.md` holds one line a step, in order, each with its role    |

## To check before building on it

- Whether the flow, added to a role's standing instructions, repeats what SLP's hand-written prompts already say. It
  is tried on the SLP profile before any template relies on it.
