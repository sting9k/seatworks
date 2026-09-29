---
name: kernel-change
description: "Adds or changes a kernel command, event, invariant or entity in shared/kernel as a pure decider (decide, evolve, react), test first from spec/CONFORMANCE.md. Use for any change to what the kernel keeps, checks or asks of satellites; not for a satellite's own behaviour or for profile content."
---

# Kernel change

The kernel is the team's authority ledger and nothing more (`spec/KERNEL.md` §1, §9). Every change starts from the
spec and ends with the spec, the conformance cases and the code saying the same thing.

## Before writing code

1. Find the clause: the CONCEPT-V2 rule (P, N, §) and the `KERNEL.md` section it lands in. No clause, no change: ask
   the owner.
2. Ask the governing question: does this take a constraint off SLP or add one? A new refusal is legal only as an
   invariant (§5). Name it, and put the reason in the commit.
3. Write the conformance row first (`spec/CONFORMANCE.md`), then its test, and watch it fail.

## The shape

```ts
// shared/kernel/decider.ts: the whole kernel is three pure functions and an initial state
export type Decision = { readonly ok: true; readonly events: readonly Event[] } | { readonly ok: false; readonly refused: Refusal };
export type Refusal = { readonly invariant: InvariantId; readonly says: string };

export function decide(command: Command, state: State, profile: Profile): Decision { /* switch on command.type */ }
export function evolve(state: State, event: Event): State { /* switch on event.type; never refuses */ }
export function react(event: Event, state: State): readonly Effect[] { /* effects the event asks for, each keyed */ }
```

- **`decide`** checks the caller's role properties (never its name), walks the scope graph for authority, checks the
  invariants, and returns events or one refusal naming the invariant. A refusal is a value; a throw is a bug.
- **`evolve`** folds one event and cannot fail: the event already happened. Unknown state is a bug in `decide`.
- **`react`** says what the event asks the world to do. Each effect's key is `${event.seq}:${kind}[:n]`, so a restart
  re-dispatches the same keys and a satellite that saw one does the work once.
- **None** reads the clock, makes an id, or does I/O. The command arrives stamped: `{ id, at, caller, type, ... }`,
  with any ids it will need already made by the shell.
- One `switch` per function over the discriminated union, each ending in `assertNever(x)`. A new command or event is
  a new case, never a flag on an old one.

## Adding a command

1. Its arguments as a zod schema in `shared/contracts/commands.ts`; its type is `z.infer` of it.
2. Who may call it: a walk over the graph (owner of the parent, the writer, a role property), written once in
   `shared/kernel/authority.ts` and reused. The Human stands as the root's parent.
3. Its case in `decide`: authority, then each invariant it could break, then the events.
4. The events it appends, if new: payload in `shared/contracts/events.ts`, case in `evolve`, effects in `react`.
5. Its tool: shown to the roles whose `tools` name it in the profile. The tool's description says what it is for,
   never what to do next.
6. The spec: its row in `KERNEL.md` §6, its events in §7, its cases in `CONFORMANCE.md`.

## Adding an invariant

- It must be something CONCEPT-V2 says must hold, checkable from the state alone.
- One function `checkIn(state, change) -> Refusal | null` in `shared/kernel/invariants.ts`, called by every command
  that could break it.
- Add it to the property test's list: after every random command, every invariant holds on the folded state.

## State

- `readonly` everywhere; new state by spread, never mutation. Collections are `ReadonlyMap` keyed by id, so a lookup is
  never a scan.
- Derived facts (open obligations by holder, the chain of change) are computed from state or folded views, never
  stored twice.
- An obligation closes only when what is owed is done (I11); moving it to a new holder is an event, not a mutation.

## Done when

- The new conformance cases fail without the change and pass with it.
- The property test still holds every invariant over random sequences.
- Recorded logs in the replay fixtures still fold, or the change says why their shape moved (no upgrade step before
  3.0.0: the fixtures are re-recorded).
- `grep` finds no role name from the profile in `shared/` or `server/`.
