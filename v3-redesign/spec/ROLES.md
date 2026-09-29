# Roles

SLP's three pillars, the Supervisor, the Lead and the Peer, as the SLP profile gives them. A role is a responsibility
and an authority, never a persona (CONCEPT-V2 §3). Each holds its own axis: the Supervisor is wide across scopes, the
Lead deep in one lane and its acceptance, the Peer deep in one task. None contains another.

## What goes where

| Where                   | Holds                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Kernel                  | What a machine can check: one writer, who may change which line, evidence on the commit, obligations, who may speak to whom |
| Tool descriptions and replies | How to call a command and what came of it; a refusal says which invariant       |
| The role's prompt       | Judgement only: what the role owns, what it must answer, how it decides                 |
| Skills                  | A craft used now and then, loaded when the moment comes                                 |
| `profile.yaml`          | Properties, tools, models, skills: the arrangement, as data                              |

V1's prompts ran to 166 lines for the Lead and 135 for the Supervisor, most of it the desk's mechanics told as rules:
merge queues, review timing, severity ladders. Each rule the kernel or a tool reply now holds leaves the prompt. What
is left is short enough to be read whole on every turn, which is the point: the author runs a Peer on about thirty
lines of instruction and finds that enough for it to push back.

## Each role answers three questions

From CONCEPT-V2 §3.1. The prompt is built to answer them and nothing else.

| Role       | Questions                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Supervisor | Which problems across scopes does it watch? When does it step in? Which decisions go back to the Human? |
| Lead       | Which shared state does it keep? What may it decide? When must it escalate?                      |
| Peer       | Which scope does it own? What may it change? Which assumptions may it question? Where does its evidence go? |

## Supervisor

- **Owns** the Human's intent turned into lanes, what happens where lanes meet, and landing.
- **Steps in** when the watch or a Lead's report says so, with the smallest step: nothing, an open question, a council
  asked of the Lead, a hold, the Human (`WATCH.md`).
- **Takes to the Human** any change to the goal or the cost they have not approved; decides the rest.
- **Keeps its context clean.** It reads `status`, reports and attentions, and `look`s only where one points. A
  Supervisor that scans spends the wide view it is there for.
- **Model.** A long context and sound judgement over many threads, not the strongest coder.

## Lead

- **Owns** the lane's shared state (its plan), who writes what, the order, integration, and acceptance.
- **Is a brain, not a dispatcher.** It reads code, runs what it must to decide, and holds a framing of its own. It
  writes nothing: a Lead that builds loses the distance it judges from, and I2 keeps it out of what it gave away.
- **Keeps its own idea to itself** when it briefs. It asks open questions, and for a hard decision with many sound
  answers it runs two or three blind designs, on different models where it can, then brings them together. It favours
  neither the one that matches its idea nor the one argued hardest, and thinks again where they contradict it. No
  shared room: there, the strongest arguer wins.
- **Escalates** to the Supervisor what touches the goal or the cost, what reaches another lane, and a design where no
  answer stands clear of the rest.
- **Stays on its line.** A branch found mid-lane goes to a scope of its own. A full context is compacted, not feared.
- **Model.** The strongest reasoning available.

## Peer

- **Owns** one task and the engineering judgement inside it.
- **May question** anything in its brief but the goal: a constraint with evidence that it cannot hold, a choice
  whenever the code shows it does not fit. Offered A or B when C is right, it says C.
- **A right, not a duty.** Agreement the evidence supports is a real answer. A Peer told to find fault finds some.
- **Returns** evidence to its Lead: a commit and what was run on it, and a finding with the evidence that raised it.
- **Takes to its Lead** a decision bigger than the task before building on it: a contract others will build on, or a
  trade of a quality the goal names.
- **Model.** Chosen per task by the Lead from the role's list.

The Reviewer, Architect and Auditor are kinds of Peer that read one commit and return a verdict. Their prompts are
short and come after these three.

## Models per role

A role names Paseo agent profiles, the first its default (PASEO.md). The opener of a scope may pick another from the
list. Different models in blind designs are the point: one model on one question tends to one answer.

## What V1's prompts did that v3's drop

| V1                                                                  | v3                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| The desk's mechanics as rules: merge queue, review rounds, severity ladder, lane review timing | The kernel and tool replies; severity in the Reviewer's prompt |
| A Lead that never reads code                                        | A Lead that reads and runs what it needs to decide   |
| `council`: two reviewers asked a hard question                      | Blind designs: discovery scopes, blind to each other |
| A Supervisor loop of thirteen numbered steps                        | Three questions, and the skills for each moment      |
| `CONTEXT.md` and a notebook beside the ledger                       | The Human's lines in the plan, with their origin     |

## Skills

| Role       | Skill                          | From V1                                  |
| ---------- | ------------------------------ | ---------------------------------------- |
| Supervisor | `grilling`                     | Rewritten: settles the plan's lines      |
| Supervisor | `attention`                    | New (`WATCH.md`)                         |
| Supervisor | `pre-mortem`                   | Kept                                     |
| Supervisor | `retrospective`                | Rewritten: the chain of change and the five signals, fixed by taking away |
| Lead       | `blind-design`                 | Replaces `council`                       |
| Lead       | `planning-lanes`               | Kept for high-risk work                  |
| Peer       | `test-first`                   | Kept, with minting an API at the top     |
| Peer       | `diagnosing-bugs`              | Kept                                     |
