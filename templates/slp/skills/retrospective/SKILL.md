---
name: retrospective
description: "Use this skill when the first lane lands, then after a run, each week, and after an episode that cost a rework. It holds how to look back over the run from the record and end in at most one change, made by taking something away where possible, and in the upkeep of the watch."
---

# Retrospective

One change per look back, with two dated episodes behind it. Improve by taking away: a step that changed nothing, a
message round nobody needed, a responsibility on the wrong role. Never add a role, a checklist or an approval to keep
the method as it is. The first look back comes when the first lane lands: the watch starts wide, and that lane is
where its noise first shows.

## Read the record, not memory

`record` of the root scope ends with the five signals and, for each question and moment, its counts; `record` of a
scope holds its chains and the attentions about it.

- **Chains of change.** For each finding: what the brief said when the work was given, how long until it was
  classified, the evidence, which owners the change reached, what was integrated after it.
- **The five signals, as ratios:** findings on a line or scope that already had one; questions to the Human whose
  answer changed a plan or a brief; verdicts and failing checks followed by a send-back or an amended brief;
  attentions left until they climbed; messages that asked for an answer and got none. A review that seldom comes
  before a change has to show why it is still asked for.
- **The reflex and the watch.** For each question and moment: how often it was asked and how its answers fall, what
  the Watcher attended and passed, and what came of each attention (acted on, acknowledged, its kind marked noise,
  left to climb). A decisive question answers near 0 or near 1. A weak one sits in the middle: split it or give it
  an example. A noisy one goes past its threshold on most of what it reads: narrow it. Set or move a threshold only
  from these, for its wording and model.
- **The project's rules.** Rules that never fire, and rules that fire on most edits.
- **Premises reopened.** For each finding that reopened a brief or a plan: did its evidence come from the code (a
  repro, a contradiction, a measurement), or only from the work being hard? Reopening is a right to keep; two dated
  episodes of the second kind are what a watch moment for it needs.
- **The project's docs.** Which briefs, findings and reports drew on the glossary or an ADR, and which of them a
  reader found wrong. A doc nobody drew on across two look backs is proposed for removal from the profile:
  every agent reads its pointer, so an unused one costs a turn's attention for nothing.

Never hand whole logs to a model to find a failure; start from the record's views.

## Weigh

Write one episode per costly event, with its cost in something countable (a rework, a dropped scope, a question the
Human answered twice) and its class:

| Class         | It looks like                                                           | The fix lives in                                  |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Specification | Work nobody asked for, an invented contract, another problem solved     | A directive, a brief, the prompt that let it start |
| Coordination  | Two writers, a question that died, a result at the wrong role           | The profile's edges, a role's prompt               |
| Verification  | A proof that passed without the behaviour, a claim taken as evidence    | The evidence steps, when a Lead reads a diff       |

An episode that is one of the mistakes this way of working already names takes its name and its way out from
`ANTIPATTERNS.md`, beside this file: read the group it falls in (giving work, working, accepting and reporting,
improving the method).

Weigh each mechanism by what it changed, not by how much it ran. Judge the system, never the agent: "the scope held
one directory and the work needed two" is a finding, "the Peer was careless" is not.

## The watch's upkeep

Apart from the one change, as one list. Proposed for removal from the profile's `active`:

- every question and moment with thirty or more answers past its threshold and no attention acted on: fewer than
  one in ten of its answers would be;
- every one, whatever its count, with no attention acted on across two look backs, or none raised: it costs little,
  and it guards nothing;
- every one whose readers marked it noise more often than they acted on it, unless narrowing its wording is the one
  change.

They leave together. Each is judged on its own record, so taking away what never led to a change cannot blur what
the one change does, and a wide set that sheds one a look back stays wide for months.

## Ends in

At most one proposed change, as the smallest edit to one file of the profile (a prompt line, a skill step, a question,
a threshold), with its two dated episodes, its class, and what would show it made things worse. Beside it, the
watch's upkeep. Both for the Human to approve.
