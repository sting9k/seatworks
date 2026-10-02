import type { CommandBody } from "../../shared/contracts/commands.ts";
import type { Event } from "../../shared/contracts/events.ts";
import { HUMAN, ROOT } from "../../shared/contracts/ids.ts";
import type { Brief, Line, Plan } from "../../shared/contracts/ledger.ts";
import {
  ASKED_ON,
  type AskedOn,
  type CodeMoment,
  type QuestionSpec,
  STATE_PATHS,
  type StatePath,
} from "../../shared/contracts/reflex.ts";
import { isWithin } from "../../shared/kernel/authority.ts";
import type { State } from "../../shared/kernel/state.ts";
import { KeyedQueue } from "../core/keyed-queue.ts";
import type { TurnItem } from "../satellites/agent-host/items.ts";
import { type ReflexConfig, wordingOf } from "../satellites/reflex/config.ts";
import type { Answer, Jev } from "../satellites/reflex/jev.ts";

type Observation = Extract<CommandBody, { type: "record_observation" }>;
type Asked = { name: string; spec: QuestionSpec; p: number; label: string | null; model: string };
/** An event a question is asked on with a subject of its own; a turn's end is asked of its last words instead. */
type Subject = Extract<Event, { type: Exclude<AskedOn, "turn_ended"> }>;
const isSubject = (e: Event): e is Subject =>
  e.type !== "turn_ended" && (ASKED_ON as readonly string[]).includes(e.type);

/** Asks queued per project past this are left unread, so a slow host never grows a backlog without bound. */
const MAX_QUEUED = 100;
/** Failed calls remembered per agent for the loop count; the oldest go first. */
const MAX_SIGNATURES = 50;

/** The reflex and the watch's eye: they ask Jev one condition at a time and record the answer; nothing decides. */
export class Reflex {
  private readonly config: ReflexConfig;
  private readonly jev: () => Jev | null;
  private readonly submit: (project: string, body: Observation) => Promise<void>;
  private readonly alarm: (text: string | null) => void;
  private readonly code: Code;
  /** The roles some moment watches: only their work is gathered for a sweep. */
  private readonly watched: ReadonlySet<string>;
  private readonly queue = new KeyedQueue<string>();
  private readonly queued = new Map<string, number>();
  /** Per agent, how often each failing call came back: going in circles counted in code (STEERING.md). */
  private readonly loops = new Map<string, Map<string, number>>();
  /** Agents that sent the kernel a command since their last turn ended: a turn without one said its words only. */
  private readonly acted = new Set<string>();
  /** Per agent, turns in a row that spent and recorded nothing. */
  private readonly silent = new Map<string, number>();
  /** Per open finding, how many of its answerer's turns have ended since it was raised. */
  private readonly unanswered = new Map<string, number>();
  /** Test files each agent changed an existing line of, told once each. */
  private readonly bent = new Set<string>();
  /** Per Watcher, the work of the agents it watches since its last sweep: a line per item, the newest kept. */
  private readonly unswept = new Map<string, Pile>();

  constructor(
    config: ReflexConfig,
    jev: () => Jev | null,
    submit: (project: string, body: Observation) => Promise<void>,
    alarm: (text: string | null) => void,
    code: Code,
  ) {
    this.code = code;
    this.config = config;
    this.watched = new Set([...config.moments.values()].flatMap((m) => m.watches ?? []));
    this.jev = jev;
    this.submit = submit;
    this.alarm = alarm;
  }

  /** Questions the profile asks of committed events; a turn's end also settles the loop count, spend and silence. */
  onEvents(project: string, events: readonly Event[], state: State): void {
    for (const e of events) {
      if (state.actors.has(e.by)) this.acted.add(`${project}:${e.by}`);
      if (e.type === "turn_ended") {
        this.pastAppetite(project, e, state);
        this.silence(project, e, state);
        this.findingsWaiting(project, e.actor, state);
      }
      if (e.type === "actor_released" || e.type === "actor_gone") this.forgetActor(`${project}:${e.actor}`);
      if (e.type === "finding_classified" || e.type === "finding_withdrawn")
        this.unanswered.delete(`${project}:${e.finding}`);
      if (e.type === "claim_made") this.handBack(project, e.claim.scope, e.claim.by, e.claim.commit, state);
      for (const [name, spec] of this.config.questions) {
        // Asked elsewhere: a question that borrows another's wording (`use`), one read hunk by hunk, one at a turn's end.
        if (!spec.on?.includes(e.type) || (spec.noul === undefined && spec.choice === undefined)) continue;
        if (spec.hunks !== undefined || !isSubject(e)) continue;
        const asked = this.subjectOf(e, state);
        if (!asked || !matches(spec, e, state)) continue;
        const ctx = { event: e, state, item: null, actor: asked.actor, scope: asked.scope };
        const values = stateFor(spec, ctx);
        if (values)
          this.enqueue(project, () =>
            this.askAndRecord(project, { [name]: spec }, values, asked.scope, asked.actor, asked.commit, null, ctx),
          );
      }
    }
  }

