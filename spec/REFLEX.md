# Reflex

A reflex is a fast, cheap, typed judgement: text and a few typed questions go in, and an answer to each comes back
with a probability. What answers is a template's to name, its **classifier**: SLP names Jev, TypeSafe's first System
One model. It lets the plugin look at every event as it happens, where V1 could afford to look only on a timer.
**The reflex notices; the roles decide.** SLP's thinking stays with the agents, and the Supervisor is the one that
judges. A template that names no classifier asks no model, and a Human may switch the asking off on their machine:
the watch then goes on with what code counts and with the sweeps (`WATCH.md`, With parts missing).

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
3. **A fact** for the actor it concerns, with the text it rests on: to a writer, the project rule its edit appears to
   break, quoted with its line; to an agent, that its words did not reach the record, such as a question written in
   its chat but never asked through a tool; to whoever answers a permission, that the action cannot be undone; to a
   Lead, what the Human's words in its Peer's chat read as, and whether a red check failed on the environment. A fact
   reads like a failing lint or a delivery receipt. It never judges the agent, and the watch's moments are never
   facts to the agent they concern (`WATCH.md`).

It never moves a line, classifies a finding, integrates, lands, answers a question or a permission, opens or closes
an obligation, holds a scope, or ranks, merges or drops a message (KERNEL I12). A note says what was seen, never what
to do: V1's patterns carried advice in a `next` field, and Seatworks does not.

## Every use in Seatworks

