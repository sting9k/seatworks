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

1. The kernel's spec.
2. The kernel, the agent host, workspaces and the evidence runner: one lane, end to end, and one agent alone for a
   small change.
3. The Human's surface and the record.
4. Anything more only when the record shows a failure that needs it.

## Spec

- `spec/WORKFLOW.md`: how a team works, stage by stage, and what was decided about it.
- `spec/COMMUNICATION.md`: how words travel, and what the plugin does not do to them.
- `spec/KERNEL.md`: the authority ledger: profile, scopes, lines, findings, evidence, obligations, invariants,
  commands, events, views.
- `spec/PORTS.md`: what each satellite does and returns.
- `spec/CONFORMANCE.md`: the cases an implementation proves.
- `spec/PASEO.md`: what v3 takes from Paseo, what it leaves, and how it survives Paseo's releases.
- `spec/HARNESS.md`: how Claude Code, Codex, Pi and Oh My Pi are run, with one policy and one set of guards.
- `spec/REFLEX.md`: the reflex, a cheap typed judgement (Jev first) that notices on every event and decides nothing.
- `spec/WATCH.md`: the watch, which tells the Supervisor when a Lead or Peer needs attention, and how it asks.

## Layout

```
spec/          for whoever builds it
profile/slp/   the SLP preset: profile.yaml, reflex.yaml, watch.yaml, roles/*.md, skills/, reference/ANTIPATTERNS.md
kernel/        entities, invariants, commands, views; no I/O, no Paseo, no role names
satellites/    store, agent-host (with harness/<agent>/), workspace, evidence, delivery, machine, human, record,
               code-index, reflex; each imports only its own port
tools/         the MCP server; each role's tools from profile.yaml
bridge/        the Paseo plugin's entry, the only place that builds the whole
```

## Open, for the owner

- The kernel's language. The Paseo bridge is TypeScript whatever it is.
- Which store backs the log: a file of its own, or a tracker the Human already reads.
- Whether a `judgement` step can hold an integration (`spec/REFLEX.md`).
