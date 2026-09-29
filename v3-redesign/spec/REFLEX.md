# Reflex

A reflex is a fast, cheap, typed judgement: text and a few typed questions go in, and an answer to each comes back
with a probability. Jev, TypeSafe's first System One model, is the first to back it. It lets the plugin look at every
event as it happens, where V1 could afford to look only on a timer. **The reflex notices; the roles decide.** SLP's
thinking stays with the agents, and the Supervisor is the one that judges.

## Jev, as read on 29 September 2026

Read from `@typesafe-ai/sdk` 0.6.0 in full. TypeSafe's own pages are closed to this machine, so the figures marked †
come from third-party write-ups and independent tests of `jev-1.13.0`.

- `POST /v1/systemone` with `{ model, state, questions }`. `state` is text, a JSON object or an array. Each question
  is a `noul` (yes or no), a `choice` among named labels, or a `score` on an ordered rubric of at least two levels,
  each with instructions and a description per outcome.
- Every question is answered in one pass: `noul` gives the probability of yes, `choice` a label with its confidence
  and each label's probability, `score` an expected score with probabilities. No text is generated, so there is
  nothing to parse and no string to make up.
- 70 to 500 ms a call, with a floor near 430 ms in one test; 800 questions in one call took under a second. $0.042
  per million input tokens, output free; a judgement of about 1,000 tokens costs $0.00004. 32k tokens for the state
  and the longest question, 64k in all; 255 labels at most; 1,200 requests a minute. †
- No cap on the number of questions; the token budget is the only limit. Twenty yes-or-no questions on one state took
  the time of one and 559 tokens instead of about 5,800, since the state is read once. †
- OpenRouter serves it as `typesafe/jev-1.13` at `POST /api/alpha/decisions`, and at `POST /api/v1/systemone` with
  TypeSafe's own body; it lists a 32k context there. `jev-1.13.0` is the only version so far, and every response
  names the version that answered. †
- Hosted only, with closed weights. No retention only on the enterprise tier; it is also served through OpenRouter,
  which V1 used with data collection denied. †
- Agreement with frontier models' labels is about 68%, level with mid-price models and behind the frontier. One
  compound question scored 62.6% where the same decision split into five one-condition questions, weighed in code,
  scored 95.0%. Answers at 0.99 or above were all right in one test, and covered 60% of its traffic. †
- TypeSafe names nine weak spots: literal reading, arithmetic and counting, ordering dates, questions that need
  several hops, irrelevant text in the state, text in the state written to steer it, contradictory instructions,
  probabilities of a question and its negation that need not sum to one, and no text out. Two more were measured:
  about 13% of choices change when the labels are shuffled, and `choice` and `score` are overconfident while `noul`
  is underconfident on the same inputs. †

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

## Every use in v3

Everything v3 asks Jev, in one place. Each row's questions live in the profile; the spec named owns the rest.

| Asked on                                   | What it asks                                                                 | Answer goes to                         | Spec          |
| ------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- | ------------- |
| A brief issued or amended                  | Framing: a fixed method, a cause given as fact, closed options, a goal nobody could observe, the other kind | The Supervisor, a note        | this file     |
| A finding, a plan or a brief amended       | Touches the goal or the cost the Human approved                              | The Supervisor, a note that wakes it   | this file     |
| A finding kept                             | The reason does not meet the evidence                                        | The Supervisor, a note                 | this file     |
| A report                                   | Settles a structure no plan line records                                     | The Supervisor, a note                 | this file     |
| A hand-back's diff                         | Loosened assertions, bent product code, stand-ins, a minted API, a project rule broken | The Lead, `judgement` evidence | this file     |
| A hand-back's claim                        | Names a part of the brief it did not do                                      | The Lead, `judgement` evidence         | this file     |
| A permission asked                         | Cannot be undone from the agent's own copy                                   | Whoever answers it, a fact             | this file     |
| The Human's words in an agent's chat       | Sets a requirement, says the code is wrong, asks, or approves                | The Lead's copy, a fact                | this file     |
| A turn ended with no command               | Handed back, asked or waited in words only                                   | The agent, a delivery fact             | this file     |
| Each new item of a Lead's or Peer's work   | The watch's moments, one condition each                                      | The Watcher or the Supervisor          | `WATCH.md`    |
| An edit to a test with unsettled names     | Uses one as the code under test; a fake carries one                          | The Watcher or the Supervisor          | `WATCH.md`    |

Nothing else asks it, and nothing it answers decides (I12).

## Where it looks: the record, on its events

It reads what the record already holds: briefs, plans, findings, answers, hand-backs and reports, a hand-back's diff,
and a permission an agent asks for. What it reads of agents' words and thinking, it reads for the watch
(`WATCH.md`). Whatever code can check stays code. A constraint whose origin is not the Human, a hand-back with no
evidence on its commit, a claim of green checks against a red run, a deleted test, an added skip marker, and the same
failing step run again are facts the kernel's views already show. The reflex takes only what needs a reading of
meaning.