  /** The watch's eye on one turn: code facts first, then each item asked the moments its agent is watched for. */
  onTurn(project: string, actorId: string, items: readonly TurnItem[], state: State): void {
    const actor = state.actors.get(actorId);
    if (actor?.status !== "seated") return;
    this.circles(project, actorId, actor.scope, items);
    for (const item of items)
      if (item.kind === "edit") {
        this.mints(project, actorId, actor.role, actor.scope, item);
        this.madeToPass(project, actorId, actor.role, actor.scope, item, state);
      }
    this.wordsOnly(project, actorId, actor.scope, items, state);
    this.gather(project, actorId, items, state);
    const kinds = { thought: "thought", said: "said", edit: "edit", ran: null } as const;
    for (const item of items) {
      const reads = kinds[item.kind];
      if (reads === null) continue;
      const moments: Record<string, QuestionSpec> = {};
      for (const [name, spec] of this.config.moments)
        if (spec.by !== "code" && spec.watches?.includes(actor.role) && spec.reads?.includes(reads))
          moments[name] = spec;
      const ctx = {
        event: null,
        state,
        item: item.text.slice(0, this.config.itemChars),
        actor: actorId,
        scope: actor.scope,
      };
      const groups = groupByState(moments, (spec) => stateFor(spec, ctx));
      for (const group of groups)
        this.enqueue(project, () =>
          this.askAndRecord(project, group.questions, group.values, actor.scope, actorId, null, item.text, ctx),
        );
    }
  }

  /** A sweep driven by the work, not a clock: a watching agent is woken with a digest once enough has gathered. */
  private gather(project: string, actorId: string, items: readonly TurnItem[], state: State): void {
    const sweep = this.config.sweep;
    const actor = state.actors.get(actorId);
    if (!sweep || !actor || !this.watched.has(actor.role) || items.length === 0) return;
    for (const watcher of watchersOver(state, actor.scope)) {
      const key = `${project}:${watcher.id}`;
      const pile: Pile = this.unswept.get(key) ?? { chars: 0, lines: new Map(), counts: new Map() };
      this.unswept.set(key, pile);
      const mine = pile.lines.get(actorId) ?? [];
      pile.lines.set(actorId, mine);
      pile.counts.set(actorId, (pile.counts.get(actorId) ?? 0) + items.length);
      for (const item of items) {
        const line = `${item.kind}${item.path ? ` ${item.path}` : ""}: ${item.text.slice(0, this.config.itemChars)}`;
        mine.push(this.masked(line));
        pile.chars += line.length;
      }
      // Only the newest a digest can hold are kept, so a Watcher that never sweeps holds a bounded pile.
      while (mine.join("\n").length > sweep.digestChars && mine.length > 1) mine.shift();
      if (pile.chars < sweep.everyChars) continue;
      this.unswept.delete(key);
      void this.submit(project, {
        type: "record_observation",
        question: "sweep",
        actor: watcher.id,
        scope: watcher.scope,
        source: "code",
        model: null,
        answer: `${pile.chars} characters of new work`,
        level: "tell",
        route: { kind: "note", to: "self", text: digestOf(pile, state, sweep.digestChars), wakes: true },
      });
    }
  }

