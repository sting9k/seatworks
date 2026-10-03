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
| `project.md`            | What every agent in an attached project must know of the team, kept in its `AGENTS.md`  |
| `flow.md`               | The team's flow, when the profile names one: each step with the role that does it, given to every role after its own prompt. Words an agent reads, never a rule the kernel holds (`TEMPLATE.md`) |
| The Human's rules       | Their own way of working, outside any profile: `rules/<profile>/all.md` and `rules/<profile>/<role>.md` under the state root, by profile since a role's name is its profile's, after the role's prompt of each agent made from then on |

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
- **Settles with the Human** direction and the architecture the lanes build on (CONCEPT-V2 §3, A3.7¶3), at the level
  of parts and how they meet. A choice that is hard to reverse, surprising without its reason and a real trade-off
  is asked as a question; what the Human already decided, ruled out or tried is asked early, since the repository
  does not hold it; the rest is the Supervisor's default, listed for the Human to overturn. A Supervisor that lists
  every such choice as assumed leaves a Human who designed part of it nothing to say until the lanes are built.
- **Steps in** when the watch or a Lead's report says so, with the smallest step: nothing, an open question, a
  blind design asked of the Lead, a hold, the Human (`WATCH.md`). What the watch sees in a Peer goes to its Lead
  first, and reaches the Supervisor only when the Lead leaves it.
- **Takes to the Human** any change to the goal or the cost they have not approved; decides the rest.
- **Keeps its context clean.** It reads `status`, reports and attentions, and `look`s only where one points. A
  Supervisor that scans spends the wide view it is there for.
- **Model.** A long context and sound judgement over many threads, not the strongest coder.

## Lead

- **Owns** the lane's shared state (its plan), who writes what, the order, integration, and acceptance.
- **Is a brain, not a dispatcher.** It reads code, runs what it must to decide, and holds a framing of its own. It
  builds little: a Lead that builds loses the distance it judges from, and I2 keeps it out of what it gave away.
- **Makes the smallest changes itself.** One whose brief would cost more than the change, in what it has not
  handed out: a typo, a line, the step that joins two Peers' parts, or a whole lane that is nothing more. Whether
  a change is that small is its judgement, as the owner asked. It goes up with the lane's hand-back, so the
  Supervisor takes it in on the same evidence as the rest.
- **Keeps its own idea to itself** when it briefs. It asks open questions, and for a hard decision with many sound
  answers it runs two or three blind designs, on different models where it can, then brings them together. It favours
  neither the one that matches its idea nor the one argued hardest, and thinks again where they contradict it. No
  shared room: there, the strongest arguer wins.
- **Escalates** to the Supervisor what touches the goal or the cost, what reaches another lane, and a design where no
  answer stands clear of the rest.
- **Steers its Peers.** An attention about a Peer comes to its Lead, which owns the scope it concerns: nothing, one
  open question at the Peer's turn boundary, a finding upstream, or a reseat (`steering`).
- **Stays on its line.** A branch found mid-lane goes to a scope of its own. A full context is compacted, not feared.
- **Model.** The strongest reasoning available.

## Peer

- **Owns** one task and the engineering judgement inside it.
- **May question** anything in its brief but the outcome its goal names: a constraint with evidence that it cannot
  hold, a choice whenever the code shows it does not fit, and a method or design written into the goal, which is a
  choice wherever it is filed (§5.3: the parachute may be asked about unless the work is a trial of parachutes).
  Offered A or B when C is right, it says C.
- **A right, not a duty.** Agreement the evidence supports is a real answer. A Peer told to find fault finds some.
- **Returns** evidence to its Lead: a commit and what was run on it, and a finding with the evidence that raised it.
- **Takes to its Lead** a decision bigger than the task before building on it: a contract others will build on, or a
  trade of a quality the goal names.
- **Model.** Chosen per task by the Lead from the role's list.

