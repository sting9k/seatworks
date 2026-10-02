import type { Effect, EffectBody } from "../contracts/effects.ts";
import type { Event } from "../contracts/events.ts";
import { BRIDGE, HUMAN, type Party, ROOT } from "../contracts/ids.ts";
import { ownerAbove, ownerOfParent } from "./authority.ts";
import type { State } from "./state.ts";

/** The effects an event asks for, each keyed by the event, from the state after it (CORE.md). */
export function react(e: Event, s: State): readonly Effect[] {
  const out: Effect[] = [];
  const add = (name: string, body: EffectBody) => out.push({ key: `${e.seq}:${name}`, body });
  // Keyed by its reader too: one event may tell several, and the outbox keeps one row a key.
  const tell = (to: Party | null, name: string, text: string, asks = false) => {
    if (to !== null && to !== HUMAN && s.actors.get(to)?.status === "seated")
      add(`${name}:${to}`, { kind: "deliver", to, item: { kind: "note", text, asks } });
  };
  const parentOwner = (scope: string) => {
    const x = s.scopes.get(scope);
    return x ? ownerOfParent(s, x) : null;
  };
  // A `mustTell` edge is a duty the kernel carries out: whoever it names is told what changed in the scope.
  const mustTell = (scope: string, what: string) => {
    for (const target of s.scopes.get(scope)?.mustTell ?? [])
      tell(
        s.scopes.get(target)?.owner ?? null,
        `told:${target}`,
        `Scope ${scope} must tell scope ${target}: ${what}`,
        true,
      );
  };

  switch (e.type) {
    case "scope_opened":
      if (e.scope.kind !== "watch" && !waits(s, e.scope.after))
        add("workspace", { kind: "workspace.create", scope: e.scope.id });
      break;
    case "actor_seated": {
      const scope = s.scopes.get(e.scope);
      if (scope?.workspace === "none" || scope?.workspace === "ready")
        add("agent", { kind: "agent.create", actor: e.actor });
      break;
    }
    case "workspace_ready": {
      const owner = s.scopes.get(e.scope)?.owner;
      if (owner != null && s.actors.get(owner)?.host === null) add("agent", { kind: "agent.create", actor: owner });
      break;
    }
    case "workspace_failed":
      tell(parentOwner(e.scope), "note", `The copy for scope ${e.scope} could not be made: ${e.why}`, true);
      break;
    case "reseated": {
      if (e.from !== null)
        add("archive", { kind: "agent.archive", actor: e.from, host: s.actors.get(e.from)?.host ?? null });
      // Asked for again where it had failed; where one is already on its way, the second finds it made.
      const x = s.scopes.get(e.scope);
      if (x?.workspace === "pending" && !waits(s, x.after)) add("workspace", { kind: "workspace.create", scope: x.id });
      // The attentions the one who left was sent are now the new actor's, undelivered.
      for (const t of s.attentions.values())
        if (t.to === e.to) add(`deliver:${t.id}`, { kind: "deliver", to: e.to, item: { kind: "attention", id: t.id } });
      break;
    }
    case "actor_released":
      add("archive", { kind: "agent.archive", actor: e.actor, host: s.actors.get(e.actor)?.host ?? null });
      break;
    case "brief_amended": {
      tellBrief(s, e.scope, add);
      const version = s.scopes.get(e.scope)?.brief?.version ?? 0;
      mustTell(e.scope, `its brief is now version ${version} (${e.reason})`);
      // Amended by leave, not by the owner above: that owner takes the scope's work in, and reads what changed.
      const above = parentOwner(e.scope);
      const from = s.actors.get(e.by)?.scope;
      if (above !== e.by && from !== undefined)
        tell(
          above,
          "amended",
          `Scope ${e.scope}'s brief is now version ${version}, amended by ${e.by} from scope ${from}, which may change it: ${e.reason}`,
          true,
        );
      break;
    }
    case "edge_removed": {
      // A scope that waited only for this sibling starts now: no other event would start it.
      const x = s.scopes.get(e.scope);
      if (e.edge === "after" && x?.status === "open" && x.workspace === "pending" && !waits(s, x.after))
        add("workspace", { kind: "workspace.create", scope: x.id });
      break;
    }
    case "handed_over": {
      // Both writers work to the paths they hold: the one that gained some and the one that lost them.
      const text = `${e.paths.join(", ")} moved from scope ${e.from} to scope ${e.to}: ${e.reason}`;
      for (const scope of [e.from, e.to]) tell(s.scopes.get(scope)?.owner ?? null, "note", text, true);
      break;
    }
    case "scope_held":
    case "scope_resumed":
      tell(
        s.scopes.get(e.scope)?.owner ?? null,
        "note",
        e.type === "scope_held"
          ? `Scope ${e.scope} is held: ${e.reason}. Nothing new is seated in it or integrated from it until it is resumed.`
          : `Scope ${e.scope} is no longer held: ${e.reason}`,
        true,
      );
      break;
    case "message_sent": {
      const m = e.message;
      if (m.queued && m.to !== HUMAN)
        add(`deliver:${m.id}`, { kind: "deliver", to: m.to, item: { kind: "message", id: m.id } });
      break;
    }
    case "message_moved":
      if (e.to !== HUMAN)
        add(`deliver:${e.message}`, { kind: "deliver", to: e.to, item: { kind: "message", id: e.message } });
      break;
    case "attention_opened":
      if (e.attention.to !== HUMAN)
        add(`deliver:${e.attention.id}`, {
          kind: "deliver",
          to: e.attention.to,
          item: { kind: "attention", id: e.attention.id },
        });
      break;
    case "attention_climbed":
      if (e.to.to !== HUMAN)
        add(`deliver:${e.to.id}`, { kind: "deliver", to: e.to.to, item: { kind: "attention", id: e.to.id } });
      break;
    case "obligation_opened": {
      const o = e.obligation;
      if (o.about.kind === "candidate" && o.owedBy !== HUMAN)
        tell(
          o.owedBy,
          "candidate",
          `CANDIDATE ${o.about.id} · ${o.summary ?? ""}\n\`attend\` or \`pass\` it with candidate ${o.about.id}.`,
          true,
        );
      break;
    }
    case "finding_raised":
    case "finding_reopened": {
      const f = s.findings.get(e.type === "finding_raised" ? e.finding.id : e.finding);
      if (!f) break;
      const said =
        e.type === "finding_raised"
          ? `Finding ${f.id} from ${f.raisedBy}: ${f.text}`
          : `Finding ${f.id} from ${f.raisedBy} is reopened: ${e.text}\nNew evidence: ${e.evidence.join(", ")}\nIt said: ${f.text}`;
      tell(s.scopes.get(f.answeredBy)?.owner ?? null, "note", `${said}\nMeanwhile: ${f.default}`, true);
      break;
    }
    case "finding_withdrawn": {
      // Whoever was woken to answer it owes it nothing now.
      const f = s.findings.get(e.finding);
      if (f)
        tell(
          s.scopes.get(f.answeredBy)?.owner ?? null,
          "note",
          `Finding ${f.id} was withdrawn by ${f.raisedBy}: ${e.reason}`,
        );
      break;
    }
    case "finding_classified": {
      const f = s.findings.get(e.finding);
      if (f) tell(f.raisedBy, "note", `Finding ${f.id} was classified ${e.verdict}: ${e.reason}`, true);
      break;
    }
    case "question_answered":
      tell(e.asker, "note", `The Human answered question ${e.question}: ${e.text}`, true);
      break;
    case "claim_made": {
      add("candidate", { kind: "workspace.candidate", scope: e.claim.scope, commit: e.claim.commit });
      mustTell(e.claim.scope, `it handed back ${e.claim.commit}: ${e.claim.text}`);
      // What will keep it from being taken in is said with it: a scope still open under it, and whether a result is on
      // its way, or whoever takes it in is refused, or runs the same checks again while they run.
      const open = [...s.scopes.values()].filter((c) => c.parent === e.claim.scope && c.status === "open");
      const under = open.length > 0 ? `\nStill open under it: ${open.map((c) => c.id).join(", ")}.` : "";
      const checks =
        (s.project?.checks ?? []).length > 0
          ? "The project's checks run on its candidate now, and you are told their result."
          : "No check is set for the project: nothing is run on it.";
      tell(
        parentOwner(e.claim.scope),
        "note",
        `Scope ${e.claim.scope} handed back ${e.claim.commit}: ${e.claim.text}${under}\n${checks}`,
        true,
      );
      break;
    }
    case "candidate_ready": {
      // With no check set nothing would run, and a run of nothing is not evidence to integrate on (I4).
      const checks = s.project?.checks ?? [];
      if (checks.length > 0)
        add("evidence", { kind: "evidence.run", scope: e.scope, subject: e.candidate, steps: checks, by: null });
      break;
    }
    case "candidate_conflict": {
      const text = `Scope ${e.scope}'s ${e.commit} conflicts with its parent in: ${e.paths.join(", ")}. Merge the parent into your branch and hand back again.`;
      tell(s.scopes.get(e.scope)?.writer ?? null, "note", text, true);
      tell(parentOwner(e.scope), "note", `Scope ${e.scope} conflicts with its parent in: ${e.paths.join(", ")}.`);
      break;
    }
    case "evidence_requested":
      add("evidence", { kind: "evidence.run", scope: e.scope, subject: e.subject, steps: e.steps, by: e.by });
      break;
    case "evidence_recorded": {
      const x = e.evidence;
      if (x.kind === "check") {
        // Which checks ran is said by name: a writer's own, asked with `run_checks`, are not the project's.
        const ran = x.steps.length > 0 ? ` (${x.steps.map((step) => step.name).join(", ")})` : "";
        // Whose they were is said too: the project's own, run on a hand-back, or those someone asked for.
        const whose = x.by === BRIDGE ? "The project's checks" : `Checks ${x.by} asked for`;
        const text = `${whose} on ${x.subject} for scope ${x.scope}${ran}: ${x.ok ? "passed" : "failed"} (evidence ${x.id}). ${x.summary}`;
        for (const to of e.wake) tell(to, "note", text, true);
        const owner = parentOwner(x.scope);
        if (owner === null || !e.wake.includes(owner)) tell(owner, "note", text);
      }
      // A verdict is returned to whoever seated its reader, who is the one to weigh it.
      if (x.kind === "verdict")
        tell(
          parentOwner(x.scope),
          "note",
          `Verdict on ${x.subject} from scope ${x.scope}: ${x.ok ? "it stands" : "it does not stand"} (${x.id}). ${x.summary}`,
          true,
        );
      break;
    }
    case "report_made": {
      const sections = e.sections.map((s) => `${s.name}:\n${s.lines.map((l) => `- ${l.text}`).join("\n")}`);
      tell(parentOwner(e.scope), "note", [`Report from scope ${e.scope}.`, ...sections].join("\n"), true);
      break;
    }
    case "sent_back":
      tell(
        s.scopes.get(e.scope)?.writer ?? s.scopes.get(e.scope)?.owner ?? null,
        "note",
        `Your hand-back was sent back: ${e.reason}`,
        true,
      );
      break;
    case "published":
    case "publish_refused":
      // Whether a landing reached the remote is the root's owner's to know now: a publish answers only that it was asked.
      tell(
        s.scopes.get(ROOT)?.owner ?? null,
        "note",
        e.type === "published"
          ? `Published ${e.branch} to ${e.remote} at ${e.sha}${e.asked === e.sha ? "" : `: ${e.asked} with the ledger's own commits over it`}.`
          : `Publishing ${e.branch} to ${e.remote} was refused: ${e.why}`,
        true,
      );
      break;
    case "integration_started":
      add("advance", { kind: "workspace.advance", scope: e.scope, from: e.parentHead, to: e.candidate });
      break;
    case "integration_refused": {
      const x = s.scopes.get(e.scope);
      const commit = x?.claim ? s.claims.get(x.claim)?.commit : undefined;
      // Whoever asked is waiting on it: with no word, a scope that is still not in would look integrated to them.
      let said = e.why;
      if (e.why === "moved" && commit !== undefined) {
        add("candidate", { kind: "workspace.candidate", scope: e.scope, commit });
        said = "its parent's branch moved after its candidate was made. A candidate on the new head is being made";
      } else if (x?.candidate) said = `${e.why}. Its candidate ${x.candidate.candidate} stands`;
      tell(parentOwner(e.scope), "note", `Scope ${e.scope} was not integrated: ${said}.`, true);
      break;
    }
    case "integrated":
    case "scope_dropped": {
      mustTell(e.scope, e.type === "integrated" ? `it was integrated at ${e.sha}` : `it was dropped: ${e.reason}`);
      const scope = s.scopes.get(e.scope);
      const parent = scope?.parent == null ? undefined : s.scopes.get(scope.parent);
      // Whoever asked for the integration waits on it: `integrate` answered only that it had started.
      if (e.type === "integrated")
        tell(
          parentOwner(e.scope),
          "note",
          `Scope ${e.scope} is integrated: ${parent?.branch ?? "its parent"} is at ${e.sha}.`,
          true,
        );
      add("remove", {
        kind: "workspace.remove",
        scope: e.scope,
        branch: scope?.branch ?? null,
        mergedInto: e.type === "integrated" ? (parent?.branch ?? null) : null,
      });
      if (e.type === "integrated" && scope?.parent === ROOT) add("docs", { kind: "docs.write" });
      // A sibling that waited for this one starts now, from its parent with this scope's work in it (I3).
      for (const x of s.scopes.values())
        if (x.status === "open" && x.workspace === "pending" && x.after.includes(e.scope) && !waits(s, x.after))
          add(`workspace:${x.id}`, { kind: "workspace.create", scope: x.id });
      break;
    }
    case "turn_ended": {
      const a = s.actors.get(e.actor);
      if (a && e.again !== null)
        add("again", { kind: "deliver", to: a.id, item: { kind: "note", text: e.again, asks: true } });
      else if (a && e.outcome === "failed")
        tell(ownerAbove(s, a), "note", `${a.id}'s turn in scope ${a.scope} failed: ${e.why ?? "no reason given"}`);
      break;
    }
    case "actor_gone": {
      const a = s.actors.get(e.actor);
      if (a)
        tell(
          parentOwner(a.scope),
          "note",
          `${a.id} in scope ${a.scope} is gone: ${e.why}. Its seat is empty until you reseat or release it.`,
          true,
        );
      break;
    }
    case "permission_asked": {
      const a = s.actors.get(e.permission.actor);
      if (a)
        tell(
          ownerAbove(s, a),
          "note",
          `${a.id} asks leave (permission ${e.permission.id}): ${e.permission.text}`,
          true,
        );
      break;
    }
    case "permission_answered":
      add("permission", {
        kind: "agent.permission",
        actor: e.actor,
        host: s.actors.get(e.actor)?.host ?? null,
        request: e.request,
        allow: e.allow,
        reason: e.reason,
      });
      break;
    case "permission_settled": {
      const a = s.actors.get(e.actor);
      if (a)
        tell(
          ownerAbove(s, a),
          "note",
          `${a.id}'s permission ${e.permission} was ${e.allow ? "allowed" : "refused"} in its own prompt: nothing is owed.`,
          false,
        );
      break;
    }
    case "machine_held":
    case "machine_released":
      add("machine", { kind: "machine.hold", actor: e.actor, hold: e.type === "machine_held" });
      break;
    case "publish_requested":
      add("publish", { kind: "workspace.publish", remote: e.remote, branch: e.branch, expectedSha: e.sha });
      break;
    case "plan_set":
    case "plan_amended":
      if (e.scope === ROOT) add("docs", { kind: "docs.write" });
      mustTell(e.scope, e.type === "plan_set" ? "its plan is set" : `its plan was amended (${e.reason})`);
      break;
    default:
      break;
  }
  return out;
}

/** Whether any scope in `after` is still open: a scope that waits for one gets no copy and no agent yet. */
function waits(s: State, after: readonly string[]): boolean {
  return after.some((id) => s.scopes.get(id)?.status === "open");
}

/** An amended brief reaches the agent working to it, with what changed. */
function tellBrief(s: State, scope: string, add: (name: string, body: EffectBody) => void): void {
  const owner = s.scopes.get(scope)?.owner;
  const brief = s.scopes.get(scope)?.brief;
  if (owner == null || !brief || s.actors.get(owner)?.status !== "seated") return;
  add("deliver:brief", {
    kind: "deliver",
    to: owner,
    item: { kind: "note", text: `Your brief is now version ${brief.version}. Read it with status.`, asks: true },
  });
}