  /** A turn that ended with words and no command: whether its last words hand back, ask or wait, which only a tool records. */
  private wordsOnly(project: string, actor: string, scope: string, items: readonly TurnItem[], state: State): void {
    const acted = this.acted.has(`${project}:${actor}`);
    const last = items.findLast((i) => i.kind === "said")?.text ?? null;
    if (acted || last === null) return;
    for (const [name, spec] of this.config.questions) {
      if (!spec.on?.includes("turn_ended")) continue;
      const ctx = { event: null, state, item: last.slice(-this.config.itemChars), actor, scope };
      const values = stateFor(spec, ctx);
      if (values)
        this.enqueue(project, () =>
          this.askAndRecord(project, { [name]: spec }, values, scope, actor, null, null, ctx),
        );
    }
  }

  /** Lets go of what the reflex keeps for a project that left memory. */
  forget(project: string): void {
    const mine = (key: string) => key.startsWith(`${project}:`);
    for (const map of [this.loops, this.silent, this.unanswered, this.unswept])
      for (const key of map.keys()) if (mine(key)) map.delete(key);
    for (const set of [this.acted, this.bent]) for (const key of set) if (mine(key)) set.delete(key);
  }

  private forgetActor(key: string): void {
    this.unswept.delete(key);
    this.loops.delete(key);
    this.silent.delete(key);
    this.acted.delete(key);
    for (const k of this.bent) if (k.startsWith(`${key}:`)) this.bent.delete(k);
  }

  private enqueue(project: string, work: () => Promise<void>): void {
    const n = this.queued.get(project) ?? 0;
    if (n >= MAX_QUEUED) return;
    this.queued.set(project, n + 1);
    void this.queue
      .run(project, work)
      .catch(() => undefined)
      .finally(() => {
        const left = (this.queued.get(project) ?? 1) - 1;
        if (left <= 0) this.queued.delete(project);
        else this.queued.set(project, left);
      });
  }

  /** What looks like a secret, masked in what the record keeps as it is before anything leaves (REFLEX.md). */
  private masked(text: string): string {
    let out = text;
    for (const p of this.config.mask) out = out.replace(p, "[masked]");
    return out;
  }

  private async askAndRecord(
    project: string,
    questions: Record<string, QuestionSpec>,
    values: Record<string, string>,
    scope: string,
    actor: string | null,
    commit: string | null,
    quoted: string | null = null,
    ctx: Context | null = null,
  ): Promise<void> {
    const jev = this.jev();
    if (!jev) {
      this.alarm(
        "The reflex has no key: set Jev's route and key in the plugin's settings. The team works on, less watched.",
      );
      return;
    }
    const asking = await jev.ask(values, questions);
    if (!asking.ok) {
      if (asking.why === "refused") this.alarm(`Jev refused the key: ${asking.says}. The team works on, less watched.`);
      return;
    }
    this.alarm(null);
    for (const [name, spec] of Object.entries(questions)) {
      const a = asking.answers[name];
      if (!a) continue;
      const given = spec.against !== undefined && ctx ? valueOf(spec.against, ctx) : null;
      const asked = read(name, spec, a, asking.model, given);
      await this.submit(
        project,
        observationOf(asked, scope, actor, commit, quoted === null ? null : this.masked(quoted)),
      );
    }
  }

  /** A test that mints an API: names its added lines give the code that nothing settled; only then is Jev asked. */
  private mints(project: string, actor: string, role: string, scope: string, item: TurnItem): void {
    const spec = this.config.moments.get("mints-an-api");
    const test = this.config.testPath;
    if (!spec?.watches?.includes(role) || !test || item.path === null || !test.test(item.path)) return;
    const names = namesIn(item.text, spec);
    if (names.length === 0) return;
    this.enqueue(project, async () => {
      const known = await this.code.settled(project, actor, names);
      const unsettled = names.filter((n) => !known.has(n));
      if (unsettled.length === 0) return;
      const ask = (spec as { ask?: Record<string, QuestionSpec> }).ask ?? {};
      const questions = Object.fromEntries(
        Object.entries(ask).map(([k, q]) => [
          `mints-an-api.${k}`,
          { ...q, tell: spec.tell, consider: spec.consider, for: spec.for },
        ]),
      );
      await this.askAndRecord(
        project,
        questions,
        { hunk: added(item.text).slice(0, this.config.itemChars * 2), unsettled: unsettled.join(", ") },
        scope,
        actor,
        null,
        `${item.path}: ${unsettled.join(", ")}`,
      );
    });
  }

