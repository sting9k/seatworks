# Reflex

A reflex is a fast, cheap, typed judgement: text and a few typed questions go in, and an answer to each comes back
with a calibrated probability. Jev, TypeSafe's first System One model, is the first to back it. It lets the plugin
look at every event as it happens, where V1 could afford to look only on a timer. **The reflex notices; the roles
decide.** SLP's thinking stays with the agents, and the Supervisor is the one that judges.

## Jev, as read on 29 September 2026

Read from `@typesafe-ai/sdk` 0.6.0 in full. TypeSafe's own pages are closed to this machine, so the figures marked †
come from third-party write-ups of them.

- `POST /v1/systemone` with `{ model, state, questions }`. `state` is text or JSON. Each question is a `noul`
  (yes or no), a `choice` among named labels, or a `score` on an ordered rubric, each with instructions and a
  description per outcome.
- Every question is answered in one pass: `noul` gives the probability of yes, `choice` a label with its confidence
  and each label's probability, `score` an expected score with probabilities. No text is generated, so there is
  nothing to parse and no string to make up.
- About 100 ms a call; $0.042 per million input tokens, output free; 32k tokens for the state and the longest
  question, 64k in all; 255 labels at most; 1,200 requests a minute. †
- Hosted only, with closed weights. No retention only on the enterprise tier; it is also served through OpenRouter,
  which V1 used with data collection denied. †
- Agreement with frontier models' labels is about 68%, below theirs. † Its strength is calibration: the probability
  says how far to trust the answer. So a threshold holds only for the model it was set against, and the model is
  pinned by version.

## What it may do

Its output takes one of three forms, and nothing else:

1. **A note to a role**, along an edge the reflex's questions name (`tells`). The note is a message that asks
   nothing and opens no obligation. It carries the question, the probability, the model and the text it read.
2. **Evidence** of kind `judgement` on a commit, beside the evidence runner's checks, for whoever integrates to weigh.
3. **A delivery fact** to an agent whose words did not reach the record, such as a question written in its chat that
   was never asked through a tool. The fact concerns delivery, not the agent's work.

It never moves a line, classifies a finding, integrates, lands, answers a question or a permission, opens or closes
an obligation, holds a scope, or ranks, merges or drops a message (KERNEL I12). A note says what was seen, never what
to do: V1's patterns carried advice in a `next` field, and v3 does not.

## Where it looks: the record, on its events

It reads what the record already holds: briefs, plans, findings, answers, hand-backs and reports, and a hand-back's
diff. It does not read agents' thinking; WORKFLOW decision 3 settles that the record comes first. Whatever code can
check stays code. A constraint whose origin is not the Human, a hand-back with no evidence on its commit, and a claim
of green checks against a red run are facts the kernel's views already show. The reflex takes only what needs a
reading of meaning.

The SLP profile's starting questions:

| On                                         | Asks                                                                                      | Goes to               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------- |
| `brief_issued`, `brief_amended`            | A discovery brief that fixes the method; a cause given as fact; a closed set of options; a goal nobody could observe; a brief that reads as the other kind | the root, a note      |
| `finding_raised`, `plan_amended`, `brief_amended` | Touches the goal or cost the Human approved (§7.3), beyond what I6 catches from origins | the root, a note that wakes it |
| `finding_classified` as kept               | The reason does not meet the evidence the raiser gave                                     | the root, a note      |
| `report_made`                              | Settles how the system is built, a structure or contract others will build on, with no line of the plan recording it | the root, a note      |
| `hand_back`                                | The diff loosens or deletes an assertion; bends product code so a check passes; leaves a stub or fake where the brief asked for the thing; the claim names a gap in the work | evidence on the commit |
| a message the Human types into an agent's chat | Whether it sets a requirement, says the code is wrong, asks, or approves                  | a fact on the Lead's copy |
| `turn_ended` with no command in the turn   | Whether the agent handed back, asked, or said it waits, in words only                     | the agent, a delivery fact |

