# Making a template in the editor

A template is a way of working for a team of agents: who is on the team, what each may do, and what each reads. The
editor shows one as a graph of nodes joined by wires, lets you change it by hand, and gives you one file to install in
Paseo. You never change Seatworks itself.

This guide is for doing it by hand. To have an agent write a template for you, give it `TEMPLATE-SPEC.md` instead; you
can still open what it made here to look at it.

## Start

In a checkout of the Seatworks repository:

```sh
npm ci
npm run editor
```

Open the address it prints. Everything happens in the page: nothing is sent anywhere, and nothing is saved until you
export.

## The gallery

The first tab, **Templates**, lists the templates there are. SLP, the one Seatworks ships, is always there.

- **Open** on a card opens that template in a tab of its own.
- **Open a file** opens a template someone shared with you, a `.template.json` file.
- **Open a folder** opens a template kept as a directory, such as one an agent wrote.

Start from SLP and change it. Starting from nothing is more work and no safer.

## The screen

- **Tabs** across the top: the gallery, and one for each template open. A tab is marked while it holds a change you
  have not exported.
- **The rail** down the left opens one panel: **Nodes**, **Files** or **Notes**.
- **The graph** takes the middle. Drag the background to move, scroll to zoom.
- **Top left**, the **Graph** menu: Rename, Tidy up, Export, Close template.
- **Top right**: Undo, Redo, whether the template is exported, the **Export** button, and the switch for the panel on
  the right.
- **Bottom right**: fit the graph to the window, the zoom, the small map.
- **The panel on the right** says the rest of the node you picked and shows the file it is kept in.

## Reading the graph

| Node            | What it is                                                                    |
| --------------- | ----------------------------------------------------------------------------- |
| Role            | A seat in the team: what it may do, the tools it is shown, what it reads      |
| The Human       | You. One, fixed                                                               |
| Skill           | A craft a role opens when its moment comes: a folder with `SKILL.md`          |
| Tool group      | Findings, and The machine: two groups of tools any role may be given          |
| Outside server  | Tools from an MCP server that is not the team's                               |
| Step            | A step of the team's flow, and what comes after it                            |
| Reflex question | One condition asked of an event of the record, by a small model               |
| Watch moment    | One condition asked of what a watched role says and does                      |

What comes into a node is on its left, named in lower case. What goes out is on its right, in capitals. A wire goes
from an output to an input of its own kind, and while you drag one, the sockets it cannot go to are dimmed.

| Wire                                         | Means                                            |
| -------------------------------------------- | ------------------------------------------------ |
| A role's **SEATS** to a role's **seated by** | The first may seat the second under its own work |
| A role's **HUMAN** to The Human              | It may write to you and ask you questions        |
| A skill to a role's **skills**               | The role has the skill                           |
| A tool group to a role's **more tools**      | The role is shown those tools                    |
| An outside server to a role's **servers**    | The role may call the tools you name on the wire |
| A moment to a role's **moments**             | The role is watched for it                       |
| A role's **DOES** to a step's **done by**    | That role does the step                          |
| A step's **THEN** to a step's **after**      | The second follows the first                     |

### Inside a role