  /** A hand-back's diff read hunk by hunk, test files and the rest apart; all go as judgement evidence on it. */
  private handBack(project: string, scope: string, actor: string, commit: string, state: State): void {
    const test = this.config.testPath;
    const mints = this.config.questions.has("mints-an-api") ? this.config.moments.get("mints-an-api") : undefined;
    const byHunk = [...this.config.questions].filter(([, q]) => q.hunks !== undefined && q.on?.includes("claim_made"));
    if (!test || (!mints && byHunk.length === 0)) return;
    this.enqueue(project, async () => {
      for (const file of await this.code.diffs(project, scope, commit)) {
        const side = test.test(file.path) ? "test" : "product";
        if (mints && side === "test") await this.mintsIn(project, scope, actor, commit, file.text, mints);
        const asks = Object.fromEntries(byHunk.filter(([, q]) => q.hunks === side));
        for (const hunk of hunksOf(file.text)) {
          const ctx = { event: null, state, item: hunk.slice(0, this.config.itemChars * 2), actor, scope };
          for (const group of groupByState(asks, (q) => stateFor(q, ctx)))
            await this.askAndRecord(project, group.questions, group.values, scope, actor, commit, null, ctx);
        }
      }
    });
  }

  private async mintsIn(
    project: string,
    scope: string,
    actor: string,
    commit: string,
    diff: string,
    spec: QuestionSpec,
  ): Promise<void> {
    const names = namesIn(diff, spec);
    const known = await this.code.settled(project, actor, names);
    const unsettled = names.filter((n) => !known.has(n));
    if (unsettled.length === 0) return;
    const ask = (spec as { ask?: Record<string, QuestionSpec> }).ask ?? {};
    const questions = Object.fromEntries(
      Object.entries(ask).map(([k, q]) => [`mints-an-api.${k}`, { ...q, tells: "evidence" }]),
    );
    await this.askAndRecord(
      project,
      questions,
      { hunk: added(diff).slice(0, this.config.itemChars * 2), unsettled: unsettled.join(", ") },
      scope,
      actor,
      commit,
    );
  }

  /** A check made to pass: a test file's existing line changed in a scope whose brief asks for no work on tests. */
  private madeToPass(project: string, actor: string, role: string, scope: string, item: TurnItem, state: State): void {
    const spec = this.counted("check-made-to-pass");
    const test = this.config.testPath;
    if (!spec?.watches?.includes(role) || !test || item.path === null || !test.test(item.path)) return;
    const brief = state.scopes.get(scope)?.brief;
    const briefText = brief ? [brief.goal, ...brief.constraints].map((l) => l.text).join("\n") : "";
    if (/\btests?\b|\bspecs?\b|\bassert/i.test(briefText)) return;
    const removed = item.text.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    if (removed.length === 0) return;
    const key = `${project}:${actor}:${item.path}`;
    if (this.bent.has(key)) return;
    this.bent.add(key);
    const assertion = removed.some((l) => /\b(expect|assert|should|toBe|toEqual)\b/.test(l));
    void this.submit(project, {
      type: "record_observation",
      question: "check-made-to-pass",
      actor,
      scope,
      source: "code",
      model: null,
      answer: assertion ? "an assertion changed" : "a test line changed",
      level: assertion ? "tell" : "consider",
      route: {
        kind: "attention",
        why: this.masked(
          `${item.path} changed where the brief asks nothing of tests: ${removed.slice(0, 3).join(" ")}`.slice(0, 400),
        ),
        facts: [],
        urgency: "now",
      },
    });
  }

  /** Silent without progress: turns in a row that spent and sent the kernel nothing, told once as they reach the count. */
  private silence(project: string, e: Extract<Event, { type: "turn_ended" }>, state: State): void {
    const key = `${project}:${e.actor}`;
    const acted = this.acted.delete(key);
    const spec = this.counted("silent-without-progress");
    const actor = state.actors.get(e.actor);
    if (!spec || !actor || !spec.watches?.includes(actor.role)) return;
    if (acted || (e.tokens === 0 && e.usd === 0)) {
      this.silent.delete(key);
      return;
    }
    const n = (this.silent.get(key) ?? 0) + 1;
    this.silent.set(key, n);
    if (n !== this.config.silentTurns) return;
    void this.submit(project, {
      type: "record_observation",
      question: "silent-without-progress",
      actor: actor.id,
      scope: actor.scope,
      source: "code",
      model: null,
      answer: `${n} turns`,
      level: "tell",
      route: {
        kind: "attention",
        why: `${n} turns in a row spent and recorded nothing: no hand-back, finding, message or question`,
        facts: [],
        urgency: "later",
      },
    });
  }