They come from V1's patterns and checks that read the record (pre-solves, closed-choice, vague-goal, big-decision,
gaming, proof-bends-product, stand-in, summary-admits-gap, instruction-kind). The ones that read thinking stay in the
record's history (struggling, turning, admits-wrong, obeys-against-judgement, wrapper, builds-for-maybe). If a look
back shows a late intervention the record could not have shown, the owner adds a question that reads the agent's
words to the profile. The agent host already streams them, so that is a data change, not a code change.

## Questions are data

`profile/slp/reflex.yaml` holds the pinned model and the questions. Nothing in code names one.

```yaml
model: jev-1.13.0
questions:
  presolve:
    on: [brief_issued, brief_amended]
    when: { kind: discovery }
    reads: [brief, parent.plan.goal]
    noul: Does `brief` say how the work must be done, rather than what must be true once it is?
    yes: It names the method, the fix or the design to use.
    no: It names the outcome and the constraints, and leaves the method open.
    over: 0.8
    tells: root
```

- One condition to a question. A model weighing two conditions in one answer loses one of them (V1).
- Every question on one event goes in one call, since Jev answers them all in one pass.
- `over` is the probability past which it speaks, with its reason written beside it. There is one value per question;
  V1's forty tuning values in `attention.json` go.
- `tells` is a relation (`root`, `owner`, `parent`, `self`) or `evidence`. `wakes: true` lets a note wake the role it
  is for. Otherwise it waits for the next message that asks something, as every note does.

## How it runs

- On an event already in the log. Never in a before-hook, never in the way of a command; the kernel never waits on
  it.
- One call an event, one at a time for each scope. A call that fails is logged and asked again once; after that the
  event goes unread. A hand-back's evidence step then says `not run`, so the Lead knows it is missing.
- A state past the budget is not cut to fit. The step says `too large`, and a diff is asked file by file over the
  changed tests and the files the claim names.
- The key lives in the plugin's settings and is never written to a log. The SDK's `debug` level logs request bodies,
  so it stays at `warn`.
- With no key set there is no reflex. The rest of v3 works the same without it.

## Measured by the record, taken away by subtraction

- Each answer is an `observation_made` event with its question, subject, model and probability, including those
  under the threshold, so the look back can see calibration.
- For each question, the look back reads how many notes were followed by an act of the role told on the same subject
  (an amendment, a hold, a question, a send-back). That is the ceremony signal (§10.3) applied to the reflex.
- A question that never leads to a change is removed from the profile at the look back. A threshold is never tuned by
  code: telemetry does not turn itself into a rule.
- A new model version is a release like Paseo's. Its thresholds are checked against the recorded observations before
  the pin moves.

## Port

```text
ask(state, questions, model) -> Result<{ model, answers, tokens }>
```

- Every question is answered as it was asked, or the call fails. An answer with one question missing is not what was
  asked (V1).
- Where to send it is data (`endpoint`, `model`, a `body` sent with every request such as OpenRouter's
  `data_collection: deny`). TypeSafe's own API and OpenRouter's route take the same body, so one adapter serves both,
  with no SDK.
- Another model that answers typed questions with probabilities can stand behind the same port.

## What V1 did that v3 drops

| V1                                                                   | v3                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| A tick every 30 s, looks every 5 minutes over thinking and words      | The record's events, as they happen                           |
| Two brains, a sensor and a Watcher seat                              | The reflex alone; the Supervisor is the one that judges       |
| An incident book beside the ledger                                   | Observations in the one log                                   |
| Forty tuning values nobody recorded a reason for                     | One threshold for each question, with its reason              |
| A `next` line of advice in each pattern                              | Facts only                                                    |
| No measure of whether a finding changed anything                     | Each question's yield, read at the look back                  |
| J1–J5 at hand-back                                                   | Evidence steps on the commit                                  |
| About 2,900 lines for the watch                                      | A port, one adapter and a data file                           |

## Open, for the owner

- Whether briefs, findings and diffs may be sent to TypeSafe or OpenRouter at all, and on which route.
- Whether a `judgement` step can hold an integration, as a failing check does under I4. The recommendation is no: it
  is shown beside the checks and never holds, since a hold would make it the approval step N6 forbids.