- **Switches** for what the role is: `root` (the one you work with; a template has exactly one), `delegates` (splits
  work and takes it back in), `writes` (writes code in a branch of its own), `reading` (reads one commit and gives a
  verdict), `watches` (reads other agents' turns and tells an owner when to look), `humanDoor` (may ask you).
  A role is one of `delegates`, `writes`, `reading`, `watches`.
- **Whom it speaks to**: `parent`, `children`, `descendants`.
- **Tool groups**, each a row such as `Hand-back 2 / 3`. Click a row to open it and tick or untick a tool. Switching a
  property on brings its groups with every tool ticked.
- **Reads every turn**: the words of its prompt, its skills' descriptions and the flow. This is paid on every turn, so
  watch it when you add to a prompt or wire a skill.

## The changes people make

**Rename the template.** Graph menu, Rename. The name decides what it installs as: `Night Crew` installs as
`night-crew`.

**Choose what a role runs on.** Pick the role; in the panel, **Models**. Each name is an agent profile you make in
Paseo's settings, which picks the agent and the model. The first is the default.

**Reword a prompt.** Pick the role. Its prompt is at the bottom of the panel: **Write** to change it, **Read** to see
it as the agent does. It is set when you click away.

**Give or take a tool.** Open the tool group in the role's node and tick or untick. For Findings and The machine,
draw or cut the wire from that group's node.

**Add a role.** In the Nodes panel, **Add**, then drag **Role** onto the graph, or click it to land in the middle of
the view, and name it. Then:

1. Switch on what it is, such as `writes`.
2. Drag from the **SEATS** of the role that will seat it to its **seated by**.
3. Set its **Models**.
4. Write its prompt over the skeleton. A line in italics is one the skeleton left for you.

**Add a skill.** Drag **Skill** onto the graph, name it, write its `SKILL.md`, and wire it to each role that has it.
Drop a file on the skill's panel to keep it beside `SKILL.md`.

**Add an outside tool server.** Drag **Outside server**, name it, and say in its panel how it is started (a command)
or reached (an address). Write a secret as a variable, `$NAME`, never as itself. Drawing its wire to a role asks which
of its tools that role may call.

**Lay out the flow.** Drag a **Step** for each step, say what happens in it, wire the role that does it, and wire each
step to the next. The editor writes the steps as a short passage every role reads. It is words: nothing stops work
done out of order.

**Add a question or a moment.** Drag **Reflex question** or **Watch moment**, then write its words in its file. It is
written and not asked until you tick **Asked** (or **Watched**) in its panel. Wire a moment to the roles it is
watched in.

**Rename anything.** Pick it; **Name** in its panel. Everything that named it follows.

**Take away or duplicate.** The picked node has three buttons above it: Take away, Duplicate, About it. The Delete key
takes away the picked wire, role, skill or step. Copy and paste make a second role of the picked one.

**Undo.** The buttons at the top right, or the keys you expect. Every change can be undone until you close the tab.

**A wire dropped on empty space** opens a search of the nodes that wire can go to, with a new node of that kind last.

When a change would leave a template that cannot run, such as a second root, it is not made, and a line at the top
says why.

## Notes

The **Notes** panel lists what a machine can see is likely wrong, each on the node it is about: a role nobody seats,
a writer with no way to hand its work back, a prompt that names a tool the role is not shown, a skill that points at
a file that is not there, a question that would never be asked. A note stops nothing. Read each one before you
export; a template with none can still be a bad way to work, which only running it shows.

## Files

The **Files** panel lists every file of the template by folder. Click one to read or write it in the panel on the
right. What you change on the graph is written into these files, each change in its own line, and nothing else in a
file moves.

## Export

**Export** downloads the template as one file, `<name>.template.json`. Until you export, your changes are only in the
page; closing the page asks first.

To keep working on it another day, open that file again with **Open a file**.

## Install it in Paseo

1. In Paseo, open **Seatworks**, then under **This machine** open **Plugin**.
2. Under **Templates**, give the path of the file you exported, and press **Read**.
3. Read what it brings: the name it installs as, its roles, the agent profiles its roles name, each outside server
   and what it runs, each variable it reads and whether it is set.
4. Press **Install**. A template of the same name is replaced.
5. **Match its agent profiles to yours**, under **Agent profiles** on the same page. Each name the template's roles
   give is listed. Open one and pick the agent profile of yours it should run on. A name you match to nothing runs on
   the profile of that very name, and the list says when Paseo has none. SLP's own names are matched the same way.
6. Attach a project. With more than one template installed, attaching asks which.

Before the team can run:

- Every name the template's roles list under Models is matched to an agent profile of yours, or has one of its own
  name in Paseo's settings.
- Each environment variable its servers read is set where Paseo's daemon runs.

A project keeps the template it was attached with. A template you install again, in place of the one a project runs,
reaches that project's agents when it is next opened.

## If something is off

| You see                                    | Do                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| A file will not open                       | The page says why. It is not a template file, or it names a file it lacks      |
| A change is not made                       | The line at the top says why; the template would not run with it               |
| A role's agent is not seated               | Its agent profile is neither matched nor in Paseo, or a variable its server reads is unset |
| A team that stalls                         | Read the Notes panel: most stalls are a role that cannot hand back or be seated |
| You want to check a folder without the page | `npm run template -- check <folder>` prints the same notes                    |
