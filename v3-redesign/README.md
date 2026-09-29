# v3-redesign

Seatworks rebuilt the way CONCEPT-V2 describes SLP. A kernel holds the authority ledger: briefs with where each line
came from, scopes with their owner and edges, and findings from the evidence that raised them to the change they made.
Around it, satellites each do one job behind a port that names nothing of SLP: the agent host, workspaces, the evidence
runner, delivery, the Human's surface, the record.

## What it is built from

CONCEPT-V2 and the orchestration analysis it is read through are the standard. The current plugin, V1, is kept in
mind as a reference, not a model: well over half of it is the lesson of what went wrong, a delivery pipeline with SLP
painted on and each rule written three or four times. What it does well moves over, written again from the standard;
where V1 and the standard differ, the standard wins.

The plugin is a tool that serves the way SLP works, never a change to it. It checks what the concept says must hold,
records what the concept says must be known, and carries what agents say. What to decide, what to say and in what
order is the agents'.

## How the move goes

- `plugin/` keeps running until this does what it does, then goes in one cut. Neither imports the other, and nothing
  bridges them: no shim, adapter or shared state.
- A feature moves once the kernel or a satellite has a place for it, and is written again against the spec there, not
  copied with its old shape.
- This gets a plugin id and state root of its own, neither `seatworks-v2` nor `~/.local/share/seatworks-v3/`, so
  installing it never touches the old ledger or settings.
- Each SLP rule lives in one place: code when a machine can check it, a prompt when it needs judgement.

## Order

1. The kernel's spec. Done.
2. The kernel, the agent host, workspaces and the evidence runner: one lane, end to end, and one agent alone for a
   small change. Built and proved against a stand-in for Paseo (`test/bridge/lane.test.ts`); what only a live daemon
   can show is in `spec/PASEO.md` and `spec/HARNESS.md`, To check.
3. The Human's surface and the record. Built: a Paseo surface over the Human's view, the activity, a finding's chain
   of change and the five signals.
4. The reflex and the watch (`spec/REFLEX.md`, `spec/WATCH.md`), starting with their `active` sets. Built: Jev's
   client and settings, the starting questions and moments, going in circles and spend counted in code, and a test
   minting an API caught at the edit.
5. Anything more only when the record shows a failure that needs it.

## Spec

- `spec/WORKFLOW.md`: how a team works, stage by stage, and what was decided about it.
- `spec/COMMUNICATION.md`: how words travel, and what the plugin does not do to them.
- `spec/CORE.md`: how the kernel and the shell run: a decider, an outbox, one writer per project, and what the
  systems that already run agents taught.
- `spec/KERNEL.md`: the authority ledger: profile, scopes, lines, findings, evidence, obligations, invariants,
  commands, events, views.
- `spec/LEDGER.md`: the ledger in detail: ids, state, every command's arguments and event's payload, effects, and
  what grows and is removed over months of use.
- `spec/PORTS.md`: what each satellite does and returns.
- `spec/CONFORMANCE.md`: the cases an implementation proves.
- `spec/PASEO.md`: what v3 takes from Paseo, what it leaves, and how it survives Paseo's releases.
- `spec/ROLES.md`: the Supervisor, the Lead and the Peer: what each owns, what goes in a prompt, and what V1's
  prompts carried that the kernel now holds.
- `spec/STACK.md`: the language of each part and why, and the plugin's layout as Paseo builds it.
- `spec/HARNESS.md`: how Claude Code, Codex, Pi and Oh My Pi are run, with one policy and one set of guards.
- `spec/REFLEX.md`: the reflex: every place v3 asks Jev, how a call runs, how questions are asked well and earn their
  thresholds, the project's own rules, red-check triage, and what the tools built on Jev taught.
- `spec/STEERING.md`: when a Lead should steer a Peer, when a Peer should stop working around and raise it, and who
  is told, from what the research on agents found.
- `spec/WATCH.md`: the watch, which tells the owner above the work when a Lead or Peer needs attention, and how it
  asks.

## Layout

The plugin's layout, and the language of each part, are in `spec/STACK.md`. In short:

```
AGENTS.md      the rules for whoever builds it; .claude/skills/ holds their recipes
concept/       CONCEPT-V2 and the orchestration analysis, exported from the owner's docs: the standard
spec/          for whoever builds it
profile/slp/   the SLP preset: profile.yaml, reflex.yaml, watch.yaml, roles/*.md, skills/, reference/ANTIPATTERNS.md;
               a project's own rules.yaml lives in that project's state, compiled from its instruction files
shared/        the kernel (pure TypeScript, run by the daemon and the app alike) and the zod contracts
server/        the bridge and the satellites, in TypeScript on Node; the store is SQL on node:sqlite
client/        the Human's surface, in React Native
bin/, harness/ the git shim and the team's MCP server; each agent's shipped settings
```

## Requirements

- Paseo `>=0.10.0`.
- Jev, through OpenRouter or TypeSafe's own API, with its key set in the plugin's settings. It is a soft dependency:
  without it the team still works, less watched, and the Human is told.
- git.

Nothing else. A requirement is added only when no one could do the work without it; what a Human already has, such as
an IDE's index, may be configured as a tool for agents and is never needed by v3 itself.

## Decided

- The kernel is TypeScript in `shared/`, so it adapts to Paseo's own bundles and runs in both the daemon and the app.
  Each part around it takes the language it is strongest in, as long as the user installs nothing more
  (`spec/STACK.md`).
- The log is a SQLite file of its own, on Node's built-in `node:sqlite`. A tracker may show the record; it cannot be
  it.
