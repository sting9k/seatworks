# v3-redesign

Seatworks rebuilt the way CONCEPT-V2 describes SLP. A kernel holds the authority ledger: briefs with where each line
came from, scopes with their owner and edges, and findings from the evidence that raised them to the change they made.
Around it, satellites each do one job behind a port that names nothing of SLP: the agent host, workspaces, the evidence
runner, delivery, the Human's surface, the record.

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

## Open, for the owner

- The kernel's language. The Paseo bridge is TypeScript whatever it is.
- Where the shared state lives: in a tracker the Human already reads, or in a store of its own.
- Whether a watch comes back, and what it watches that prompts and code do not already catch.
