import type { CommandBody } from "../../contracts/commands.ts";
import { type ActorId, childScopeId, HUMAN, ROOT } from "../../contracts/ids.ts";
import type { Brief, Line, Plan, Scope, ScopeKind } from "../../contracts/ledger.ts";
import { within } from "../paths.ts";
import { descendants, ownerOfParent } from "../authority.ts";
import { type Context, type Refusal, isRefusal, refuse } from "./context.ts";
import { briefFrom, humanWordFor, lineFrom, planFrom } from "./lines.ts";
import { carriedFinding, closeAskedPermissions, releaseSeat } from "./seats.ts";

type Of<T extends CommandBody["type"]> = Context<Extract<CommandBody, { type: T }>>;

function openScope(ctx: Context, id: string): Scope | Refusal {
  const scope = ctx.state.scopes.get(id);
  if (!scope) return refuse("unknown", `no scope ${id}`);
  if (scope.status !== "open") return refuse("state", `scope ${id} is ${scope.status}`);
  return scope;
}

/** The caller is the owner of the scope's parent: the Human for the root. */
function asParentOwner(ctx: Context, scope: Scope, invariant: Refusal["invariant"] = "authority"): Refusal | null {
  const owner = ownerOfParent(ctx.state, scope);
  return owner === ctx.party
    ? null
    : refuse(invariant, `only the owner of scope ${scope.id}'s parent (${owner ?? "none"}) may do this`);
}

export function openProject(ctx: Of<"open_project">): Refusal | undefined {
  if (ctx.state.project) return refuse("state", "the project is open already");
  const root = ctx.profile.root;
  const actor = ctx.next("actor");
  const scope: Scope = {
    ...blankScope(ROOT, null, root.name, "work"),
    owner: actor,
    paths: [""],
    branch: ctx.body.base,
    workspace: "pending",
  };
  ctx.emit(
    {
      type: "project_opened",
      base: ctx.body.base,
      remote: ctx.body.remote,
      profile: ctx.body.profile,
      profileHash: ctx.body.profileHash,
    },
    { type: "scope_opened", scope },
    { type: "actor_seated", actor, role: root.name, scope: ROOT, model: ctx.body.model },
  );
  return undefined;
}

/** The project took its profile's files anew; the hash it already runs is nothing to record. */
export function profileFact(ctx: Of<"record_profile">): Refusal | undefined {
  if (ctx.state.project?.profileHash !== ctx.body.profileHash)
    ctx.emit({ type: "profile_taken", profileHash: ctx.body.profileHash });
  return undefined;
}

export function openChild(ctx: Of<"open_scope">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  const { body } = ctx;
  const parent = openScope(ctx, body.parent);
  if (isRefusal(parent)) return parent;
  if (parent.owner !== me.actor.id) return refuse("authority", `you do not own scope ${parent.id}`);
  if (parent.held) return refuse("state", `scope ${parent.id} is held: nothing new is seated in it`);
  if (!me.role.delegates || !me.role.spawns.has(body.role))
    return refuse("authority", `a ${me.actor.role} does not seat a ${body.role}`);
  const role = ctx.profile.roles.get(body.role);
  if (!role) return refuse("unknown", `no role ${body.role}`);
  const kind: ScopeKind = role.reading ? "reading" : role.watches ? "watch" : "work";

  if (kind === "reading" && body.commit === null) return refuse("state", "a reading scope names the commit it reads");
  if (kind !== "work" && body.paths.length > 0) return refuse("I5", "a scope that does not write holds no paths");
  if (kind === "work" && body.paths.length === 0) return refuse("state", "a scope that works names the paths it holds");
  const outside = within(body.paths, parent.paths);
  if (kind === "work" && outside !== null) return refuse("I3", `${outside} is outside scope ${parent.id}'s paths`);
  if (kind !== "watch" && body.brief === null) return refuse("state", "a scope is opened with its brief");
  for (const sibling of body.after) {
    const s = ctx.state.scopes.get(sibling);
    if (!s || s.parent !== parent.id || s.status !== "open")
      return refuse("I3", `${sibling} is not an open sibling to wait for`);
  }
  if (body.over !== "all")
    for (const watched of body.over)
      if (!ctx.state.scopes.has(watched)) return refuse("unknown", `no scope ${watched}`);
  const model = body.model ?? role.models[0];
  if (model === undefined) return refuse("state", `role ${role.name} names no model and none was given`);

  const actor = ctx.next("actor");
  const scope: Scope = {
    ...blankScope(childScopeId(parent.id, parent.children + 1), parent.id, role.name, kind),
    owner: actor,
    writes: role.writes,
    writer: role.writes ? actor : null,
    paths: body.paths,
    after: body.after,
    commit: body.commit,
    over: kind === "watch" ? body.over : [],
    workspace: kind === "watch" ? "none" : "pending",
  };
  ctx.emit({ type: "scope_opened", scope }, { type: "actor_seated", actor, role: role.name, scope: scope.id, model });
  if (body.brief !== null) ctx.emit({ type: "brief_issued", scope: scope.id, brief: briefFrom(ctx, body.brief, 1) });
  return undefined;
}