The SLP profile's starting questions:

| On                                         | Asks                                                                                      | Goes to               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------- |
| `brief_issued`, `brief_amended`            | A discovery brief that fixes the method; a cause given as fact; a closed set of options; a goal nobody could observe; a brief that reads as the other kind | the root, a note      |
| `finding_raised`, `plan_amended`, `brief_amended` | Touches the goal or cost the Human approved (§7.3), beyond what I6 catches from origins | the root, a note that wakes it |
| `finding_classified` as kept               | The reason does not meet the evidence the raiser gave                                     | the root, a note      |
| `report_made`                              | Settles how the system is built, a structure or contract others will build on, with no line of the plan recording it | the root, a note      |
| `hand_back`                                | The diff loosens an assertion; bends product code so a check passes; leaves a stub or fake where the brief asked for the thing; has a test, or a fake in it, fix a shape nothing settled; breaks one of the project's own written rules | evidence on the commit |
| `hand_back`                                | The claim names a part of the brief it did not do                                          | evidence on the commit |
| `permission_requested`                     | The action cannot be undone from the agent's own copy                                     | a fact for whoever answers it |
| a message the Human types into an agent's chat | Whether it sets a requirement, says the code is wrong, asks, or approves                  | a fact on the Lead's copy |
| `turn_ended` with no command in the turn   | Whether the agent handed back, asked, or said it waits, in words only                     | the agent, a delivery fact |

They come from V1's patterns and checks that read the record (pre-solves, closed-choice, vague-goal, big-decision,
gaming, proof-bends-product, stand-in, summary-admits-gap, instruction-kind), and from two tools that guard coding
agents with Jev. One asks a question for each project rule, over the rule and the diff and never the conversation, so
the 200th edit is judged like the first. The other asks whether a tool call can be undone before it runs. The
questions that read words and thinking (struggling, turning, admits-wrong and the rest) are the watch's moments, in
`WATCH.md`.

The project's rules are the project's: the lines of its `AGENTS.md` that a linter cannot check, each turned once into
a question when the file changes, and asked only of the hunks it could apply to.

## Asking well

Jev answers the question as written, not the question meant. Most of its accuracy is in how it is asked.

**Decide in code first.** Counts, dates, sizes, what a diff deletes, which checks ran and how they came out, and
whether a line's origin is the Human are computed and handed over as named facts ("tests removed: 2"), never left
for the model to work out.

**One condition to a question.** A compound judgement is split into questions of one condition each, and code
combines their answers, as in the 62.6% to 95.0% case above. "Does the brief pre-solve?" becomes: does it name a
method, does it state a cause as fact, does it offer a closed set of options.

**The smallest state that answers.** Text beside the point lowers accuracy even well inside the budget. The state is
a JSON object of named fields, and the question names the field it is about in backticks: `goal`, `constraints`,
`hunk`, `rule`. Questions that read the same fields go in one call; questions that read different ones go in
separate calls, run side by side. A diff goes hunk by hunk, never whole.

**No hops.** The state holds what the question is about, not a way to find it: the text of the brief line a finding
disputes, not its id; the rule itself, not the file it came from.

**Describe every outcome.** A bare label costs confidence. Each outcome's description says what it covers and names
the edge cases it does not, and it extends the question rather than restating or contradicting it: a `yes` that
describes a no answers worse.

**Mutually exclusive outcomes are one `choice`.** Never a question beside its own negation, since the two need not
sum to one. A list that might not cover everything ends in `other`. Labels keep one fixed order every time, and a
question is checked for order bias by shuffling its labels before it goes in the profile.

