import type { CommandBody } from "../../shared/contracts/commands.ts";
import type { Event } from "../../shared/contracts/events.ts";
import { ROOT } from "../../shared/contracts/ids.ts";
import type { State } from "../../shared/kernel/state.ts";
import { KeyedQueue } from "../core/keyed-queue.ts";
import type { TurnItem } from "../satellites/agent-host/items.ts";
import { type QuestionSpec, type ReflexConfig, wordingOf } from "../satellites/reflex/config.ts";
import type { Answer, Jev } from "../satellites/reflex/jev.ts";

type Observation = Extract<CommandBody, { type: "record_observation" }>;
type Asked = { name: string; spec: QuestionSpec; p: number; label: string | null; model: string };

/** Asks queued per project past this are left unread, so a slow host never grows a backlog without bound. */
const MAX_QUEUED = 100;
/** Failed calls remembered per agent for the loop count; the oldest go first. */
const MAX_SIGNATURES = 50;

/**
 * The reflex and the watch's eye: they read what the record and the agents' turns hold, ask Jev one condition at a
 * time, and record what it answered as observations the kernel routes (REFLEX.md, WATCH.md). Nothing here decides.
 */
export class Reflex {
  private readonly config: ReflexConfig;
  private readonly jev: () => Jev | null;
  private readonly submit: (project: string, body: Observation) => Promise<void>;
  private readonly alarm: (text: string | null) => void;
  private readonly settled: Settled;
  private readonly queue = new KeyedQueue<string>();
  private readonly queued = new Map<string, number>();
  /** Per agent, how often each failing call came back: going in circles counted in code (STEERING.md). */
  private readonly loops = new Map<string, Map<string, number>>();

  constructor(
    config: ReflexConfig,
    jev: () => Jev | null,
    submit: (project: string, body: Observation) => Promise<void>,
    alarm: (text: string | null) => void,
    settled: Settled,
  ) {
    this.settled = settled;
    this.config = config;
    this.jev = jev;
    this.submit = submit;
    this.alarm = alarm;
  }

  /** Questions the profile asks of committed events; a turn's end also settles the loop count and spend. */
  onEvents(project: string, events: readonly Event[], state: State): void {
    for (const e of events) {
      if (e.type === "turn_ended") this.pastAppetite(project, e, state);
      if (e.type === "actor_released" || e.type === "actor_gone") this.loops.delete(`${project}:${e.actor}`);
      for (const [name, spec] of this.config.questions) {
        if (!spec.on?.includes(e.type)) continue;
        const asked = this.subjectOf(e, state);
        if (!asked || !matches(spec, e)) continue;
        const values = stateFor(spec, { event: e, state, item: null, actor: asked.actor });
        if (values)
          this.enqueue(project, () =>
            this.askAndRecord(project, { [name]: spec }, values, asked.scope, asked.actor, asked.commit),
          );
      }
    }
  }

  /** The watch's eye on one turn: code facts first, then each item asked the moments its agent is watched for. */
  onTurn(project: string, actorId: string, items: readonly TurnItem[], state: State): void {
    const actor = state.actors.get(actorId);
    if (actor?.status !== "seated") return;
    this.circles(project, actorId, actor.scope, items);
    for (const item of items) if (item.kind === "edit") this.mints(project, actorId, actor.role, actor.scope, item);
    const kinds = { thought: "thought", said: "said", edit: "edit", ran: null } as const;
    for (const item of items) {
      const reads = kinds[item.kind];
      if (reads === null) continue;
      const moments: Record<string, QuestionSpec> = {};
      for (const [name, spec] of this.config.moments)
        if (spec.by !== "code" && spec.watches?.includes(actor.role) && spec.reads?.includes(reads))
          moments[name] = spec;
      const groups = groupByState(moments, (spec) =>
        stateFor(spec, { event: null, state, item: item.text.slice(0, this.config.itemChars), actor: actorId }),
      );
      for (const group of groups)
        this.enqueue(project, () =>
          this.askAndRecord(project, group.questions, group.values, actor.scope, actorId, null, item.text),
        );
    }
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

  private async askAndRecord(
    project: string,
    questions: Record<string, QuestionSpec>,
    values: Record<string, string>,
    scope: string,
    actor: string | null,
    commit: string | null,
    quoted: string | null = null,
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
      const asked = read(name, spec, a, asking.model);
      await this.submit(project, observationOf(asked, scope, actor, commit, quoted));
    }
  }

