---
name: clean-code
description: "How Seatworks' TypeScript is written so the next reader, human or agent, changes it safely: names, types, functions, modules, errors, comments, and a simplify pass over a working diff. Use while writing any code in Seatworks and again once it works, before the pre-commit review."
---

# Clean code

Code here is read far more than written, mostly by agents that take what they see as the pattern to follow. Every
shortcut becomes the house style. Write what you want copied.

## Names

- A name says what a thing is in the concept's words: `scope`, `brief`, `finding`, `obligation`, `evidence`,
  `effect`. The spec's glossary is the vocabulary; never a synonym for a word it already has.
- In `shared/` and `server/`, never a role's name: `supervisor`, `lead`, `peer` appear only in `profile/`.
- A function is a verb for what it does (`openScope`, `foldLog`, `settleEffect`); a predicate reads as a question
  (`isOpen`, `mayAmend`); a type is a noun. No `Manager`, `Helper`, `Util`, `Data`, `Info`, `Handler` without what it
  handles.
- A module is named for what it exports, in kebab-case: `obligations.ts` exports obligation functions, nothing else.

## Types

- Make wrong states unrepresentable. A scope that delegates has no writer: model that in the type, not in a comment.
- A discriminated union on `type` for commands, events, effects and results; every `switch` ends in `assertNever`.
- Brand ids that must not be mixed: `type ScopeId = string & { readonly __brand: "ScopeId" }`.
- `readonly` fields and `ReadonlyArray`/`ReadonlyMap` in `shared/`. Spread to change; never mutate a value you were
  given.
- Parse, don't validate: data from outside (a tool's arguments, a row, a hook's payload, a YAML file) goes through its
  zod schema once at the boundary, and inside it is trusted.
- No `any`; `unknown` at a boundary, narrowed at once. A `!` states an invariant the code guarantees, never a hope.

## Functions

- One job. When you describe it with "and", it is two.
- Pure where it can be: inputs in, value out. I/O sits at the edges, in the shell and the satellites.
- Early returns over nesting; no nested ternaries; no boolean parameter that switches behaviour (two functions, or a
  union option).
- Take what you use: `Pick<Services, "store" | "clock">`, not the whole object graph.
- Index before looping: a `Map` by id, a `Set` for membership; a `RegExp` built once per call.

## Modules and dependencies

- One concept per module. What two features share goes down to a module both may import, never sideways into one.
- `shared/` imports nothing that is Node or React. `server/satellites/*` never imports another satellite.
- Only the bridge builds the object graph; everything else is handed what it needs.
- No module-level state that does I/O. A module-level cache is bounded by a size cap or a key there are few of.
- An abstraction needs a second implementation or caller today. Compose; inherit almost never.

## Errors

- Expected failure is a value: `Result<T>` or a refusal. The caller must handle it; the type says so.
- A throw is a bug: `throw new Error("what failed, with the id")`, and `{ cause }` when rethrowing.
- A `catch` that does nothing says why in one `//` line, and guards only best-effort cleanup or a probe.
- Fail closed: a file that cannot be read is not written over; an unknown event type stops the fold loudly.

## Comments

- At most one docstring per declaration, one or two lines, saying why, a hidden constraint or a platform quirk.
- Inside a body, a `//` only where the reason is invisible in the code. None that restate it.
- No commented-out code, no TODO without the owner's decision behind it: open work lives in the spec's "To check".

## The simplify pass

Once the code works and its tests pass, read the diff as its next reader and take away:

1. **Delete** what no test and no caller needs: a parameter always passed the same value, a branch never taken, an
   option nobody sets, an export only tests use.
2. **Inline** a function called once whose name adds nothing to its body.
3. **Merge** two functions that differ by a constant; **split** one that does two jobs.
4. **Rename** anything you had to read twice.
5. **Flatten** nesting deeper than two levels with early returns.
6. **Move** a rule to where the concept lives: authority to the graph walk, a check to its invariant, a word to the
   profile.
7. Run `npm run check`. The simplification changes no behaviour, so no test changes with it.

Stop when removing anything more would lose meaning. Shorter is not the goal; nothing the reader must skip is.