**Agents' words are untrusted.** Jev does not treat the state as hostile, and a hand-back arguing that its tests are
sound can move the answer about the diff. A question about code reads the code and the brief, never the agent's
claim about the code. A claim is asked about on its own, and its answer says only what the claim says. What comes
from the record (a brief, a Human's line) and what an agent wrote are separate fields, named for where they came
from.

**Questions and descriptions in English.** Agents' text goes in as they wrote it. How Jev reads Vietnamese is
unmeasured, so a question over the Human's Vietnamese words waits until the look back has measured it.

**Thresholds by type.** A `noul`'s probability runs low of the truth, while a `choice`'s or `score`'s runs high. A
threshold is set for each question from its own recorded answers and outcomes, not taken from another. A `choice`
is thresholded on the probability of the label that matters, not on its confidence. A `score` informs; it does not
trigger.

## Questions are data

`profile/slp/reflex.yaml` holds the pinned model and the questions. Nothing in code names one.

```yaml
model: jev-1.13.0
questions:
  names-method:
    on: [brief_issued, brief_amended]
    when: { kind: discovery }
    state: { goal: brief.goal, constraints: brief.constraints }
    noul: Does `goal` or a line of `constraints` name the method, fix or design the work must use?
    yes: A line says which approach, algorithm, library, data structure or fix to use.
    no: >-
      Every line states an outcome to reach or a limit to respect, and the approach is left open. Naming a file or
      module only as where the work happens is not a method.
    over: 0.9
    because: A start, where independent tests found yes answers reliable; set from this question's own answers at the first look back.
    tells: root
```

- `state` maps each field the question names to where the record keeps it. It never holds more.
- `over` is the probability past which it speaks, and `because` its reason. There is one value per question; V1's
  forty tuning values in `attention.json` go.
- `consider`, where a question has one, is the probability past which an answer under `over` goes to the actor that
  watches the scope, as a candidate (`WATCH.md`).
- `tells` is a relation (`root`, `owner`, `parent`, `self`) or `evidence`. `wakes: true` lets a note wake the role it
  is for. Otherwise it waits for the next message that asks something, as every note does.

## Running it

One client for the project, behind the reflex port. A call goes through the same steps whatever asked it:

1. **Gather.** An event, an item or a hand-back names the questions its profile rows ask.
2. **Group by state.** Questions that read the same fields go in one call: the state is paid for once, and twenty
   questions cost about what one does. Questions that read different fields go in separate calls, side by side.
3. **Mask.** What looks like a secret is replaced before any text leaves. The patterns are data, taken from V1's.
4. **Fit.** The state and the longest question must fit the route's budget, the smaller of what the route lists
   (32k on OpenRouter). What does not fit is not cut: it is recorded `too large`, and a diff is asked hunk by hunk.
5. **Send.** Calls in one scope go one at a time; across scopes they run together, under the route's rate. Each has
   a time limit, and nothing waits on it.
6. **Check.** Every question answered as asked, or the whole call fails.
7. **Record.** An `observation_made` for each answer, with its full probabilities and the version that answered.
8. **Route.** By each question's thresholds: a note, a candidate, evidence, a fact, or nothing.

**Failures.**

| Answer                          | What v3 does                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| 400 `max_tokens_exceeded`       | Never retried: the same call fails the same way. Recorded `too large`         |
| 400 or 422, anything else       | Never retried. The question is broken, which is the profile's fault: an alarm names it |
| 401, 403                        | Never retried. An alarm to the Human: the key is refused, and the reflex is idle until it is fixed |
| 429, 5xx, a timeout, no answer  | Asked once more, after the time the answer names if it names one; then the event goes unread |

An event that goes unread is recorded so. A hand-back's evidence step then says `not run`, so the Lead knows it is
missing.

**Setup.** Jev is a requirement of v3, like Paseo. The plugin's setup asks for the route and the key, and the bridge
seats no agent until they are set. Installing v3 with them is the Human's consent to send the record's text and the
agents' words to Jev's host: through OpenRouter with data collection denied, unless they choose TypeSafe's own API.
The key lives in the plugin's settings and is never written to a log.

**Cost.** A busy day, five agents with forty turns each and thirty items a turn, is about 6,000 calls of some 600
tokens: under four million tokens, about fifteen cents. Events and hand-backs add little beside it.

## Measured by the record, taken away by subtraction

- Each answer is an `observation_made` event with its question, subject, model and full probabilities, including
  those under the threshold, so the look back can see calibration.
- The record gives each answer its label later: for each question, the look back reads how many notes were followed
  by an act of the role told on the same subject (an amendment, a hold, a question, a send-back). That is the
  ceremony signal (§10.3) applied to the reflex, and the data a threshold is set from.
- A question that never leads to a change is removed from the profile at the look back. A threshold is never tuned by
  code: telemetry does not turn itself into a rule.
- The model is pinned by version, never `jev-latest`, and the model that served each answer is recorded. The pin
  moves at a look back, and thresholds are set again from the answers the new version gives.

## Port

```text
ask(state, questions, model) -> Result<{ model, answers, tokens }>
```

- Every question is answered as it was asked, or the call fails. An answer with one question missing is not what was
  asked (V1).
- A route is data: `endpoint`, the versioned `model` id as that route names it (`typesafe/jev-1.13` on OpenRouter,
  `jev-1.13.0` on TypeSafe's API), the `budget`, and a `body` sent with every request, such as OpenRouter's
  `provider: { data_collection: deny }`. One adapter serves both routes, with no SDK; V1's `adapters/decisions.ts`
  is its shape: all or nothing, retried only where retrying can help, with a time limit that cuts a stalled body too.
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

## To check before building on it

- Whether OpenRouter's `/api/v1/systemone` honours `provider: { data_collection: deny }` as its `/api/alpha/decisions`
  did for V1; until it is shown to, v3 uses the route V1 used.
- The rate OpenRouter allows Jev, which it does not publish.

## Open, for the owner

- Whether a `judgement` step can hold an integration, as a failing check does under I4. The recommendation is no: it
  is shown beside the checks and never holds, since a hold would make it the approval step N6 forbids.