  /**
   * A test that mints an API (WATCH.md): the names its added lines give the code, less those the brief, the plans,
   * the base or the agent's own code already settled. Only when some are left is Jev asked, two questions over them.
   */
  private mints(project: string, actor: string, role: string, scope: string, item: TurnItem): void {
    const spec = this.config.moments.get("mints-an-api");
    const test = this.config.testPath;
    if (!spec?.watches?.includes(role) || !test || item.path === null || !test.test(item.path)) return;
    const names = namesIn(item.text, spec);
    if (names.length === 0) return;
    this.enqueue(project, async () => {
      const known = await this.settled(project, actor, names);
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

  /** Going in circles: the same failing call again and again, counted with no model asked. */
  private circles(project: string, actor: string, scope: string, items: readonly TurnItem[]): void {
    if (!this.config.moments.has("going-in-circles")) return;
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
          why: `the same call failed the same way ${n} times: ${item.text.slice(0, 200)}`,
          facts: [item.failed ?? ""],
          urgency: "now",
        },
      });
    }
  }

  /** Past the appetite: spend crossing the amount a scope's plan names, told once as it crosses. */
  private pastAppetite(project: string, e: Extract<Event, { type: "turn_ended" }>, state: State): void {
    if (!this.config.moments.has("past-appetite") || e.usd <= 0) return;
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

  private subjectOf(e: Event, state: State): { scope: string; actor: string | null; commit: string | null } | null {
    const by = state.actors.has(e.by) ? e.by : null;
    switch (e.type) {
      case "finding_raised":
        return { scope: e.finding.scope, actor: e.finding.raisedBy, commit: null };
      case "plan_amended":
      case "brief_amended":
        return { scope: e.scope, actor: by, commit: null };
      case "evidence_recorded":
        return { scope: e.evidence.scope, actor: null, commit: e.evidence.subject };
      case "claim_made":
        return { scope: e.claim.scope, actor: e.claim.by, commit: e.claim.commit };
      default:
        return null;
    }
  }
}

/** What the plugin already settled of these names, for one agent: in its brief and plans, the base, or its own code. */
export type Settled = (project: string, actor: string, names: readonly string[]) => Promise<ReadonlySet<string>>;

/** The lines a diff adds, or the whole text when it is not a diff. */
function added(text: string): string {
  const lines = text.split("\n");
  if (!lines.some((l) => l.startsWith("@@") || l.startsWith("+++"))) return text;
  return lines
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
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

/** The answer read as a probability of the outcome that matters, and the label chosen. */
function read(name: string, spec: QuestionSpec, a: Answer, model: string): Asked {
  if (a.type === "noul") return { name, spec, p: a.noul, label: null, model };
  // A choice is weighed on the label that means trouble: for these questions, the first label listed.
  const first = Object.keys(spec.labels ?? {})[0] ?? a.choice;
  return { name, spec, p: a.probabilities[first] ?? 0, label: a.choice, model };
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

function matches(spec: QuestionSpec, e: Event): boolean {
  const when = spec.when;
  if (!when) return true;
  if (e.type === "evidence_recorded") {
    if (when.result === "failed" && e.evidence.ok) return false;
    if (when.cause === "unknown" && e.evidence.steps.some((s) => s.cause === "environment")) return false;
    return e.evidence.kind === "check";
  }
  if ((e.type === "brief_issued" || e.type === "brief_amended") && typeof when.kind === "string")
    return e.brief.kind === when.kind;
  return true;
}

type Context = { event: Event | null; state: State; item: string | null; actor: string | null };

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

function valueOf(path: string, { event, state, item, actor }: Context): string | null {
  const root = state.scopes.get(ROOT);
  switch (path) {
    case "item":
      return item;
    case "plan.goal":
      return root?.plan?.goal.text ?? null;
    case "plan.appetite": {
      const a = root?.plan?.appetite;
      return a ? `${a.line.text}${a.usd !== null ? ` ($${a.usd})` : ""}` : null;
    }
    case "scope.brief.goal": {
      const scope = actor ? state.scopes.get(state.actors.get(actor)?.scope ?? "") : undefined;
      return scope?.brief?.goal.text ?? null;
    }
    case "step.logTail":
      return event?.type === "evidence_recorded" ? event.evidence.summary : null;
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
    default:
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