export function amendBrief(ctx: Of<"amend_brief">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  const denied = asParentOwner(ctx, scope, "I5");
  if (denied) return denied;
  if (!scope.brief) return refuse("state", `scope ${scope.id} has no brief to amend`);
  const carried = carriedFinding(ctx, ctx.body.carries);
  if (isRefusal(carried)) return carried;
  const { set } = ctx.body;
  const old = scope.brief;
  const touched: Line[] = [];
  const replace = (key: "constraints" | "choices" | "context", next: readonly { text: string }[] | undefined) => {
    if (next === undefined) return old[key];
    touched.push(...old[key]);
    return next.map((l) => lineFrom(ctx, l));
  };
  if (set.goal) touched.push(old.goal);
  const brief: Brief = {
    version: old.version + 1,
    goal: set.goal ? lineFrom(ctx, set.goal) : old.goal,
    constraints: replace("constraints", set.constraints),
    choices: replace("choices", set.choices),
    context: replace("context", set.context),
    kind: set.kind ?? old.kind,
  };
  const word = humanWordFor(ctx, touched, false, ctx.body.cites);
  if (word) return word;
  ctx.emit({ type: "brief_amended", scope: scope.id, brief, reason: ctx.body.reason, carries: ctx.body.carries });
  return undefined;
}

export function setPlan(ctx: Of<"set_plan">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (scope.owner !== ctx.party) return refuse("I5", `only scope ${scope.id}'s owner sets its plan`);
  if (scope.plan) return refuse("state", `scope ${scope.id} has a plan: amend it`);
  const role = ctx.profile.roles.get(scope.role);
  if (!role?.delegates) return refuse("state", "a plan belongs to a scope that delegates");
  ctx.emit({ type: "plan_set", scope: scope.id, plan: planFrom(ctx, ctx.body.plan) });
  return undefined;
}

export function amendPlan(ctx: Of<"amend_plan">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (scope.owner !== ctx.party && ctx.party !== HUMAN)
    return refuse("I5", `only scope ${scope.id}'s owner amends its plan`);
  if (!scope.plan) return refuse("state", `scope ${scope.id} has no plan: set it first`);
  const carried = carriedFinding(ctx, ctx.body.carries);
  if (isRefusal(carried)) return carried;
  const old = scope.plan;
  const { body } = ctx;
  const removed: Line[] = [];
  for (const id of body.remove) {
    const line = [...old.limits, ...old.unknowns.map((u) => u.line), ...old.terms.map((t) => t.line)].find(
      (l) => l.id === id,
    );
    if (!line) return refuse("unknown", `no limit, unknown or term ${id} in scope ${scope.id}'s plan`);
    removed.push(line);
  }
  const added = body.add.filter((a) => a.section === "terms");
  // A term settled again under the same word replaces the old one, which is a change to its line.
  const renamed = new Set(added.map((a) => a.term));
  for (const t of old.terms) if (renamed.has(t.name) && !removed.includes(t.line)) removed.push(t.line);
  const gone = new Set(removed.map((l) => l.id));
  const touched = [...removed, ...(body.goal ? [old.goal] : []), ...(body.appetite ? [old.appetite.line] : [])];
  const approved = body.goal !== undefined || body.appetite !== undefined;
  const word = humanWordFor(ctx, touched, approved, body.cites);
  if (word) return word;
  const plan: Plan = {
    goal: body.goal ? lineFrom(ctx, body.goal) : old.goal,
    limits: [
      ...old.limits.filter((l) => !gone.has(l.id)),
      ...body.add.filter((a) => a.section === "limits").map((a) => lineFrom(ctx, a)),
    ],
    unknowns: [
      ...old.unknowns.filter((u) => !gone.has(u.line.id)),
      ...body.add
        .filter((a) => a.section === "unknowns")
        .map((a) => ({ line: lineFrom(ctx, a), check: a.check ?? "" })),
    ],
    appetite: body.appetite
      ? { line: lineFrom(ctx, body.appetite.line), usd: body.appetite.usd, hours: body.appetite.hours }
      : old.appetite,
    terms: [
      ...old.terms.filter((t) => !gone.has(t.line.id)),
      ...added.map((a) => ({ name: a.term ?? "", line: lineFrom(ctx, a), avoid: a.avoid })),
    ],
  };
  ctx.emit({ type: "plan_amended", scope: scope.id, plan, reason: body.reason, carries: body.carries });
  return undefined;
}

