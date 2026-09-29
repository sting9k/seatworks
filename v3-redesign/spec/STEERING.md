# Steering

When a role should act on another's work, and when an agent should stop its own: when a Lead should steer a Peer,
when a Peer should stop working around a problem and raise it, when a Lead should stop defending its plan. The plugin
never steers anyone. It notices the moment, tells the role that owns the decision, at a moment that costs the reader
least, and leaves the escalation channel open where the conflict arises. Read on 29 September 2026.

## What the research found

| Finding                                                                                                                 | Source                                     | In v3                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| An escalation tool at the point of conflict cut reward hacking from 23.6% to 5.3% across eight models; 98.7% of escalations came with no hacking, and they found defects monitoring missed | Escalation channels, arXiv 2608.29460 | `raise_finding` is that channel, named where a check cannot pass honestly |
| Peers deliberating as equals kept investing in a failing course 99.2% of the time; with a hierarchy, 46%               | Escalation of commitment, arXiv 2508.01545 | The Lead converges; no shared room; keeping a plan needs a reason |
| A loop shows as the same call three times; a nudge at three and a stop at five holds better than a nudge alone, since a model can ignore injected text | Doom-loop detectors in coding agents | Two steps: a candidate at three, an attention at five |
| Telemetry alone (repeats, errors, churn), with a CUSUM alarm, caught 71% of failures at a 5% false-alarm rate, in microseconds a step | Real-time detection, arXiv 2608.02464 | Code tier first; a CUSUM once the record holds healthy runs |
| A separate agent that looked for underspecification at every turn asked early, rarely asked needlessly, and closed the gap to a fully specified task | Ask or Assume, arXiv 2603.26233 | `struggling`, told to the Lead early in a scope |
| Coding agents hack checks by hard-coding outputs, editing tests, or reading expected values; held-out tests and a second look catch them | SpecBench, EvilGenie, Vesper | Acceptance tests from their own scope; the Reviewer; `loosens-assertion`, `bends-product` |
| An interruption costs least at a subtask boundary; peripheral news is best held until a coarse one                      | Interruptibility research (HCI)            | Never inside a turn; notes wait for a delivery that asks |
| Escalating when continuing costs more than deferring depends most on calibration, not on a smarter router               | Bayesian self-escalation, arXiv 2608.24087 | Thresholds earned per question and model (`REFLEX.md`) |

## Who is told

The decision belongs to whoever owns the scope above the work, so an attention goes there first.

- About a Peer: to its Lead, who owns its scope and may steer it, reseat it or redraw its work.
- About a Lead, a change to the goal or the cost, or anything across lanes: to the Supervisor.
- **Up the ladder when left.** An attention its reader has not acted on by the end of its next turn, while its scope
  is still open, goes up one owner, with the first reader's silence beside it. Acting is any command of the reader's
  that names the watched agent or its scope (`KERNEL.md` §4.9), and deciding to do nothing counts: the Lead says so
  with `acknowledge`, and the ladder stops. At the root it stops too, and the Human's view shows it.
- The Supervisor sees what went to its Leads, and what came of it, in `status`, without being woken by it.

This moves a responsibility to the owner it belongs to (CONCEPT-V2 §10.4) and keeps the Supervisor's context for what
only it can decide. The watched agent still never learns it is watched: a Lead's question to its Peer is its own.

## The moments

| Moment                          | Seen by                                                                                   | Told        | What the owner decides                            |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| going-in-circles                | Code: the same call and the same failure, normalized, three times (candidate) and five (attention) | The Lead | An open question; a reseat; a scope split |
| detour                          | The reflex: a mechanism added to work around a problem rather than fix it where it arises; code: layers added around one failing spot | The Lead | Ask what it works around; a finding upstream |
| struggling                      | The reflex, early in a scope                                                              | The Lead    | Answer, or reopen the brief                       |
| trades-the-goal, mints-an-api, builds-a-stand-in | The reflex and code (`WATCH.md`)                                         | The Lead    | Ask; carry it into the plan, or send it up        |
| check-made-to-pass              | Code: an existing line of a test changed in a scope whose brief asks nothing of tests, told at once when it is an assertion's; the reflex at hand-back | The Lead | Ask; a Reviewer; held-out tests |
| silent-without-progress         | Code: turns with tokens spent and no commit, finding or message since the last hand-back or brief | The Lead | Ask where it stands; reseat |
| big-decision, a framing that pre-solves, a plan kept without answering its evidence | The reflex and the Watcher | The Supervisor | An open question to the Lead |
| a Lead ignoring its Peers' findings | Code: a finding still unclassified when the Lead's second turn since it ends        | The Supervisor | Ask; a hold; the Human                       |
| past-appetite                   | Code: what a lane and its children spent passes the amount its appetite names             | The Supervisor | The Human, if the work should go on          |
| a turn failed, an agent gone    | The agent host                                                                            | The owner above | Reseat, or release                          |

Every moment is watched from the first lane (`watch.yaml`'s `active` list, `REFLEX.md` Decided).

## What each role is given

- **The Peer: the channel, not a nudge.** `raise_finding`'s description names the moments it is for: a check that
  cannot pass honestly, a premise the code contradicts, a third attempt at one failure, a layer about to be added to
  hide a contradiction. The Peer's prompt says to stop and raise it at that point. The plugin sends the Peer nothing
  about its own work: a model told it is being watched plays to the watch.
- **The Lead: `steering`.** When to act on an attention about a Peer, and how: nothing when the brief already settles
  it or the Peer's next step will meet it; one open question at the Peer's turn boundary; a finding it raises itself
  upstream; a reseat when the same moment holds after a question; never the fix itself (I2).
- **The Supervisor: `attention`.** Unchanged, for what reaches it.

## How it stays cheap and honest

- Code first. Repeats, churn and silence are counted from the stream; only meaning goes to the reflex.
- A CUSUM over the code tier's telemetry replaces the fixed counts once the record holds enough healthy runs to set
  it, as the look back decides.
- Every moment is measured as the watch's are: attentions acted on, and changes that followed. The ladder is
  measured too: an attention that had to climb counts toward "interventions that came too late".