The Reviewer is a kind of Peer (CONCEPT-V2 §3.2): seated by its Lead on one commit, in the lane's worktree and
with no leave to commit there, it returns a verdict that is evidence and decides nothing. It is worth its cost only when it changes the
work, and the look back counts how often it does. The concept's Architect and Auditor (A3.8¶4) are uses of it, not
roles: the Lead asks a Reviewer one design question, or seats it on the lane's head to read the lane whole. Either
becomes a role only when a look back shows a Reviewer's brief cannot carry it. A question's answer carries no verdict
on the commit: a pass or a fail asked of an open question is the frame of a pre-solved brief (A3.3¶1), and a "no"
would stand as a failing result on a commit it never judged. What was found is said before the verdict, so the
verdict sums up the finding rather than the finding arguing for a verdict already given.

## Models per role

A role names Paseo agent profiles, the first its default (PASEO.md). The opener of a scope may pick another from the
list. Different models in blind designs are the point: one model on one question tends to one answer.

## What V1's prompts did that Seatworks' drop

| V1                                                                  | Seatworks                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| The desk's mechanics as rules: merge queue, review rounds, severity ladder, lane review timing | The kernel and tool replies; severity in the Reviewer's prompt |
| A Lead that never reads code                                        | A Lead that reads and runs what it needs to decide   |
| `council`: two reviewers asked a hard question                      | Blind designs: discovery scopes briefed apart         |
| A Supervisor loop of thirteen numbered steps                        | Three questions, and the skills for each moment      |
| `CONTEXT.md` and a notebook beside the ledger                       | The Human's lines in the plan, with their origin     |

## Skills

| Role       | Skill                          | From V1                                  |
| ---------- | ------------------------------ | ---------------------------------------- |
| Supervisor | `grilling`                     | Rewritten: settles the plan's lines, and the shape that is costly to change |
| Supervisor | `attention`                    | New (`WATCH.md`)                         |
| Supervisor | `compile-rules`                | Not shipped until the project-rules pipeline reads `rules.yaml` (`REFLEX.md`) |
| Supervisor | `pre-mortem`                   | Kept                                     |
| Supervisor | `retrospective`                | Rewritten: the chain of change and the five signals, fixed by taking away |
| Lead       | `steering`                     | New (`STEERING.md`)                      |
| Lead       | `blind-design`                 | Replaces `council`                       |
| Lead       | `planning-lanes`               | Kept for high-risk work                  |
| Peer       | `test-first`                   | Kept, with minting an API at the top     |
| Peer       | `diagnosing-bugs`              | Kept                                     |
| Supervisor | `architecture-premise-audit`   | Rewritten for Seatworks' tools, its lenses folded in |
| Lead, Peer | `domain-docs`                  | New: the glossary and ADRs               |
| Peer, Reviewer | `security-check`           | Rewritten: ends in a hand-back or a finding |
| Peer, Reviewer | `proof-audit`              | `test-proof-debt-audit` merged with the test-audit gate and its patterns |
| Supervisor | `appetite`                     | New: an appetite from what the outcome is worth, and what an overrun leaves |
| Supervisor | `lane-portfolio`               | New: order, how many at once, a premise that reaches past a lane, stopping |
| Lead       | `acceptance-walk`              | New: the lane checked as a user meets it, as evidence on its head |
| Lead       | `repo-refresh`                 | Rewritten: cuts made by scopes, the record holds what V1 kept in notes |
| Peer       | `spike`                        | New: one fact from throwaway code, on a discovery brief |
| Peer       | `measuring`                    | New: a number with its spread and conditions |
| Peer       | `tidy-first`                   | New: structure committed apart from behaviour |

Folded in rather than added: where scopes meet, into `planning-lanes`; wayfinding through fog, into `grilling`; a
failure that comes and goes, into `diagnosing-bugs`; reading designs in reverse and settling a fact by running it,
into `blind-design`.