Everything SLP asks its classifier, in one place. Each row's questions live in the profile; the spec named owns the
rest. Every row is asked from the first lane (Decided); those on the project's own rules start once it has its
`rules.yaml` (The project's own rules).

| Asked on                                   | What it asks                                                                 | Answer goes to                         | Spec          |
| ------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- | ------------- |
| A brief issued or amended                  | Framing: a fixed method, a cause given as fact, closed options, a goal nobody could observe, the other kind, how the inside is to be written, a state meant to be replaced | The Supervisor, a note        | this file     |
| A finding, a plan or a brief amended       | Touches the goal or the cost the Human approved                              | The Supervisor, a note that wakes it   | this file     |
| A finding kept                             | The reason does not meet the evidence                                        | The Supervisor, a note                 | this file     |
| A report                                   | Settles a structure no plan line records                                     | The Supervisor, a note                 | this file     |
| An edit, on the paths a project rule covers | Breaks that rule of the project's instruction files                         | The writer, a fact quoting the rule and its line | this file |
| A hand-back's diff                       | Loosened assertions, bent product code, stand-ins, a minted API, a project rule broken | The Lead, `judgement` evidence | this file     |
| A check that failed                        | Failed on the environment (a missing dependency, a busy port, the network), or on the code | The Lead, a fact on the evidence | this file |
| A hand-back's claim                        | Names a part of the brief it did not do                                      | The Lead, `judgement` evidence         | this file     |
| A permission asked                         | Cannot be undone from the agent's own copy                                   | Whoever answers it, a fact             | this file     |
| The Human's words in an agent's chat       | Sets a requirement, says the code is wrong, asks, or approves                | The Lead's copy, a fact                | this file     |
| A turn ended with no command               | Handed back, asked or waited in words only, read from its last words         | The agent, a delivery fact             | this file     |
| Each new item of a Lead's or Peer's work   | The watch's moments, one condition each                                      | The Watcher, or the owner above the work | `WATCH.md`    |
| An edit to a test with unsettled names     | Uses one as the code under test; a fake carries one                          | The Watcher, or the Peer's Lead        | `WATCH.md`    |

Nothing else asks it, and nothing it answers decides (I12).

## Where it looks

It reads what the record already holds: briefs, plans, findings, answers, hand-backs and reports, a hand-back's diff,
an edit's hunk, a failed check's output, and a permission an agent asks for. What it reads of agents' words and
thinking, it reads for the watch (`WATCH.md`). Whatever code can check stays code: a constraint whose origin is not
the Human, a hand-back with no evidence on its commit, a claim of green checks against a red run, a deleted test, an
added skip marker and the same failing step run again are facts the kernel's views already show. The reflex takes
only what needs a reading of meaning, and the table under Every use is the whole of it. The questions are in
`templates/slp/reflex.yaml`, and the project's own rules in its `rules.yaml`.

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

**Judge work without the conversation.** A question about code reads the rule or the brief and the hunk, never the
conversation around it, so the two-hundredth edit is judged like the first.

**Show each outcome.** A description that carries an example, a line of code that is a yes and one that is a no,
answers better than one that only names the condition.

**Ask when the answer exists.** A question says where it is asked by the key that asks it: `on` an event of the
record, `reads` for one item of a turn, `hunks` for each hunk of a hand-back's diff, `on: [turn_ended]` for a turn's
last words. "Did this add more than was asked" has no answer after the first edit of twelve, so it is asked of the
hand-back and never of an edit. Nothing is asked of a whole turn's diff: no question has needed it.

**The subject whole, its context fitted.** What is judged, the item or the hunk, is never cut. What surrounds it (the
items before, the brief) is fitted to the budget in stages: tool arguments shortened, long texts kept head and tail,
old items reduced to one line each.

**Questions and descriptions in English.** Agents' text goes in as they wrote it. How Jev reads Vietnamese is
unmeasured, so a question over the Human's Vietnamese words waits until the look back has measured it.

**Thresholds by type.** A `noul`'s probability runs low of the truth, while a `choice`'s or `score`'s runs high. A
threshold is set for each question from its own recorded answers and outcomes, not taken from another. A `choice`
is thresholded on the probability of the label that matters, not on its confidence. A `score` informs; it does not
trigger.

## Questions are data

`templates/slp/reflex.yaml` holds the questions. Nothing in code names one.

```yaml
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
    tell: 0.9
    because: <what the look back measured, such as how many answers past it were acted on>
    for: { wording: <hash of the question and its descriptions>, model: jev-1.13.0 }
    tells: root
```

- `state` maps each field the question names to where the record keeps it. It never holds more.
- `when` narrows the events a question is asked on: `kind` for a brief's, `verdict` for a finding's, `result` and
  `cause` for a check's, `from` for a message's. The list is the plugin's (`WHEN`); a condition it does not read
  would hold for every event, so the editor notes one.
- `hunks` asks a question of each hunk of a hand-back's diff, of the test files or of the rest, told apart by the
  watch file's `facts.testPath`: a profile with no watch file has no such question asked.
- `names` are patterns whose first group is a name the added lines of a test give the code, less those listed under
  `ignore`. Code looks each up among what is settled, and only when one is left are the questions under `ask` put,
  with it in `unsettled`. A moment that holds `names` is read this way whatever the profile calls it, and a question
  that names it, `use: watch.<its name>`, runs the same check on the tests a hand-back brings, its answers going where
  that question's own `tells` says.
- `tell` is the probability past which it speaks, and `because` its reason. It holds only for the wording and the model
  named in `for`: the hash of the question and its descriptions, and the version that answered. A question whose wording
  or model no longer matches, or that has never been through a look back, still has every answer recorded, but goes no
  further: a note becomes a candidate for the Watcher, and a fact stays on the record. `judgement` evidence is always
  shown with its probability, since the Lead weighs it either way. A project rule earns its start when `compile-rules`
  finds its answers on the project's history decisive. There is one value per question; V1's forty tuning values in
  `attention.json` go.
- `consider`, where a question has one, is the probability past which an answer under `tell` goes to the actor that
  watches the scope, as a candidate (`WATCH.md`).
- `tells` is a relation (`root`, `parent`, `self`), `answerer` (whoever may answer a permission: the owner of the
  asking agent's parent scope, or the Human), or `evidence`. With none, the answer is an attention for the owner
  above the agent it is about. The list is the plugin's (`shared/contracts/reflex.ts`), with the events a question
  may be asked on and the paths its `state` may read.
  `wakes: true` lets a note wake the role it is for. Otherwise it waits for the next message that asks something, as
  every note does.

## Running it

One client for the project, behind the reflex port. A call goes through the same steps whatever asked it:

1. **Gather.** An event, an item or a hand-back names the questions its profile rows ask.
2. **Group by state.** Questions that read the same fields go in one call: the state is paid for once, and twenty
   questions cost about what one does. Questions that read different fields go in separate calls, side by side.
3. **Mask.** What looks like a secret is replaced before any text leaves. The patterns are taken from V1's and are
   the plugin's own (`shared/contracts/secrets.ts`), so no profile can leave one out.
4. **Fit.** The state and the longest question must fit the route's budget, the smaller of what the route lists
   (32k on OpenRouter). The context around the subject is fitted in stages (Asking well). A subject that alone does
   not fit is not cut: it is recorded `too large`, and a diff is asked hunk by hunk.
5. **Send.** Calls in one scope go one at a time; across scopes they run together, under the route's rate. Each has
   a time limit, and nothing waits on it.
6. **Check.** Every question answered as asked, or the whole call fails.
7. **Record.** An `observation_made` for each answer, with its full probabilities and the version that answered.
8. **Route.** By each question's thresholds: a note, a candidate, evidence, a fact, or nothing.

**Failures.**

| Answer                          | What Seatworks does                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| 400 `max_tokens_exceeded`       | Never retried: the same call fails the same way. Recorded `too large`         |
| 400 or 422, anything else       | Never retried. The question is broken, which is the profile's fault: an alarm names the questions of that call |
| 401, 403                        | Never retried. An alarm to the Human: the key is refused, and the reflex is idle until it is fixed |
| 429, 5xx, a timeout, no answer  | Asked once more, after the time the answer names if it names one; then the event goes unread |

An event that goes unread leaves nothing on the record: a hand-back then carries no `judgement` evidence, and the
checks beside it are what the Lead has. Counting what went unread is not built.

**The classifier is the template's.** `profile.yaml` names it under `classifier`, by each route it is served at: the
`endpoint`, the versioned `model` id as that route names it (`typesafe/jev-1.13` on OpenRouter, `jev-1.13.0` on
TypeSafe's API), the `budget`, and a `body` sent with every request, such as OpenRouter's
`provider: { data_collection: deny }`. Nothing of it is the plugin's: no code names a model or a host, and a template
is free to name another model that answers typed questions with probabilities, or none. An endpoint is `https`, or
`http` on the machine itself for a model run there, and its host is written plainly, with no user and no escape, so
the host a person reads is the host a call goes to.

**The key is the Human's, for one host.** The plugin's settings hold a switch, the host the key is for and the key.
A project's questions go by the first route of its template served at that host, and by no other: a template says
where its classifier is served and never where a key goes, so one the Human installs cannot point their key or their
record's text at a host of its own. Each host a template would ask is shown before it is installed (`TEMPLATE.md`).
Setting the key is the Human's consent to send the record's text and the agents' words to that host; it lives in the
plugin's settings and is never written to a log. What looks like a secret is masked first, by the plugin's own
patterns.

**Off is a choice, and says nothing.** A template with no classifier, or a machine where the switch is off, asks no
model: no call leaves, nothing is recorded of one, and no alarm is raised, since nobody is owed a warning of what
they chose. Until the Human's settings are read nothing is asked either.

**Failing open.** The reflex is advisory: it decides nothing (I12), so it is a soft dependency. When a template names
a classifier and the switch is on, a key missing, set for a host the template is not served at, refused or out of
credit never stops an agent from being seated or a command from running. It raises a standing alarm on that project's
page, and the watch goes on with what is left: code facts and known patterns, the sweeps of whoever watches, the
owners. Blocking the team on its sensor would make the tool constrain the way a team works; failing closed is for a
control that decides, and nothing that asks a classifier does.

**Cost.** A busy day, five agents with forty turns each and thirty items a turn, is about 6,000 calls of some 600
tokens: under four million tokens, about fifteen cents. Events and hand-backs add little beside it.

## Measured by the record, taken away by subtraction

- Each answer is an `observation_made` event with its question, subject, model and full probabilities, including
  those under the threshold, so the look back can see calibration.
- The record gives each answer its label later: for each question, the look back reads how many notes were followed
  by an act of the role told on the same subject (an amendment, a hold, a question, a send-back). That is the
  ceremony signal (§10.3) applied to the reflex, and the data a threshold is set from.
- The look back reads it in the root's `record`, which ends, for the root's owner alone, with the five signals and
  with each question's and moment's counts (`LEDGER.md` §9): answers on the record, how many of them fell under
  0.25, between, and over 0.7, how many went past its threshold, the candidates its watcher attended and passed, and
  its attentions with what came of each. Counts, never a rule: a threshold is still set by whoever looks back.
- From the first day, before any outcome is known, the answers' shape says whether a question works. A decisive one
  answers near 0 or near 1. A weak one sits in the middle, with its median above 0.25 and nothing past 0.7: it is
  underspecified, and is split, given a concrete shape, or given an example. A noisy one passes its threshold on
  most subjects: it is too broad, and is narrowed.
- Later, the outcome labels say whether it separates: do subjects that were acted on score higher than those that
  were not? Many questions that read well separate nothing when measured, which is why a question earns `tell` only
  by a look back.
- A question that never leads to a change is removed from the profile at a look back, together with every other
  that did not: each is judged on its own record, so they are not the one change a look back makes, and a wide set
  that shed one a week would stay wide for months (`retrospective`, The watch's upkeep). The first look back is held
  when the first lane lands, where the wide set's noise first shows. A threshold is never tuned by code: telemetry
  does not turn itself into a rule.
- The model is pinned by version, never `jev-latest`, and the model that served each answer is recorded. The pin
  moves at a look back, and thresholds are set again from the answers the new version gives.

## The project's own rules

The rules in a project's instruction files (`AGENTS.md` and its kind) that no linter can check are asked of every
edit on the paths they cover. The answer goes to the writer as a fact, quoting the rule and the line it came from:
it is the project's written rule, read back like a failing lint, and the writer repairs it while the change is
still small. It is not the watch; nothing in it judges the agent.

- **Compiled once.** When the instruction files change, by hash, the Supervisor is told, and compiles them with
  `compile-rules` into the project's `rules.yaml`: each rule with its source line, the paths it covers, whether it is asked of
  an edit or of a hand-back, and its question with an example of each outcome. A rule a linter can check goes to the linter instead.
- **Checked against history.** A new rule is asked of recent hunks from the project's own history, and its answers'
  shape says whether it works before any agent meets it. A weak or noisy rule goes back to the Supervisor to
  rewrite.
- **One call an edit.** Every rule an edit's paths fall under is one question in one call, over the rule text and
  the hunk.

## A red check

A check that fails on the environment, not the code, sends a Peer to rework code that was never wrong. The evidence
runner tells them apart, code first: known shapes of a missing dependency, a busy port or a dropped connection are
matched from data. Only an output that matches none goes to the reflex, as a `choice` among `environment`, `code` and
`other`. The answer is a fact on the evidence; the Lead weighs it, and the kernel still counts a failing result as
failing (I4).

## What the tools built on Jev taught

Read on 29 September 2026: pi-warden and abide (guards for Pi, Claude Code, Codex and OpenCode, each with measured
results), Foreman (a supervisor of coding workers), fast-jev-compaction, jev-harness, and two cookbooks. Read again
on 3 October 2026, for whether a team should stand without its classifier: TypeSafe's own cookbooks (the cascade that
puts a cheap verifier before a costly step, routing by confidence), Edward, jev-harness, abide and Foreman.

| Lesson                                                                                           | From               | In Seatworks                               |
| ------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------- |
| Skip what code decides, match known patterns offline, ask Jev only for judgement                  | pi-warden, jev-harness | Decide in code first            |
| Jev estimates named probabilities; ordinary code picks from a few allowed acts                    | Foreman            | I12; the roles are the ones who act |
| A threshold belongs to the question's wording and the model it was measured on                    | pi-warden          | `for` beside every threshold        |
| Most plausible questions separate nothing when measured                                          | pi-warden          | `tell` only after a look back       |
| An answer's shape (decisive, weak, noisy) shows a bad question before any label exists            | abide              | The first look back                 |
| Criteria with a concrete example of each outcome                                                 | abide              | Asking well                         |
| Judge the hunk against the rule, never the conversation                                          | abide              | Asking well                         |
| Some questions have an answer only at the end of the turn                                        | abide              | Phases                              |
| A written rule broken is repaired fastest by the agent that broke it, told at once                | pi-warden, abide   | The project's own rules             |
| Keep what is judged whole; fit what surrounds it in stages                                       | fast-jev-compaction | Asking well                        |
| Coalesce a noisy stream; let lifecycle events through at once                                    | Foreman            | The watch's eye                     |
| A red check on the environment is not a reason to rework code                                    | jev-harness        | A red check                         |
| Failures never break the agent's session; misses are counted                                     | abide              | Running it                          |
| What cannot be undone is held by plain code; the scorer is optional, advises only, and with it off the rules run alone | Edward | Off is a choice; I12        |
| The deterministic tier always runs and is worth having alone; a degraded answer is said, never silent | jev-harness   | Failing open; `WATCH.md`, With parts missing |
| A cheap verifier before a costly reader, and only what it is unsure of goes on                    | TypeSafe's cascade | `WATCH.md`, The cascade         |

Foreman stops a run when its classifier cannot be asked, since there the classifier decides what a worker does next.
Here nothing it answers decides, so the team goes on.

**Considered, and not taken:**

- **Steering into a live turn, and stopping a worker by policy** (Foreman). Seatworks never lands a message inside a turn,
  and only an agent's superior ends it.
- **Routing each message to a model** (Jev routers). A scope's opener picks its model from the role's list (P15).
- **Recommending skills before each prompt** (pi-warden's conscience). It measured 89% precision, below its own gate;
  agents load their skills.
- **Compaction by Jev** (fast-jev-compaction). Each agent's own harness compacts it. The Watcher's digest may use it
  if the look back shows the Watcher's context is what costs.

## Port

```text
ask(state, questions, model) -> Result<{ model, answers, tokens }>
```

- Every question is answered as it was asked, or the call fails. An answer with one question missing is not what was
  asked (V1).
- A route is the template's data (Running it, The classifier is the template's). One adapter serves every route, with
  no SDK: it sends the body TypeSafe's System One API takes, `{ model, state, questions }` with whatever the route's
  `body` adds; V1's `adapters/decisions.ts` is its shape: all or nothing, retried only where retrying can help, with
  a time limit that cuts a stalled body too.
- Another model that answers that body with probabilities stands behind the same port by being named in a template.

## What V1 did that Seatworks drops

| V1                                                                   | Seatworks                                                            |
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
  did for V1; until it is shown to, Seatworks uses the route V1 used.
- The rate OpenRouter allows Jev, which it does not publish.
- The label of a note told straight to its role, once a question has earned its threshold: whether that role then
  acted on the same subject is not counted yet, and no question has earned a threshold so far.

## Decided

- A `judgement` step never holds an integration. It is shown beside the checks with its probability, and the Lead
  weighs it; a hold would make it the approval step N6 forbids.
- Every question and moment is asked from the first lane: the owner chose the full set on 29 September 2026. Start
  simple (CONCEPT-V2 A3.9¶11) still holds where it bears, on what reaches a role: a threshold not yet earned by a look
  back sends its answer no further than a candidate for the Watcher or the record, so the wide set costs the owners
  nothing until a question proves itself. A question that never leads to a change is removed at a look back, the
  first held when the first lane lands, and those that go leave together.
