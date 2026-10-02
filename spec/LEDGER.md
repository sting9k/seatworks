# Ledger

The ledger in detail: the exact state the kernel folds, every command with its arguments, every event with its
payload, the effects each event asks for, and what is kept, pruned and removed as a project lives for months.
`KERNEL.md` says what must hold and who may call what; this is what the code is written to. Where they differ, one is
wrong: both change in the same commit.

Types are written as TypeScript; each is a zod schema in `shared/contracts/`.

## 1. Ids

The kernel makes no random id. It counts. Each counter lives in the state, so the same log folds to the same ids.

| Thing       | Form                   | Example            | Why                                                      |
| ----------- | ---------------------- | ------------------ | -------------------------------------------------------- |
| Scope       | path of child numbers  | `root`, `2`, `2.3` | Readable in a chat and a branch name; names no role      |
| Actor       | `a` + counter          | `a7`               | An agent in a seat; the Human is `human`, the bridge `bridge` |
| Line        | `l` + counter          | `l41`              | Cited by findings and amendments                         |
| Finding     | `f` + counter          | `f3`               |                                                          |
| Evidence    | `e` + counter          | `e12`              |                                                          |
| Claim       | `c` + counter          | `c5`               |                                                          |
| Message     | `m` + counter          | `m88`              |                                                          |
| Question    | `q` + counter          | `q2`               |                                                          |
| Obligation  | `o` + counter          | `o19`              |                                                          |
| Observation | `v` + counter          | `v130`             |                                                          |
| Attention   | `t` + counter          | `t9`               |                                                          |
| Permission  | `p` + counter          | `p4`               |                                                          |
| Command     | from the caller        | a UUID             | Made by whoever sends it, so a retry carries the same one; a tool call's is its call id, under its agent |
| Effect key  | `<seq>:<kind>[:<n>]`   | `412:deliver:m88`  | Made from the event that asked for it                    |

Branches are `sw/<project>/<scope>`; the root's branch is the project's base branch.

## 2. The command envelope

```ts
type Command = {
  readonly id: CommandId;            // idempotency: seen before → the earlier result, nothing appended
  readonly at: string;               // ISO time, stamped by the shell
  readonly caller: Caller;           // from the agent's key, the surface, or the bridge; never from arguments
  readonly body: CommandBody;        // discriminated on `type`
  readonly fact?: EffectKey;         // a fact carries the key of the effect it answers
};
type Caller = { kind: "agent"; actor: ActorId } | { kind: "human" } | { kind: "bridge" };
type Decision = { ok: true; events: readonly EventBody[] }
             | { ok: false; refused: Refusal; standing: readonly string[] };
type Refusal = { invariant: "I1" | "I2" | ... | "I12" | "authority" | "unknown" | "state"; says: string };
```

`authority` is a caller whose role or relation does not allow the command (I5, I10 and the table in `KERNEL.md` §6);
`unknown` names an id that does not exist, or a section of a report the profile does not name; `state` is a move the entity's lifecycle does not have (a finding
classified twice). Each says what failed in a sentence the caller can act on.

`standing` is what the record shows of where the caller stands, read off the scope graph the refusal was checked
against: its seat, the owner above it, whom its role speaks to by relation, and for each scope or actor the command
names, its owner, parent and state or its role and seat. Facts only, so the caller sees why without a second call;
never what to do instead.

Events are stored as `{ seq, at, by, commandId, type, payload }`; `by` is the caller.

## 3. State

Everything `decide` reads, and nothing else. What only a view needs stays in the log and is queried there (§9).

```ts
type State = {
  readonly seq: number;
  readonly counters: Readonly<Record<IdKind, number>>;
  readonly project: { base: string; profile: string; profileHash: string; checks: readonly Check[]; remote: string | null } | null;
  readonly scopes: ReadonlyMap<ScopeId, Scope>;          // open, and closed ones until pruned (§10)
  readonly actors: ReadonlyMap<ActorId, Actor>;          // seated, until released or gone and settled
  readonly findings: ReadonlyMap<FindingId, Finding>;    // until their scope is pruned
  readonly claims: ReadonlyMap<ClaimId, Claim>;          // the latest per scope
  readonly evidence: ReadonlyMap<EvidenceId, Evidence>;  // on commits a live claim or candidate names
  readonly messages: ReadonlyMap<MessageId, Message>;    // until delivered and, if it asks, answered
  readonly questions: ReadonlyMap<QuestionId, Question>; // until answered
  readonly obligations: ReadonlyMap<ObligationId, Obligation>; // open only
  readonly attentions: ReadonlyMap<AttentionId, Attention>;    // open only
  readonly permissions: ReadonlyMap<PermissionId, Permission>; // open only
  readonly noise: ReadonlySet<string>;                   // `${moment}|${actor}|${scope}`
  readonly checksAsked: ReadonlyMap<string, Party>;      // `${scope}:${subject}` → who ran `run_checks`, until it lands
  readonly machineHeldBy: ActorId | null;                // this project's hold; other projects' are the shell's
};
```

