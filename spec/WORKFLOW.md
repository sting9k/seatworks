# Workflow

How a team works in Seatworks, stage by stage: who acts, what the kernel checks and records, and what the role's prompt
carries, which is judgement only. The kernel's entities and invariants go in `KERNEL.md`.

The stages run forward, but a finding can send the work back to any stage before it, and every return is on the
record. That is SLP's thesis: a premise found wrong by whoever touches the code must be able to change the plan.

```
Human ─goal─► 0 Intake ─► 1 Open ─► 2 Plan ─► 3 Work ─► 4 Accept ─► 5 Integrate ─► 6 Land ─► 7 Look back
                            ▲         ▲         │
                            │         └ finding ┤  brief, order, owner or dependency changed
                            └ finding on goal ──┘  or cost: the Supervisor takes it to the Human
```

## 0. Intake: the Supervisor with the Human

- The Supervisor questions the Human until the goal, the constraints and the appetite are settled.
- When the project's instruction files are new or have changed, the Supervisor compiles their rules (`compile-rules`),
  once the project-rules pipeline that reads them is built; until then no skill tells it to.
- The first time, the Supervisor sets the project's checks from what the project already runs (its scripts, its CI),
  and the Human sees them.
- Kernel: records the plan (goal, limits, what is not yet known and how each is checked, and the words the domain is
  spoken of in). Each line carries its origin, here the Human. The glossary and the map in the repository are
  written from it, and each lane landed adds to the map.
- Prompt: when not to open a team. A small change goes to one agent that owns and writes it, its evidence still bound
  to its commit. Work that needs the Human's feedback all along (UI, feel) stays with the Human.

## 1. Open a scope: the Supervisor

- The Supervisor opens a lane and seats its Lead.
- Kernel: a scope owned by the Lead, the siblings it waits for, a workspace. Refuses a lane whose write
  set meets an open lane's, unless it waits for that lane.
- Prompt: the directive states the goal, not a solution.

## 2. Plan: the Lead

- The Lead reads, sends a scout for what it cannot see, and splits the work by who writes which files.
- A hard decision with several sound answers goes to two or three blind designs: discovery scopes with the same brief,
  which carries neither the Lead's own idea nor the other designs, then brought together by the Lead. No shared room:
  in one, the strongest arguer wins, not the best design.
- Kernel: each sub-scope gets a brief (goal, constraints that must hold, choices made so far) and a kind, verification
  or discovery. Each line records who wrote it. Checks one writer per scope, and that the Lead writes in no scope it
  gave away.
- Prompt: a plan is a set of hypotheses. Brief the symptom, not a cause chosen in advance. A narrow brief only for
  verification.

## 3. Work: the Peer

A Peer leaves its work in one of two ways.

- **While it works.** An edit that appears to break one of the project's written rules comes back to the Peer at
  once as a fact quoting the rule, and it repairs it while the change is small. The watch tells its Lead when the
  Peer's work needs attention (`STEERING.md`); the Peer never hears of the watch.
- **Hand-back.** The Peer commits and the evidence runner runs on that commit. "Done" is a claim; the evidence is what
  the Lead weighs.
- **Finding.** The code contradicts a premise, constraint or choice of the brief, and the Peer raises it with
  evidence: a test that reproduces it, a measurement. The kernel opens an obligation on the Lead to answer. Prompt: a
  right to speak, not a duty; never write in another owner's scope.

The Lead answers a finding:

| Step       | Kernel                                                                          | Lead's prompt                         |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| classified | One of three, with a reason: changes the decision, another sound option, not worth stopping for | How to weigh the evidence |
| carried    | Points to the event that changed the brief, plan, order or owner               | A redesign answers four questions first: when the fault shows, whether a small fix is enough, what it drops, what it adds |
| kept       | A reason the Peer can argue with                                                | Keeping the plan needs a reason too   |
| reproven   | Integration cites evidence on the very commit it takes in                       |                                       |

A change that touches the goal or the cost cannot be applied until the Human answers; the Supervisor puts the
question. While a finding waits, the Peer names its default and goes on with what the finding does not touch.
Nothing blocks it.

## 4. Accept: the Lead

- The Lead weighs the evidence runner's checks on the commit and reads the diff, with the reflex's `judgement`
  evidence beside them and, for a red check, whether it failed on the environment or the code.
- When a doubt remains that a reader could settle, the Lead seats a Reviewer, a kind of Peer, on that one commit.
- Kernel: a verdict is recorded as evidence and decides nothing. Acceptance points to evidence of the commit that is
  merged. Over a red gate the Lead may still accept, with a reason.
- Prompt: when a review is worth its cost. A green suite proves only what its author thought to test.

## 5. Integrate and report: the Lead

- The Lead checks the outcome as a user would meet it.
- Kernel: evidence on the lane's head. The report is built from the record: decisions, unchecked assumptions, open
  disagreements.
- Prompt: parts that pass alone can fail together.

## 6. Land: the Supervisor

- Kernel: base merged into the lane, evidence on the head that lands, then it lands. A conflict between lanes: the
  Supervisor chooses which lane takes it.
- Landing is local and can be undone. Publishing to the project's remote cannot: the Supervisor or the Human calls
  `publish`, never forced, and the Supervisor tells the Human at once.

## 7. Look back: the Supervisor and the owner

- Kernel: the chain of change of each finding, and the five signals as ratios, never turned into rules.
- Prompt (retrospective skill): the diagnosis table. Fix by taking away: edit the profile, add no mechanism.

## Always open

- Every agent is pointed at the project's glossary, ADRs and map before it plans. A decision hard to reverse,
  surprising without its reason and a real trade-off gets an ADR from whoever made it, in the commit it explains; work
  that contradicts one is a finding.
- The Human sees at any time the brief each agent works to, which constraints are theirs, which decisions an agent
  made, and which disagreements are open.
- A word from the Human or the Supervisor straight to a Peer gives its Lead a copy. One that directs also opens an
  obligation that stays open until the change reaches the lane's state; the Human sees whether it did. An open
  question directs nothing.
- A Peer measuring holds the machine, and the plugin starts nothing beside it.

## Decided

1. A Peer waiting on an escalation names its default and goes on with what the escalation does not touch.
2. The Lead redraws ownership inside its lane, the Supervisor between lanes. A handover moves paths in one event, so
   a path never has two writers.
3. The watch reads the words and thinking of Leads and Peers as they work and tells the owner above the work when one
   needs attention: a Peer's Lead, or the Supervisor for a Lead. The owner decides whether to ask, and asks an open
   question (`WATCH.md`, `STEERING.md`). The reflex also reads
   each brief, finding and report as it lands (`REFLEX.md`).
4. A branch found in the middle of a lane, such as authorization finding no authentication under it, goes to a scope
   of its own, and the lane waits for it; the Lead does not stretch to fill it. A Lead's full context is compacted,
   not feared.
