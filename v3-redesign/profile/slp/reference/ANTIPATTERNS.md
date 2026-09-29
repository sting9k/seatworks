# Anti-patterns

The anti-patterns SLP names (CONCEPT-V2 §12), shared across projects. All share one root: a solution, a premise or a
process exempted from question, while every layer added around it carries a reasonable name. The last column is what
notices each one; the Supervisor decides what to do about it.

## Giving work

| Anti-pattern                       | Sign                                                                             | Way out                                            | Noticed by                          |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| Pre-solve                          | The brief fixes the solution, the criteria, what is exempt and the answer's form | A three-part brief; verification apart from discovery | `names-method`, `closed-options`, `reads-as-kind` |
| The parachute                      | An earlier agent's choice becomes a later one's constraint                       | A choice recorded as a choice, open to question    | The kernel: a constraint's origin   |
| Three channels locked on one answer | The worker may only change, read about and be judged by the chosen solution      | Reading and criteria at the level of the goal      | `names-method`                      |
| A cause fixed in the brief         | "Enlarge the history to handle packet loss"                                      | Brief the symptom; reopen the premises             | `cause-as-fact`                     |
| Feedback translated into a solution | "The bike is heavy" becomes "make the parachute lighter"                        | Keep feedback at the level of the goal             | `unobservable-goal`, the Watcher    |

## Working

| Anti-pattern                        | Sign                                                                            | Way out                                   | Noticed by                          |
| ----------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| The detour                          | Mechanism after mechanism to cover one contradiction nobody may reopen          | Reopen the contradiction                  | `builds-a-stand-in`, the Watcher    |
| A bigger parachute                  | A parameter raised to make a structural fault rarer                             | Fix the lifecycle of what was merged      | `trades-the-goal`, the Watcher      |
| A premise nobody asks about         | Two wheels given, Guam wanted, a pedal boat returned                            | The right to object at the right time     | `struggling`, `obeys-against-judgement` |
| An unquestioned redesign            | Overengineering inside the replacement                                          | Four questions for a redesign             | The Lead's prompt                   |
| Debate as performance               | An agent finds something to oppose to prove its role                           | A right, not a duty; critique tied to evidence | The prompts                     |
| Obeying every brief                 | An agent that only does as told                                                 | More room to question                     | `obeys-against-judgement`           |
| Many hands on one brake             | Two writers on one scope; a Lead writing in what it gave away                   | One owner a scope                         | The kernel: I1, I2                  |
| A hidden chain of command           | One told to keep the parachute, another to drop it, the Lead unaware           | Intervention comes back to the shared state | The kernel: I7                    |
| Role-play                           | Titled agents sharing context, write rights and the plan, nobody integrating   | Roles by responsibility                   | The profile and the kernel          |
| A minted API                        | A test, or a fake in it, fixes an interface nobody settled                      | Settle the contract first, or ask         | `mints-an-api`                      |

## Accepting and reporting

| Anti-pattern                        | Sign                                                                          | Way out                                        | Noticed by                          |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| A bike tested on the stand          | Every part passes; nobody checked the bike stops on the road                  | The owner checks at the user's level; regression tests for the missed case | The Lead's prompt |
| A noisy measurement                 | Two agents on the CPU, a build during a benchmark                             | Comparable conditions                          | The kernel: machine hold            |
| A message taken as evidence         | "I will free the CPU" taken as the CPU being free                             | Check the real state                           | The kernel: evidence, not claims    |
| The summarizer filters out dissent  | The Human sees only "saved so many grams"                                     | A shared record with what the Human needs      | The Human's views                   |
| A check made to pass                | Assertions loosened, product code bent for a test                             | Only the behaviour working passes it           | `loosens-assertion`, `bends-product` |

## Improving SLP itself

| Anti-pattern                        | Sign                                                        | Way out                               | Noticed by                          |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| New structure to keep an old promise | A role, checklist or approval added to keep SLP as it is   | Improve by taking away                | `retrospective`                     |
| The wrong metric                    | Three good catches, so "double the critique"               | Measure outcome, not activity         | `retrospective`                     |
| Ceremony                            | A step that makes more traffic than value                   | Drop the step                         | The signals; each question's yield  |
| A Lead holding everything           | Every responsibility ends at the Lead                       | Move it to the right owner            | `retrospective`                     |
| Right but without context           | A Peer reports the right problem and nobody can act on it   | Fix the report's form                 | `retrospective`                     |