### Scope

```ts
type Scope = {
  id: ScopeId; parent: ScopeId | null; role: RoleName;  // the role its actor holds, for its properties
  kind: "work" | "reading" | "watch";
  owner: ActorId | null;                                 // null only between a release and a reseat
  writer: ActorId | null;                                // the owner when its role `writes`, else null
  paths: readonly string[];                              // repository-relative prefixes; "" is everything
  after: readonly ScopeId[];                             // dependsOn
  mayChange: readonly ScopeId[]; mustTell: readonly ScopeId[];

  commit: string | null;                                 // a reading scope's commit
  over: readonly ScopeId[] | "all";                      // a watch scope's reach; [] otherwise
  brief: Brief | null;                                   // the current version; older ones are in the log
  plan: Plan | null;
  branch: string | null; workspace: "pending" | "ready" | "failed" | "none";
  status: "open" | "integrated" | "dropped";
  held: boolean;
  candidate: { commit: string; candidate: string; parentHead: string } | null;
  integrating: boolean;                                  // an advance was asked and has no fact yet
  children: number;                                      // the counter for child ids
};
```

- **Paths** are prefixes: `src/net/` holds everything under it, `src/a.ts` one file, `""` the whole tree. Two
  paths overlap when one is a prefix of the other at a `/` boundary or they are equal. No globs: their overlap cannot
  be decided cheaply, and a prefix says who owns a file at a glance.
- A child's paths lie within its parent's (a prefix of one of them, or equal).

### Lines, briefs and plans

```ts
type Line = { id: LineId; text: string; origin: ActorId | "human"; via: Ref | null; at: string };
type Brief = { version: number; goal: Line; constraints: readonly Line[]; choices: readonly Line[];
               context: readonly Line[]; kind: "verification" | "discovery" };
type Plan = { goal: Line; limits: readonly Line[]; unknowns: readonly { line: Line; check: string }[];
              appetite: { line: Line; usd: number | null; hours: number | null };
              terms: readonly { name: string; line: Line; avoid: readonly string[] }[] };
type Ref = { kind: "message" | "question" | "finding" | "evidence"; id: string };
```

A line's origin is the caller, set by the kernel. A caller may mark a line the Human's only with `via` pointing to
a message the Human sent or a question the Human answered; the kernel checks it exists and is theirs (I9).

### Actor

```ts
type Actor = { id: ActorId; role: RoleName; scope: ScopeId; model: string;
               host: string | null;                      // the agent host's id, from `agent_started`
               tools: boolean;                           // its tool server has reached the plugin
               status: "seated" | "released" | "gone";
               turns: number; tokens: number; usd: number;   // what it spent, summed turn by turn
               reported: { tokens: number; usd: number };   // its session's running totals at its last turn's end
               seen: number;                                // items of its agent's history read by then
               resent: boolean;                             // its last turn failed and its words went again
               startedAt: string };
```

### Findings, claims, evidence

```ts
type Finding = { id: FindingId; scope: ScopeId; raisedBy: ActorId; disputes: LineId | null; about: ScopeId | null;
                 text: string; evidence: readonly EvidenceId[]; default: string;
                 answeredBy: ScopeId;                    // its owner answers: a position, so a reseat moves it
                 status: "raised" | "carried" | "kept" | "waiting" | "withdrawn";
                 verdict: "changes" | "alternative" | "minor" | null; reason: string | null;
                 carriedBy: readonly number[];           // seqs of change events that carry it
                 question: QuestionId | null };
type Claim = { id: ClaimId; scope: ScopeId; by: ActorId; commit: string; text: string;
               behaviours: readonly { behaviour: string; proof: string }[] };
type Evidence = { id: EvidenceId; scope: ScopeId; kind: "check" | "verdict" | "measurement" | "judgement" | "human";
                  subject: string; ok: boolean; by: ActorId | "bridge" | "human"; summary: string;
                  steps: readonly { name: string; exit: number; seconds: number; cause: "environment" | "code" | null }[];
                  heldMachine: boolean };
```

A commit is named as its caller named it: whole, or by an abbreviation. Two names are of one commit when one begins
with the other, so evidence on `34d5447` is evidence on the candidate `34d54477dd40…` (I4), and a claim, a check and a
verdict that name one commit differently are read as on the same one. A candidate is always by its whole name.