  /** Findings waiting: one its answerer has let stand past the end of its next turn, told once to the owner above it. */
  private findingsWaiting(project: string, actorId: string, state: State): void {
    const actor = state.actors.get(actorId);
    const spec = this.counted("findings-waiting");
    if (!spec || !actor || !spec.watches?.includes(actor.role)) return;
    for (const f of state.findings.values()) {
      if (f.status !== "raised" || state.scopes.get(f.answeredBy)?.owner !== actorId) continue;
      const key = `${project}:${f.id}`;
      const n = (this.unanswered.get(key) ?? 0) + 1;
      this.unanswered.set(key, n);
      // The turn it arrived in, then the next: past that, it waits on the answerer.
      if (n !== 2) continue;
      void this.submit(project, {
        type: "record_observation",
        question: "findings-waiting",
        actor: actorId,
        scope: actor.scope,
        source: "code",
        model: null,
        answer: `${f.id} unclassified`,
        level: "tell",
        route: {
          kind: "attention",
          why: this.masked(`${f.id} from ${f.raisedBy} is still unclassified: ${f.text}`.slice(0, 400)),
          facts: [],
          urgency: "later",
        },
      });
    }
  }

  /** Going in circles: the same failing call again and again, counted with no model asked. */
  private circles(project: string, actor: string, scope: string, items: readonly TurnItem[]): void {
    if (!this.counted("going-in-circles")) return;
    const key = `${project}:${actor}`;
    const seen = this.loops.get(key) ?? new Map<string, number>();
    this.loops.set(key, seen);
    for (const item of items) {
      if (item.signature === null) continue;
      const n = (seen.get(item.signature) ?? 0) + 1;
      seen.delete(item.signature);
      seen.set(item.signature, n);
      if (seen.size > MAX_SIGNATURES) seen.delete(seen.keys().next().value ?? "");
      if (n !== this.config.repeats && n !== this.config.repeatsTold) continue;
      void this.submit(project, {
        type: "record_observation",
        question: "going-in-circles",
        actor,
        scope,
        source: "code",
        model: null,
        answer: `${n} times`,
        level: n === this.config.repeatsTold ? "tell" : "consider",
        route: {
          kind: "attention",
          why: this.masked(`the same call failed the same way ${n} times: ${item.text.slice(0, 200)}`),
          facts: [this.masked(item.failed ?? "")],
          urgency: "now",
        },
      });
    }
  }

  /** Past the appetite: spend crossing the amount a scope's plan names, told once as it crosses. */
  private pastAppetite(project: string, e: Extract<Event, { type: "turn_ended" }>, state: State): void {
    if (!this.counted("past-appetite") || e.usd <= 0) return;
    for (let at = state.actors.get(e.actor)?.scope ?? null; at !== null; at = state.scopes.get(at)?.parent ?? null) {
      const scope = state.scopes.get(at);
      const usd = scope?.plan?.appetite.usd ?? null;
      if (!scope || usd === null || scope.owner === null || at === ROOT) continue;
      const after = scope.spent.usd;
      if (after - e.usd >= usd || after < usd) continue;
      void this.submit(project, {
        type: "record_observation",
        question: "past-appetite",
        actor: scope.owner,
        scope: scope.id,
        source: "code",
        model: null,
        answer: `$${after.toFixed(2)} of $${usd}`,
        level: "tell",
        route: {
          kind: "attention",
          why: `scope ${scope.id} has spent $${after.toFixed(2)}, past the $${usd} its plan's appetite names`,
          facts: [],
          urgency: "now",
        },
      });
    }
  }

  /** A moment counted in code, when the profile watches for it. */
  private counted(name: CodeMoment): QuestionSpec | undefined {
    return this.config.moments.get(name);
  }

