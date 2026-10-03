---
name: design-note
description: "Use this skill on a brief that asks for a design, and before you build a part other work will rest on. It holds how to design a part before it is built: its boundaries, the data it owns and the contracts others will call, with the options weighed. Not for a choice inside one function, and not for building: the design goes back to be weighed first."
---

# Design note

A design is a proposal someone else weighs. It earns that by showing what it was chosen against: one option with no
rival is a preference.

1. **The forces.** What must hold, and whose word each is. What is known of the load: how much, how fast, what fails
   and how often. What will be built on this, and what is likely to change. What nobody knows yet.
2. **What is there.** The seams the code already has, its conventions, its recorded decisions (`domain-docs`). A
   design that ignores them is a rewrite nobody asked for.
3. **Two options that could each work**, the simplest thing among them. For each: its shape (the parts, who calls
   whom, which part owns which data), the contract in the language's own types where you can write it, what it costs
   to build and to change later, where it breaks first, and what it takes on trust.
4. **Choose by the forces.** Say which force decides. A choice that is cheap to undo needs little; one that is not,
   a schema others write to or a public interface, needs its riskiest assumption proven first, by a `spike` or by a
   thin slice end to end.
5. **Leave it unbuilt.** Unless your brief says to go on, hand the design back: your Lead may be running others
   beside yours, and a design already half built argues for itself.

## The note

One file in the repository: where your brief says, or `docs/design/<topic>.md` when it names none and your paths
hold it. A page:

- **Context**: the forces, in a few lines.
- **Decision**: the shape, and the contracts as code.
- **Not taken**: each other option, with why.
- **Consequences**: what this makes easy, what it makes hard, what would make you choose again.
- **Unproven**: what it takes on trust, and how to prove each.

## Ends in

`hand_back` on the commit that holds the note, with the decision in a sentence and what is unproven. A premise of
your brief that the design shows cannot hold is a `raise_finding`.