`answeredBy` follows `KERNEL.md` §4.4: a brief line → the brief's scope's parent; a plan line → the plan's scope; no
line, or `about` another scope → the raiser's scope's parent.

### Messages, questions, obligations

```ts
type Message = { id: MessageId; from: ActorId | "human"; to: ActorId | "human"; text: string;
                 asks: boolean; directs: boolean; replyTo: MessageId | null; copyOf: MessageId | null;
                 queued: boolean;                        // false for words the Human typed into a chat
                 delivered: string | null };
type Question = { id: QuestionId; from: ActorId; text: string; about: Ref | null;
                  options: readonly string[]; recommend: string | null };
type Obligation = { id: ObligationId; owedBy: ActorId | "human"; owedTo: ActorId | "human"; about: Ref2; opened: string };
type Ref2 = Ref | { kind: "claim" | "direction" | "candidate" | "permission"; id: string };
```

What closes each obligation:

| Opened by                      | Owed by                     | Closes on                                                    |
| ------------------------------ | --------------------------- | ------------------------------------------------------------ |
| `finding_raised`               | the answering scope's owner | `finding_classified` or `finding_withdrawn`                  |
| a message that asks            | its reader                  | an `answer` with `replyTo` it                                |
| a message that directs, copied | the owner told (I7)         | a change event citing it with `via`, or an `answer` to it declining with a reason |
| `question_asked`               | the Human                   | `question_answered`                                          |
| `claim_made`                   | the parent's owner          | `integrated`, `sent_back`, `scope_dropped`, `published` on the root's claim, or a newer claim on the scope |
| an observation between thresholds | the watcher over it      | `attended` or `passed`                                       |
| `permission_asked`             | its answerer                | `permission_answered`, `permission_settled`, or the asking actor leaving its seat |

When an actor is released, reseated or gone, every obligation it owes moves to the new holder of its seat or, with
no seat left, to the owner of its scope's parent (`obligation_moved`). A question, which is the Human's own to
answer, never moves; what came to the Human only because the root's seat was empty goes to whoever is seated there
next, as below.

What a seat owes is a position's, not a person's: a reseat brings to its new holder every obligation that is the
seat's by the graph, whoever held it while the seat was empty. That is a finding its scope answers (or one that
climbed to it past empty seats), a claim of one of its children, a direction to an actor one scope below, a
permission asked from one scope below, and a message read by an actor that sat there and left. Without it the owner
above went on owing what only the seat's owner may do: a finding it may not classify, a claim it may not take in.
A message owed that way is moved with its obligation, so it is sent to the new holder, who never read it.

### Attentions and permissions

```ts
type Attention = { id: AttentionId; about: { actor: ActorId; scope: ScopeId }; moment: string; why: string;
                   facts: readonly string[]; source: "reflex" | "code" | "watcher"; urgency: "now" | "later";
                   to: ActorId | "human"; delivered: string | null; climbedFrom: AttentionId | null };
type Permission = { id: PermissionId; actor: ActorId; request: string; text: string; cannotUndo: boolean | null;
                    answeredBy: ScopeId | "human" };
```

## 4. Authority, as walks

Written once in `shared/kernel/authority.ts` and used by every command.

- `ownerOfParent(scope)`: the owner of `scope.parent`; for the root, the Human.
- `mayCall(caller, command)`: the role's `tools` name it (the Human and the bridge have their own lists, §5).
- `maySpawn(caller, parent, role)`: the caller owns `parent`, its role `delegates`, and its `spawns` holds `role`.
- `maySpeak(from, to)`: along `speaksTo`: `parent` is the owner of the sender's scope's parent; `children` the
  owners of its scope's child scopes; `descendants` any below; `human` the Human. The Human speaks to anyone.
- `answererOf(permission)`: the owner of the asking actor's scope's parent, whoever holds its obligation after that
  seat was left empty, or the Human.
- `ownerAbove(actor)`: the owner of the actor's scope's parent: where an attention about it goes.

## 5. Commands

Arguments in brief; each is a zod schema. `→` names the events a success appends, in order. Every command by an
agent also settles any open attention about the actors or scopes it names that the caller was sent
(`attention_acted`), except `acknowledge` and `mark_noise`, which settle it their own way.

### From agents