  private subjectOf(e: Subject, state: State): { scope: string; actor: string | null; commit: string | null } | null {
    const by = state.actors.has(e.by) ? e.by : null;
    const seatOf = (actor: string) => {
      const a = state.actors.get(actor);
      return a ? { scope: a.scope, actor: a.id, commit: null } : null;
    };
    switch (e.type) {
      case "finding_raised":
        return { scope: e.finding.scope, actor: e.finding.raisedBy, commit: null };
      case "finding_classified": {
        const f = state.findings.get(e.finding);
        return f ? { scope: f.scope, actor: by, commit: null } : null;
      }
      case "plan_amended":
      case "brief_issued":
      case "brief_amended":
      case "report_made":
        return { scope: e.scope, actor: by, commit: null };
      case "evidence_recorded":
        return { scope: e.evidence.scope, actor: null, commit: e.evidence.subject };
      case "claim_made":
        return { scope: e.claim.scope, actor: e.claim.by, commit: e.claim.commit };
      case "permission_asked":
        return seatOf(e.permission.actor);
      case "message_sent":
        return seatOf(e.message.to);
    }
  }
}

/** What the reflex reads of code, through the workspace: never a satellite call of its own. */
export type Code = {
  /** What is already settled of these names for one agent: in its brief and plans, the base, or its own code. */
  settled(project: string, actor: string, names: readonly string[]): Promise<ReadonlySet<string>>;
  /** The files a handed-back commit changed against its parent's branch, each with its diff. */
  diffs(project: string, scope: string, commit: string): Promise<{ path: string; text: string }[]>;
};

/** The lines a diff adds, or the whole text when it is not a diff. */
function added(text: string): string {
  const lines = text.split("\n");
  if (!lines.some((l) => l.startsWith("@@") || l.startsWith("+++"))) return text;
  return lines
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
}

/** The seated Watchers whose watch scope reaches a scope: `over` all, or a scope it lies within. */
function watchersOver(state: State, scope: string): { id: string; scope: string }[] {
  const out: { id: string; scope: string }[] = [];
  for (const s of state.scopes.values()) {
    if (s.kind !== "watch" || s.status !== "open" || s.owner === null) continue;
    if (s.over === "all" || s.over.some((o) => isWithin(state, scope, o))) out.push({ id: s.owner, scope: s.id });
  }
  return out;
}

/** One Watcher's gathered work: each agent's newest lines, and how many items it had in all. */
type Pile = { chars: number; lines: Map<string, string[]>; counts: Map<string, number> };