export function edge(ctx: Of<"add_edge"> | Of<"remove_edge">): Refusal | undefined {
  const { body } = ctx;
  const scope = openScope(ctx, body.scope);
  if (isRefusal(scope)) return scope;
  const target = ctx.state.scopes.get(body.target);
  if (!target) return refuse("unknown", `no scope ${body.target}`);
  if (body.edge === "after") {
    const denied = asParentOwner(ctx, scope);
    if (denied) return denied;
    if (target.parent !== scope.parent || target.id === scope.id)
      return refuse("I3", "a scope waits only for a sibling");
  } else if (scope.owner !== ctx.party)
    return refuse("authority", `only scope ${scope.id}'s owner changes its ${body.edge}`);
  const has = scope[body.edge].includes(target.id);
  if (body.type === "add_edge" && has) return refuse("state", `scope ${scope.id} already has that edge`);
  if (body.type === "remove_edge" && !has) return refuse("state", `scope ${scope.id} has no such edge`);
  const carried = carriedFinding(ctx, body.carries);
  if (isRefusal(carried)) return carried;
  ctx.emit({
    type: body.type === "add_edge" ? "edge_added" : "edge_removed",
    scope: scope.id,
    edge: body.edge,
    target: target.id,
    reason: body.reason,
    carries: body.carries,
  });
  return undefined;
}

export function handover(ctx: Of<"handover">): Refusal | undefined {
  const { body } = ctx;
  const from = openScope(ctx, body.from);
  if (isRefusal(from)) return from;
  const to = openScope(ctx, body.to);
  if (isRefusal(to)) return to;
  if (from.parent !== to.parent || from.id === to.id) return refuse("I1", "paths move only between siblings");
  const denied = asParentOwner(ctx, from, "I5");
  if (denied) return denied;
  if (to.kind !== "work") return refuse("I5", `scope ${to.id} does not write`);
  for (const p of body.paths)
    if (!from.paths.includes(p)) return refuse("state", `scope ${from.id} does not hold ${p} as one of its paths`);
  const carried = carriedFinding(ctx, body.carries);
  if (isRefusal(carried)) return carried;
  ctx.emit({
    type: "handed_over",
    from: from.id,
    to: to.id,
    paths: body.paths,
    reason: body.reason,
    carries: body.carries,
  });
  return undefined;
}

export function hold(ctx: Of<"hold_scope"> | Of<"resume_scope">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (ctx.party !== HUMAN) {
    const denied = asParentOwner(ctx, scope);
    if (denied) return denied;
  }
  const holding = ctx.body.type === "hold_scope";
  if (scope.held === holding) return refuse("state", `scope ${scope.id} is ${holding ? "held" : "not held"} already`);
  ctx.emit({ type: holding ? "scope_held" : "scope_resumed", scope: scope.id, reason: ctx.body.reason });
  return undefined;
}