| Command            | Arguments                                                                                  | →                                       |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `open_scope`       | `parent, role, kind, paths, after, brief, commit?, over?, model?`; `commit` is a reader's seat and is left out of any other scope, `over` a watcher's | `scope_opened`, `actor_seated`, `brief_issued` |
| `amend_brief`      | `scope, set: { goal?, constraints?, choices?, context?, kind? }, reason, carries?, cites?`; one section at least | `brief_amended`              |
| `set_plan`         | `scope, plan`                                                                              | `plan_set`                              |
| `amend_plan`       | `scope, remove: LineId[], add: { section, text, check?, term?, avoid?, via? }[], appetite?, reason, carries?, cites?`; a term added under a word the plan holds replaces it; one change at least, since one that changes nothing would carry a finding with no change behind it (I8) | `plan_amended` |
| `add_edge`, `remove_edge` | `scope, edge: after \| mayChange \| mustTell, target, reason, carries?`             | `edge_added`, `edge_removed`            |
| `handover`         | `from, to, paths, reason, carries?`                                                        | `handed_over`                           |
| `raise_finding`    | `disputes?, about?, text, evidence, default`                                               | `finding_raised`, `obligation_opened`   |
| `reopen_finding`   | `finding, evidence, text`                                                                  | `finding_reopened`, `obligation_opened` |
| `classify_finding` | `finding, verdict, reason`                                                                 | `finding_classified`, `obligation_closed` |
| `withdraw_finding` | `finding, reason`                                                                          | `finding_withdrawn`, `obligation_closed` |
| `hand_back`        | `commit, text, behaviours`; by the writer, or the owner of a scope that delegates (a lane's head) | `claim_made`, `obligation_opened` (and closes the scope's previous claim's) |
| `record_verdict`   | `ok, text`                                                                                 | `evidence_recorded`                     |
| `run_checks`       | `scope, commit, steps?`                                                                    | `evidence_requested`                    |
| `integrate`        | `scope, evidence, reason?`; refused while the scope has open children                      | `integration_started`                   |
| `send_back`        | `scope, reason`; by the scope's parent's owner — the Human sends the root's claim back; refused for a scope being integrated or closed | `sent_back`, `obligation_closed` |
| `reseat`           | `scope, reason, model?`; what the seat owes and its mail come to the new actor             | `reseated`, `actor_seated`, `obligation_moved`\*, `message_moved`\* |
| `drop_scope`       | `scope, reason`                                                                            | `scope_dropped`, `obligation_closed`\*  |
| `hold_scope`, `resume_scope` | `scope, reason`                                                                  | `scope_held`, `scope_resumed`           |
| `release`          | `actor, reason`                                                                            | `actor_released`, `obligation_moved`\*  |
| `report`           | lines under each section the profile names, none required but one line in all; another section is refused `unknown` | `report_made`    |
| `send_message`     | `to, text, asks, directs, replyTo?`; `replyTo` is any message ever sent, settled or not    | `message_sent` (and a copy, I7), `obligation_opened`\* |
| `answer`           | `replyTo, text`; it goes to whoever asked, or to who holds that one's seat now, or the owner above an empty one; refused for a note of the record's own | `message_sent`, `obligation_closed` |
| `ask_human`        | `text, about?, options?, recommend?`                                                       | `question_asked`, `obligation_opened`, `finding_waiting`? |
| `hold_machine`     | `hold, why`; a holder that is released, reseated, gone, or whose scope is closed lets it go  | `machine_held` or `machine_released`    |
| `answer_permission`| `permission, allow, reason`                                                                | `permission_answered`, `obligation_closed` |
| `acknowledge`      | `attention`                                                                                | `acknowledged`                          |
| `mark_noise`       | `attention`                                                                                | `noise_marked`                          |
| `attend`           | `candidate? (observation), actor, moment, why, urgency`                             | `attended`, `attention_opened`, `obligation_closed`? |
| `pass`             | `candidate, reason`                                                                        | `passed`, `obligation_closed`           |
| `set_checks`       | `checks: { name, run: string[] }[]`                                                        | `checks_set`                            |
| `publish`          | `remote`                                                                                   | `publish_requested`                     |

`*` as many as apply. A command whose caller is the scope's own actor takes its scope from the caller: a Peer's
`hand_back` names no scope.

`carries` names the finding a change event carries; `classify_finding` with verdict `changes` is refused (I8) unless
at least one event after the finding was raised carries it. `via` or `cites` names the Human's message or answer
that a change to the goal, the appetite or a Human's line rests on (I6).

### From the Human

`open_project { base, remote?, profile }` → `project_opened`, `scope_opened` (the root), `actor_seated`. Then any
command a scope's parent owner may call on the root; `send_message`, `answer_question { question, text }` →
`question_answered`, `obligation_closed`, `finding_resumed`?; `hold_scope`, `resume_scope`, `amend_plan` of their own
lines, `answer_permission`, `set_checks`, `publish`, `reseat` of the root.

### From the bridge: facts

Each carries the key of the effect it answers, when it answers one. A fact whose key was settled before is dropped by
the shell and never reaches `decide`.

| Command                | Arguments                                                               | →                                   |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| `record_workspace`     | `scope, ok, branch?, head?, why?`                                              | `workspace_ready` or `workspace_failed` |
| `record_agent`         | `actor, host`                                                           | `agent_started`                     |
| `record_tools`         | `actor`: its tool server said hello; nothing the second time            | `tools_reached`                     |
| `record_turn`          | `actor, outcome: done \| failed \| cancelled, why?, began?, tokensSoFar, usdSoFar, seen` | `turn_ended`, `attention_climbed`\* |
| `record_gone`          | `actor, why`                                                            | `actor_gone`, `obligation_moved`\*, `obligation_closed`\* (its permissions) |
| `record_delivery`      | `to, messages, attentions`: the reader the batch was sent to; what has moved to another reader since is not delivered by it | `message_delivered`\*, `attention_delivered`\* |
| `record_candidate`     | `scope, commit, result: { candidate, parentHead } \| { conflict: paths }` | `candidate_ready` or `candidate_conflict` |
| `record_evidence`      | `scope, subject, ok, steps, heldMachine`                                | `evidence_recorded`                 |
| `record_integration`   | `scope, result: { sha } \| { moved } \| { failed: why }`                | `integrated` or `integration_refused` |
| `record_profile`       | `profileHash`: the files the project now runs                                | `profile_taken`; nothing when it is the hash the record has |
| `record_publish`       | `remote, branch, result: { sha } \| { refused: why, at? }`: the remote and branch it went to, since another may have been asked for meanwhile | `published` or `publish_refused` |
| `record_permission`    | `actor, request, text`                                                  | `permission_asked`, `obligation_opened` |
| `record_permission_settled` | `actor, request, allow`: answered in the agent's own prompt        | `permission_settled`, `obligation_closed`; nothing when the ledger answered it already |
| `record_human_words`   | `actor, text`                                                           | `message_sent` (from the Human, directs, not queued), its copy (I7) |
| `record_observation`   | `question, subject, source, model?, answer, level, route`               | `observation_made`, then per §7     |

## 6. Events

Every event, with its payload. `evolve` handles each; an unknown type stops the fold with an error.

| Event                 | Payload                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `project_opened`      | `base, remote, profile, profileHash, root: ScopeId`: the profile by its name, and the hash of its files then |
| `profile_taken`       | `profileHash`: the project took its profile's files anew, or was found running others than the record said |
| `scope_opened`        | `scope: Scope` (as opened)                                                                   |
| `actor_seated`        | `actor, role, scope, model`                                                                  |
| `workspace_ready`     | `scope, branch, head`                                                                              |
| `workspace_failed`    | `scope, why`                                                                                 |
| `agent_started`       | `actor, host`                                                                                |
| `tools_reached`       | `actor`                                                                                      |
| `brief_issued`        | `scope, brief`                                                                               |
| `brief_amended`       | `scope, brief, reason, carries`                                                              |
| `plan_set`            | `scope, plan`                                                                                |
| `plan_amended`        | `scope, plan, reason, carries, cites`                                                        |
| `edge_added`, `edge_removed` | `scope, edge, target, reason, carries`                                                |
| `handed_over`         | `from, to, paths, reason, carries`                                                           |
| `finding_raised`      | `finding: Finding`                                                                           |
| `finding_classified`  | `finding, verdict, reason`                                                                   |
| `finding_waiting`     | `finding, question`                                                                          |
| `finding_resumed`     | `finding`                                                                                    |
| `finding_reopened`    | `finding, evidence, text`                                                                    |
| `finding_withdrawn`   | `finding, reason`                                                                            |
| `claim_made`          | `claim: Claim`                                                                               |
| `candidate_ready`     | `scope, commit, candidate, parentHead`                                                       |
| `candidate_conflict`  | `scope, commit, paths`                                                                       |
| `evidence_requested`  | `scope, subject, steps, by`                                                                  |
| `evidence_recorded`   | `evidence: Evidence, wake`                                                                   |
| `integration_started` | `scope, candidate, parentHead, evidence, reason`                                             |
| `integrated`          | `scope, sha`                                                                                 |
| `integration_refused` | `scope, why: "moved" \| string`                                                              |
| `sent_back`           | `scope, reason`                                                                              |
| `reseated`            | `scope, from: ActorId \| null, to: ActorId, reason`                                          |
| `scope_dropped`       | `scope, reason`                                                                              |
| `scope_held`, `scope_resumed` | `scope, reason`                                                                      |
| `report_made`         | `scope, sections: { name, lines: Line[] }[]`: those given, in the profile's order            |
| `message_sent`        | `message: Message`                                                                           |
| `message_delivered`   | `message, at`                                                                                |
| `message_moved`       | `message, from, to`                                                                          |
| `question_asked`      | `question: Question`                                                                         |
| `question_answered`   | `question, text, asker`: who is told, the one who asked or, once it left its seat, whoever holds it |
| `obligation_opened`   | `obligation: Obligation`                                                                     |
| `obligation_closed`   | `obligation, how`                                                                            |
| `obligation_moved`    | `obligation, to`                                                                             |
| `machine_held`, `machine_released` | `actor, why`                                                                    |
| `actor_released`      | `actor, reason`                                                                              |
| `actor_gone`          | `actor, why`                                                                                 |
| `turn_ended`          | `actor, outcome, why, again, tokens, usd` (this turn's share), `tokensSoFar, usdSoFar, seen`; `again` is the text sent again for a failed turn the plugin's words `began`, none when its last turn was already one |
| `checks_set`          | `checks`                                                                                     |
| `publish_requested`   | `remote, branch, sha`                                                                        |
| `published`           | `remote, branch, sha`                                                                        |
| `publish_refused`     | `remote, branch, why, found`                                                                        |
| `permission_asked`    | `permission: Permission`                                                                     |
| `permission_answered` | `permission, actor, request, allow, reason`                                                  |
| `permission_settled`  | `permission, actor, allow`: answered outside the ledger, so no answer is sent                |
| `observation_made`    | `observation: { id, question, subject, source, model, answer, level }`                       |
| `attention_opened`    | `attention: Attention`                                                                       |
| `attention_delivered` | `attention, at`                                                                              |
| `attention_acted`     | `attention, by`                                                                              |
| `acknowledged`        | `attention`                                                                                  |
| `noise_marked`        | `attention, key`                                                                             |
| `attention_climbed`   | `attention, to: Attention` (the new one)                                                     |
| `attended`            | `candidate, attention`                                                                       |
| `passed`              | `candidate, reason`                                                                          |

## 7. Observations and attentions

`record_observation` arrives with the reflex satellite's `level`: `tell`, `consider` or `record` (below both
thresholds, or a threshold not yet earned for a note). Its `route` comes from the profile: `attention` for a watch
moment, `note` to a relation, `evidence` on a commit, `fact` to a relation. The kernel resolves the relation from
the graph and refuses a route outside those four (I12).

| Level      | Route `attention`                                           | `note`, `evidence`, `fact`                       |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `tell`     | `attention_opened` to `ownerAbove(actor)`, unless noise      | delivered as its route says                      |
| `consider` | an obligation on the watcher over the scope (a candidate); with no watcher, recorded only | recorded only |
| `record`   | recorded only                                               | recorded only                                    |

An attention's delivery goes with the reader's next batch (`now` wakes it). At the reader's next `turn_ended` after
it was delivered, an attention not settled climbs: `attention_climbed` opens a copy to `ownerAbove(reader)` with
`climbedFrom`, unless the reader owns the root, where it stays and the Human's view shows it.

## 8. Effects

`react(event, state)` returns the effects an event asks for. Each is written in the same transaction as its event.

| Event                                    | Effect                                                   | Key                         |
| ---------------------------------------- | -------------------------------------------------------- | --------------------------- |
| `scope_opened` (work, reading), unless a scope in its `after` is open | `workspace.create { scope, base, branch, commit? }` | `<seq>:workspace` |
| `workspace_ready`, or `actor_seated` of a watch scope | `agent.create { actor, role, scope, model }` | `<seq>:agent`               |
| `reseated`                               | `agent.archive { host }` of the one who left, then as `actor_seated`; `deliver` of each attention it moved to the new actor; `workspace.create` again for a scope whose copy could not be made | `<seq>:archive`, `<seq>:deliver:<attention>`, `<seq>:workspace` |
| `message_sent` (queued)                  | `deliver { to, item }`                                   | `<seq>:deliver:<message>`   |
| `message_moved`                          | `deliver { to, item }` to its new reader                 | `<seq>:deliver:<message>`   |
| `attention_opened`                       | `deliver { to, item }`                                   | `<seq>:deliver:<attention>` |
| `claim_made`                             | `workspace.candidate { scope, commit, onto }`            | `<seq>:candidate`           |
| `candidate_ready`, when a check is set   | `evidence.run { scope, subject: candidate, steps: checks }` | `<seq>:evidence`         |
| `evidence_requested`                     | `evidence.run { scope, subject, steps }`                 | `<seq>:evidence`            |
| `integration_started`                    | `workspace.advance { branch, from: parentHead, to: candidate }` | `<seq>:advance`      |
| `integration_refused` (moved)            | `workspace.candidate` again on the same commit: the candidate was stale, and the scope has none until it is made | `<seq>:candidate` |
| `integrated`, `scope_dropped`            | `workspace.remove { scope }`, `agent.archive`; `workspace.create` of each open sibling that waited for it and waits for nothing else open | `<seq>:remove`, `<seq>:archive`, `<seq>:workspace:<scope>` |
| `actor_released`                         | `agent.archive { host }`; with no host on the record, the agent is looked for by its labels: Paseo may still have been making it | `<seq>:archive` |
| `permission_answered`                    | `agent.permission { host, request, allow, reason }`, sent only while the agent still waits on it | `<seq>:permission` |
| `permission_settled`                     | a note to its answerer that nothing is owed             | `<seq>:deliver`             |
| `turn_ended` with `again`                | `deliver` of the words again to the reader, asking; otherwise, when failed, a note to the owner above | `<seq>:again`, `<seq>:note` |
| `machine_held`, `machine_released`       | `machine.hold { project, actor, hold }`                  | `<seq>:machine`             |
| `publish_requested`                      | `workspace.publish { branch, remote, expectedSha }`      | `<seq>:publish`             |
| `plan_set`, `plan_amended` of the root; `integrated` of a lane | `docs.write`: the glossary and the map written again from the log | `<seq>:docs` |

The shell holds effects that load the machine (`workspace.create`, `workspace.candidate`, `evidence.run`) while any
project on the machine holds it.

An effect names ids, not copies (`shared/contracts/effects.ts`): the dispatcher reads the current state when it sends
one, so what was delivered meanwhile is not sent again, and a delivery whose reader left is settled unsent. What moves
to a new reader is asked for again, to that reader: `message_moved`, and the attentions a `reseated` moves.
Facts and notes the kernel tells an actor (a hand-back, a finding, a failed turn, a report) are `deliver` effects with
their text. Each is keyed by its event and its reader, since one event may tell several: a check's result goes to
whoever asked for it and to the owner above.

Whoever a command changes something for is told, in the tool's own words and nothing advised:

| Event                         | Told                                                             | Wakes |
| ----------------------------- | ---------------------------------------------------------------- | ----- |
| `handed_over`                 | The owners of both scopes: which paths moved, from where to where | Yes   |
| `scope_held`, `scope_resumed` | The scope's owner, with the reason                               | Yes   |
| `evidence_recorded`, a check  | Whoever asked, and the owner above; with the evidence's id, to cite | Whoever waited |
| `evidence_recorded`, a verdict | The owner of the reading scope's parent, who seated the reader; with its id | Yes |
| `finding_reopened`            | Whoever answers it: what is new, its new evidence, and what it first said | Yes |
| `finding_withdrawn`           | Whoever was to answer it                                         | No    |
| `brief_amended`, `plan_set`, `plan_amended`, `claim_made`, `integrated`, `scope_dropped` | The owner of each scope the scope `mustTell`: what changed | Yes |
| `brief_amended` by leave of `mayChange` | The owner of the scope's parent: who amended it, from which scope, and why | Yes |
| `published`                   | The root's owner: the branch, the remote and the commit          | No    |
| `publish_refused`             | The root's owner, with why: a landing that did not reach the remote is theirs to know, whoever asked | Yes |
| `integration_refused`         | The owner of the scope's parent, who asked: over a parent that moved, that another candidate is being made; for any other reason, the reason and that the candidate stands | Yes |

An integration the workspace refuses for anything but a parent that moved (a base checked out with uncommitted
changes, or in another working copy) leaves the candidate as it was: the parent's head did not move, so the same
`integrate` is taken once what stopped it is gone. One refused as moved has no candidate until the new one is made,
and evidence on the old one does not speak for it (I4). This is the usual case and not a rare one: each landing moves
the base, by its own commit and by the map the plugin writes after it, under every other candidate made before.

A scope that waited for a sibling gets its copy and its agent when the sibling is integrated or dropped, or when the
last `after` edge that made it wait is removed (`edge_removed`): no other event would start it. A scope whose copy
could not be made (`workspace_failed`) has no agent, and `status` says so; a reseat asks for the copy again, and the
actor it seats gets its agent once the copy is there. Without that a reseat would seat an actor nothing ever starts.

A tool's reply names what was recorded, and what it made by the id it is called by from then on: the scope and the
actor an `open_scope` made, a finding, a claim, a message with its reader, a question, an attention. Without the id
its caller would need a second call to learn what to name in its next one. An `attend` on a kind its reader marked noise for that agent and scope
records the attending and opens no attention, and the reply says so, so whoever watches stops sending that kind.

The reflex is not an effect: the watch reads committed events, and missing one costs a look, not a
promise.

## 9. Views

Views read the log in SQL, or fold events in memory for what is open. Nothing a view needs is kept in `State` only
for it.

- `status(scope)`: who holds the machine while it is held, that its copy could not be made, the brief, its children with their state, the siblings it waits for, each `mustTell` and
  `mayChange` edge at both its ends while both are open, what a watching scope watches over, a hand-back with whether any check is set to run on it, open obligations on and to its owner, a message or direction owed with its words, the
  latest claim and its evidence, spend of the scope and its descendants beside its appetite.
- `record(scope)`: briefs with every version; what the owner above did to the scope (paths moved, held, resumed,
  reseated, dropped); each hand-back and what came of it (sent back, integrated); findings with their chains
  (classified, reopened, carried, withdrawn); reports; attentions with what came of them. It reads the log, so it
  answers for a scope that is closed too, and it reads only that scope's part of it: each event is filed, in the
  append that writes it, under the scopes whose record it is read in (a finding's are the scope it was raised in and
  the one it is about), so the read costs what one scope's history holds, whatever the length of the log.
- An agent's reads (`status`, `record`, `diff`) take its own scope when it names none. Their arguments are parsed at
  the boundary as a command's are, and one that does not fit is refused, saying which.
- `obligations(actor)`, `whatTheHumanNeeds`, `sinceTheyLooked(at)`, `chainOfChange(finding)`, `signals(since)`.

The five signals, each `count of total` (`shared/views/record.ts`), in the plainest terms the log supports:
repeated findings (on a line or scope that already had one), questions to the Human after whose answer a plan or
brief changed citing it, verdicts and failing checks followed by a send-back or an amended brief on their scope,
attentions left until they climbed, and messages that asked for an answer and got none.

## 10. What grows, and what is removed

A project runs for months. Everything below is bounded by open work, not by history, except the log itself.

**In memory.**

- `State` holds what is open. After each command's events are folded (`foldCommand`, never between two events of one
  command), a scope integrated or dropped with no open descendant and no open obligation about its findings or claims
  is let go, with its findings, claims and evidence, except evidence on a commit an open scope may still integrate,
  which stays citable until no open scope has that commit as its candidate, and goes then; so are delivered messages that ask nothing or were answered (but for the copy of a direction, kept while the
  direction is owed: its id is the one its owner read, and cites or answers),
  answered questions and permissions, attentions about closed scopes, and released or gone actors that nothing points
  at. Nothing an open obligation, attention or message still points at is let go, so pruning never closes anything
  (I11). A check asked for on a scope that has since been let go is waited on by nobody, and is
  let go with it. The log keeps all of it for views, and replay prunes at the same command boundaries.
