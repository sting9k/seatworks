import { type Command, type CommandBody, type CommandType, FACTS, HUMAN_COMMANDS } from "../contracts/commands.ts";
import type { EventBody } from "../contracts/events.ts";
import type { Profile } from "../contracts/profile.ts";
import { Context, type Refusal, isRefusal, refuse } from "./decide/context.ts";
import * as findings from "./decide/findings.ts";
import * as host from "./decide/host.ts";
import * as scopes from "./decide/scopes.ts";
import * as talk from "./decide/talk.ts";
import * as watch from "./decide/watch.ts";
import * as work from "./decide/work.ts";
import { evolveAll } from "./evolve.ts";
import { checkState } from "./invariants.ts";
import type { State } from "./state.ts";

export type Decision =
  { readonly ok: true; readonly events: readonly EventBody[] } | { readonly ok: false; readonly refused: Refusal };

type Handler = (ctx: Context) => Refusal | undefined;
type Handlers = { [T in CommandType]: (ctx: Context<Extract<CommandBody, { type: T }>>) => Refusal | undefined };

const HANDLERS: Handlers = {
  open_project: scopes.openProject,
  open_scope: scopes.openChild,
  amend_brief: scopes.amendBrief,
  set_plan: scopes.setPlan,
  amend_plan: scopes.amendPlan,
  add_edge: scopes.edge,
  remove_edge: scopes.edge,
  handover: scopes.handover,
  hold_scope: scopes.hold,
  resume_scope: scopes.hold,
  drop_scope: scopes.dropScope,
  release: scopes.release,
  reseat: scopes.reseat,
  report: scopes.report,
  raise_finding: findings.raiseFinding,
  reopen_finding: findings.reopenFinding,
  classify_finding: findings.classifyFinding,
  withdraw_finding: findings.withdrawFinding,
  ask_human: findings.askHuman,
  answer_question: findings.answerQuestion,
  send_message: talk.sendMessage,
  answer: talk.answer,
  hand_back: work.handBack,
  record_verdict: work.recordVerdict,
  run_checks: work.runChecks,
  integrate: work.integrate,
  send_back: work.sendBack,
  set_checks: work.setChecks,
  publish: work.publish,
  hold_machine: host.holdMachine,
  answer_permission: host.answerPermission,
  acknowledge: watch.settle,
  mark_noise: watch.settle,
  attend: watch.attend,
  pass: watch.pass,
  record_workspace: work.workspaceFact,
  record_agent: host.agentFact,
  record_turn: host.turnFact,
  record_gone: host.goneFact,
  record_delivery: talk.delivery,
  record_candidate: work.candidateFact,
  record_evidence: work.evidenceFact,
  record_integration: work.integrationFact,
  record_publish: work.publishFact,
  record_permission: host.permissionFact,
  record_permission_settled: host.permissionSettledFact,
  record_human_words: talk.humanWords,
  record_observation: watch.observation,
};

/** Commands that settle an attention their own way, so they do not count as acting on it. */
const SETTLES_ITSELF: ReadonlySet<CommandType> = new Set(["acknowledge", "mark_noise", "attend", "pass"]);

/** The kernel: a command against the state gives events or one refusal (CORE.md). Pure: no I/O, clock or random id. */
export function decide(command: Command, state: State, profile: Profile): Decision {
  const denied = mayCall(command, state, profile);
  if (denied) return { ok: false, refused: denied };
  if (state.project === null && command.body.type !== "open_project")
    return { ok: false, refused: refuse("state", "the project is not open") };
  const ctx = new Context(state, profile, command);
  const handler = HANDLERS[command.body.type] as Handler;
  const refused = handler(ctx);
  if (refused) return { ok: false, refused };
  if (command.caller.kind === "agent") {
    closeCarriedDirections(ctx);
    if (!SETTLES_ITSELF.has(command.body.type)) actOnAttentions(ctx);
  }
  const broken = checkState(evolveAll(state, ctx.events));
  if (broken) return { ok: false, refused: broken };
  return { ok: true, events: ctx.events };
}

/** Whether the caller may send this command at all: its role's tools, the Human's list, or the bridge's facts. */
function mayCall(command: Command, state: State, profile: Profile): Refusal | null {
  const type = command.body.type;
  const caller = command.caller;
  if (caller.kind === "bridge") return FACTS.has(type) ? null : refuse("authority", `the bridge does not send ${type}`);
  if (FACTS.has(type)) return refuse("authority", `${type} is a fact only the bridge records`);
  if (caller.kind === "human")
    return HUMAN_COMMANDS.has(type) ? null : refuse("authority", `the Human does not send ${type}`);
  const actor = state.actors.get(caller.actor);
  if (!actor || actor.status !== "seated") return refuse("authority", `${caller.actor} is not seated`);
  const role = profile.roles.get(actor.role);
  if (!role?.tools.has(type)) return refuse("authority", `a ${actor.role} is not given ${type}`);
  return null;
}

/** A change that cites a message that directed its author carries that direction in (I7). */
function closeCarriedDirections(ctx: Context): void {
  const cited = new Set<string>();
  for (const e of ctx.events) {
    const lines =
      e.type === "brief_amended"
        ? [e.brief.goal, ...e.brief.constraints, ...e.brief.choices, ...e.brief.context]
        : e.type === "plan_amended"
          ? [
              e.plan.goal,
              ...e.plan.limits,
              ...e.plan.unknowns.map((u) => u.line),
              e.plan.appetite.line,
              ...e.plan.terms.map((t) => t.line),
            ]
          : [];
    for (const l of lines)
      if (l.via?.kind === "message" && l.at === ctx.at) cited.add(ctx.state.messages.get(l.via.id)?.copyOf ?? l.via.id);
  }
  for (const o of ctx.state.obligations.values())
    if (o.about.kind === "direction" && cited.has(o.about.id) && o.owedBy === ctx.party)
      ctx.emit({ type: "obligation_closed", obligation: o.id, how: "carried in" });
}

/** Any command of the reader's that names the watched actor or its scope acts on an attention it was sent (KERNEL.md §4.9). */
function actOnAttentions(ctx: Context): void {
  const named = namedIn(ctx.command.body);
  if (named.size === 0) return;
  for (const t of ctx.state.attentions.values())
    if (t.to === ctx.party && t.delivered !== null && (named.has(t.about.actor) || named.has(t.about.scope)))
      ctx.emit({ type: "attention_acted", attention: t.id, by: ctx.party });
}

const NAMING_KEYS = ["scope", "parent", "to", "actor", "from", "about", "target"] as const;

function namedIn(body: CommandBody): Set<string> {
  const found = new Set<string>();
  const record = body as Record<string, unknown>;
  for (const key of NAMING_KEYS) {
    const value = record[key];
    if (typeof value === "string") found.add(value);
  }
  return found;
}

export { isRefusal };