export function dropScope(ctx: Of<"drop_scope">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  if (scope.parent === null) return refuse("state", "the root is never dropped");
  const denied = asParentOwner(ctx, scope);
  if (denied) return denied;
  if (scope.integrating) return refuse("state", `scope ${scope.id} is being integrated`);
  const heir = ctx.party;
  const doomed = [
    ...descendants(ctx.state, scope.id)
      .filter((s) => s.status === "open")
      .reverse(),
    scope,
  ];
  const ids = new Set(doomed.map((s) => s.id));
  for (const o of ctx.state.obligations.values()) {
    const about = scopeOf(ctx, o.about);
    if (about !== null && ids.has(about))
      ctx.emit({ type: "obligation_closed", obligation: o.id, how: `scope ${about} dropped` });
  }
  for (const s of doomed) {
    if (s.owner !== null && ctx.state.actors.get(s.owner)?.status === "seated")
      releaseSeat(ctx, s.owner, heir, ids, `scope ${s.id} dropped`);
    ctx.emit({ type: "scope_dropped", scope: s.id, reason: ctx.body.reason });
  }
  return undefined;
}

/** The scope a finding or claim an obligation is about lives in; null for anything else. */
function scopeOf(ctx: Context, about: { kind: string; id: string }): string | null {
  if (about.kind === "finding") return ctx.state.findings.get(about.id)?.scope ?? null;
  if (about.kind === "claim") return ctx.state.claims.get(about.id)?.scope ?? null;
  return null;
}

export function release(ctx: Of<"release">): Refusal | undefined {
  const actor = ctx.state.actors.get(ctx.body.actor);
  if (!actor || actor.status !== "seated") return refuse("unknown", `${ctx.body.actor} is not seated`);
  const scope = ctx.state.scopes.get(actor.scope);
  if (!scope) return refuse("unknown", `no scope ${actor.scope}`);
  const denied = asParentOwner(ctx, scope);
  if (denied) return denied;
  releaseSeat(ctx, actor.id, ctx.party, new Set(), ctx.body.reason);
  return undefined;
}

export function reseat(ctx: Of<"reseat">): Refusal | undefined {
  const scope = openScope(ctx, ctx.body.scope);
  if (isRefusal(scope)) return scope;
  const denied = asParentOwner(ctx, scope);
  if (denied) return denied;
  if (scope.held) return refuse("state", `scope ${scope.id} is held: nothing new is seated in it`);
  const old: ActorId | null = scope.owner;
  const before = old === null ? undefined : ctx.state.actors.get(old);
  const role = ctx.profile.roles.get(scope.role);
  const model = ctx.body.model ?? before?.model ?? role?.models[0];
  if (model === undefined) return refuse("state", `role ${scope.role} names no model and none was given`);
  const actor = ctx.next("actor");
  ctx.emit(
    { type: "reseated", scope: scope.id, from: old, to: actor, reason: ctx.body.reason },
    { type: "actor_seated", actor, role: scope.role, scope: scope.id, model },
  );
  if (old !== null) closeAskedPermissions(ctx, old);
  for (const o of ctx.state.obligations.values())
    if (old !== null && o.owedBy === old) ctx.emit({ type: "obligation_moved", obligation: o.id, to: actor });
  for (const m of ctx.state.messages.values())
    if (old !== null && m.to === old && m.delivered === null)
      ctx.emit({ type: "message_moved", message: m.id, from: old, to: actor });
  return undefined;
}

export function report(ctx: Of<"report">): Refusal | undefined {
  const me = ctx.agent();
  if (isRefusal(me)) return me;
  const lines = (texts: readonly string[]) => texts.map((text) => ctx.line(text));
  ctx.emit({
    type: "report_made",
    scope: me.actor.scope,
    decided: lines(ctx.body.decided),
    assumed: lines(ctx.body.assumed),
    open: lines(ctx.body.open),
  });
  return undefined;
}

function blankScope(id: string, parent: string | null, role: string, kind: ScopeKind): Scope {
  return {
    id,
    parent,
    role,
    kind,
    owner: null,
    writes: false,
    writer: null,
    paths: [],
    after: [],
    mayChange: [],
    mustTell: [],
    commit: null,
    over: [],
    brief: null,
    plan: null,
    branch: null,
    head: null,
    workspace: "none",
    status: "open",
    held: false,
    claim: null,
    candidate: null,
    integrating: false,
    children: 0,
    spent: { usd: 0, tokens: 0 },
  };
}