- A project with nothing open and no agent seated for a day is unloaded by the shell; the next command folds it from
  its latest snapshot.
- Every map in the shell (per-project queues, per-agent subscriptions, delivery batches, the reflex's caches) has a
  removal path: on archive, on unload, or a size cap.

**On disk.**

- The log is appended and never rewritten: it is the record. About one event per command and one per turn, and one
  for each answer of the reflex, which is most of a log: a soak of a thousand small tasks wrote 110,000 events, two
  thirds of them the reflex's, in 37 MB of SQLite. Appending costs the same at any length.
- Filed: one row for each event and each scope whose record reads it, written in the event's own append and never
  rewritten; an answer of the reflex is filed under nothing.
- Snapshots: the two latest are kept, one written every 500 events and at unload.
- Effects: a settled effect keeps its key, status and result for seven days, so a late duplicate fact is dropped;
  then its row goes. A fact whose key is unknown is dropped.
- WAL is checkpointed by SQLite's default; `PRAGMA optimize` runs at unload.

**In git and Paseo.**

- A task's worktree is removed when its scope is integrated or dropped, and its branch deleted once merged. A worktree
  holding uncommitted work is kept and reported, never removed.
- Throwaway copies of non-writers are removed with their scope or at release.
- Candidate refs (`refs/sw/<scope>/candidate`) go when the scope closes.
- Agents are archived in Paseo when their seat ends; Seatworks keeps no transcript of its own.

**Processes.**

- Each step of a check runs in a process group of its own, ended whole when its command ends, at its timeout, when
  its project is unloaded and when the plugin stops. The plugin records nothing of a run it stopped: the effect stays
  pending and runs again when the plugin is back.
- A plugin whose process is killed outright ends nothing itself. Each step of a check has a guard beside it for
  that: a process on a pipe from the plugin, which ends the step's group when the pipe ends, as it does when the
  plugin's process is gone. The copy the check ran in is left, and removed the next time that check is run.

**Reported, never removed silently.** A kept worktree, a failed removal, a branch that could not be deleted: each is a
fact on the root's status.