/** A sweep's note: each agent's newest items since the last sweep, an equal share each, with how many were left out. */
function digestOf(pile: Pile, state: State, chars: number): string {
  const share = Math.floor(chars / Math.max(1, pile.lines.size)) - 200;
  const parts = [...pile.lines].map(([id, items]) => {
    const a = state.actors.get(id);
    const kept: string[] = [];
    let used = 0;
    for (let i = items.length - 1; i >= 0 && used + items[i]!.length <= share; i--) {
      kept.unshift(items[i]!);
      used += items[i]!.length + 1;
    }
    const all = pile.counts.get(id) ?? kept.length;
    const left = all - kept.length;
    const head = `${id} (${a?.role ?? "?"}, scope ${a?.scope ?? "?"}): ${all} items${left > 0 ? `, the ${left} oldest left to \`look\`` : ""}`;
    return [head, ...kept].join("\n");
  });
  return ["A sweep: the work since the last one.", ...parts].join("\n\n").slice(0, chars);
}

/** A file's diff cut at each hunk header; a text that is not a diff is one hunk. */
function hunksOf(diff: string): string[] {
  const parts = diff.split(/^(?=@@ )/m).filter((p) => p.startsWith("@@"));
  return parts.length > 0 ? parts : [diff];
}

function namesIn(text: string, spec: QuestionSpec): string[] {
  const loose = spec as { names?: string[]; ignore?: string[] };
  const ignore = new Set(loose.ignore ?? []);
  const found = new Set<string>();
  const body = added(text);
  for (const pattern of loose.names ?? [])
    for (const m of body.matchAll(new RegExp(pattern, "g"))) {
      const name = m[1];
      if (name && name.length > 1 && !ignore.has(name)) found.add(name);
    }
  return [...found].slice(0, 40);
}

/** The answer as a probability of the outcome that matters: `matters`, every label but `against`, or the first. */
function read(name: string, spec: QuestionSpec, a: Answer, model: string, given: string | null): Asked {
  if (a.type === "noul") return { name, spec, p: a.noul, label: null, model };
  const labels = Object.keys(spec.labels ?? {});
  const weighed = spec.matters ?? (spec.against !== undefined ? labels.filter((l) => l !== given) : labels.slice(0, 1));
  const p = weighed.reduce((sum, l) => sum + (a.probabilities[l] ?? 0), 0);
  return { name, spec, p: Math.min(1, p), label: a.choice, model };
}

/** A threshold speaks only for the wording and model it was earned on (REFLEX.md); unearned, it goes no further than a candidate. */
function levelOf(a: Asked): Observation["level"] {
  const earned = a.spec.for !== undefined && a.spec.for.wording === wordingOf(a.spec) && a.spec.for.model === a.model;
  if (a.spec.tell !== undefined && a.p >= a.spec.tell) return earned ? "tell" : "consider";
  if (a.spec.consider !== undefined && a.p >= a.spec.consider) return "consider";
  return "record";
}

function observationOf(
  a: Asked,
  scope: string,
  actor: string | null,
  commit: string | null,
  quoted: string | null,
): Observation {
  const answer = a.label === null ? a.p.toFixed(2) : `${a.label} (${a.p.toFixed(2)})`;
  const text = `${a.name}: ${answer}, asked of ${a.model}: ${a.spec.noul ?? a.spec.choice ?? ""}`;
  const base = {
    type: "record_observation" as const,
    question: a.name,
    actor,
    scope,
    source: "reflex" as const,
    model: a.model,
    answer,
  };
  const tells = a.spec.tells;
  if (tells === "evidence" && commit !== null)
    return { ...base, level: "tell", route: { kind: "evidence", commit, ok: a.p < 0.5, text } };
  const level = levelOf(a);
  if (tells === undefined)
    return {
      ...base,
      level,
      route: { kind: "attention", why: quoted ? `"${quoted.slice(0, 240)}"` : text, facts: [], urgency: "now" },
    };
  if (tells === "root")
    return { ...base, level, route: { kind: "note", to: "root", text, wakes: a.spec.wakes ?? false } };
  const to = tells === "parent" || tells === "self" || tells === "answerer" ? tells : "parent";
  // A fact not yet earned stays on the record rather than becoming a candidate (REFLEX.md, Questions are data).
  return { ...base, level: level === "consider" ? "record" : level, route: { kind: "fact", to, text } };
}

function matches(spec: QuestionSpec, e: Event, state: State): boolean {
  const when = spec.when;
  if (!when) return true;
  if (e.type === "evidence_recorded") {
    if (when.result === "failed" && e.evidence.ok) return false;
    if (when.cause === "unknown" && e.evidence.steps.some((s) => s.cause === "environment")) return false;
    return e.evidence.kind === "check";
  }
  if ((e.type === "brief_issued" || e.type === "brief_amended") && typeof when.kind === "string")
    return e.brief.kind === when.kind;
  if (e.type === "finding_classified" && Array.isArray(when.verdict)) return when.verdict.includes(e.verdict);
  if (e.type === "message_sent" && when.from === "human")
    return e.message.from === HUMAN && e.message.copyOf === null && state.actors.has(e.message.to);
  return true;
}

type Context = {
  event: Event | null;
  state: State;
  /** What is judged when it is not the event: an item of a turn, a hunk, a turn's last words. */
  item: string | null;
  actor: string | null;
  scope: string | null;
};

/** Each field a question reads, taken from where the record keeps it; null when one is missing, and nothing is asked. */
function stateFor(spec: QuestionSpec, ctx: Context): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [field, path] of Object.entries(spec.state ?? {})) {
    const value = valueOf(path, ctx);
    if (value === null || value === "") return null;
    out[field] = value;
  }
  return out;
}

/** Lines as the state gives them; a list the record holds empty says so, since its absence is part of the answer. */
const linesText = (lines: readonly Line[]) =>
  lines.length > 0 ? lines.map((l) => `- ${l.text}`).join("\n") : "(none)";

function briefOf({ event, state, scope }: Context): Brief | null {
  if (event?.type === "brief_issued" || event?.type === "brief_amended") return event.brief;
  return (scope ? state.scopes.get(scope)?.brief : null) ?? null;
}

/** The plan nearest above the scope: its own, or its parent's, up to the root's. */
function planOf({ state, scope }: Context): Plan | null {
  for (let at = scope; at !== null; at = state.scopes.get(at)?.parent ?? null) {
    const plan = state.scopes.get(at)?.plan;
    if (plan) return plan;
  }
  return null;
}

function valueOf(path: string, ctx: Context): string | null {
  const { event, state, item, actor } = ctx;
  const root = state.scopes.get(ROOT);
  const brief = briefOf(ctx);
  const known = STATE_PATHS.find((p) => p === path);
  if (known === undefined) return null;
  switch (known satisfies StatePath) {
    // Given by the code that counts a test's minted names, never read off the record.
    case "names.unsettled":
      return null;
    case "item":
    case "hunk":
    case "turn.lastSaid":
      return item;
    case "plan.goal":
      return root?.plan?.goal.text ?? null;
    case "plan.appetite": {
      const a = root?.plan?.appetite;
      return a ? `${a.line.text}${a.usd !== null ? ` ($${a.usd})` : ""}` : null;
    }
    case "plan.lines": {
      const plan = planOf(ctx);
      return plan ? linesText([plan.goal, ...plan.limits, ...plan.unknowns.map((u) => u.line)]) : "(no plan)";
    }
    case "scope.brief.goal": {
      const scope = actor ? state.scopes.get(state.actors.get(actor)?.scope ?? "") : undefined;
      return scope?.brief?.goal.text ?? null;
    }
    case "brief.goal":
      return brief?.goal.text ?? null;
    case "brief.constraints":
      return brief ? linesText(brief.constraints) : null;
    case "brief.choices":
      return brief ? linesText(brief.choices) : null;
    case "brief.context":
      return brief ? linesText(brief.context) : null;
    case "brief.kind":
      return brief?.kind ?? null;
    case "brief.text":
      return brief
        ? [
            `Goal: ${brief.goal.text}`,
            `Constraints:\n${linesText(brief.constraints)}`,
            `Choices:\n${linesText(brief.choices)}`,
            `Context:\n${linesText(brief.context)}`,
          ].join("\n")
        : null;
    case "step.logTail":
      return event?.type === "evidence_recorded" ? event.evidence.summary : null;
    case "finding.evidence": {
      const f = event?.type === "finding_classified" ? state.findings.get(event.finding) : undefined;
      if (!f) return null;
      const shown = f.evidence.flatMap((id) => {
        const ev = state.evidence.get(id);
        return ev ? [`${ev.kind} on ${ev.subject.slice(0, 8)}: ${ev.ok ? "ok" : "failing"}. ${ev.summary}`] : [];
      });
      return [`The finding: ${f.text}`, ...shown].join("\n");
    }
    case "finding.reason":
      return event?.type === "finding_classified" ? event.reason : null;
    case "report.lines":
      return event?.type === "report_made"
        ? event.sections.map((s) => `${s.name}:\n${linesText(s.lines)}`).join("\n") || "(none)"
        : null;
    case "handback.text":
      return event?.type === "claim_made"
        ? [event.claim.text, ...event.claim.behaviours.map((b) => `- ${b.behaviour}`)].join("\n")
        : null;
    case "permission.text":
      return event?.type === "permission_asked" ? event.permission.text : null;
    case "message.text":
      return event?.type === "message_sent" ? event.message.text : null;
    case "event.text":
      if (event?.type === "finding_raised") return event.finding.text;
      if (event?.type === "plan_amended")
        return [event.reason, event.plan.goal.text, ...event.plan.limits.map((l) => l.text)].join("\n");
      if (event?.type === "brief_amended")
        return [
          event.reason,
          event.brief.goal.text,
          ...event.brief.constraints.map((l) => l.text),
          ...event.brief.choices.map((l) => l.text),
        ].join("\n");
      return null;
  }
}

/** Questions that read the same fields go in one call: the state is paid for once (REFLEX.md, Running it). */
function groupByState(
  questions: Record<string, QuestionSpec>,
  values: (spec: QuestionSpec) => Record<string, string> | null,
) {
  const groups = new Map<string, { values: Record<string, string>; questions: Record<string, QuestionSpec> }>();
  for (const [name, spec] of Object.entries(questions)) {
    const v = values(spec);
    if (!v) continue;
    const key = JSON.stringify(v);
    const group = groups.get(key) ?? { values: v, questions: {} };
    group.questions[name] = spec;
    groups.set(key, group);
  }
  return [...groups.values()];
}
