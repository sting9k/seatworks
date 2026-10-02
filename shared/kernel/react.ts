import type { Effect, EffectBody } from "../contracts/effects.ts";
import type { Event } from "../contracts/events.ts";
import { HUMAN, type Party, ROOT } from "../contracts/ids.ts";
import { ownerAbove, ownerOfParent } from "./authority.ts";
import type { State } from "./state.ts";

/** The effects an event asks for, each keyed by the event, from the state after it (CORE.md). */
export function react(e: Event, s: State): readonly Effect[] {
  const out: Effect[] = [];
  const add = (name: string, body: EffectBody) => out.push({ key: `${e.seq}:${name}`, body });
  const tell = (to: Party | null, name: string, text: string, asks = false) => {
    if (to !== null && to !== HUMAN && s.actors.get(to)?.status === "seated")
      add(name, { kind: "deliver", to, item: { kind: "note", text, asks } });
  };
  const parentOwner = (scope: string) => {
    const x = s.scopes.get(scope);
    return x ? ownerOfParent(s, x) : null;
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
    case "reseated":
      if (e.from !== null)
        add("archive", { kind: "agent.archive", actor: e.from, host: s.actors.get(e.from)?.host ?? null });
      // The attentions the one who left was sent are now the new actor's, undelivered.
      for (const t of s.attentions.values())
        if (t.to === e.to) add(`deliver:${t.id}`, { kind: "deliver", to: e.to, item: { kind: "attention", id: t.id } });
      break;
    case "actor_released":
      add("archive", { kind: "agent.archive", actor: e.actor, host: s.actors.get(e.actor)?.host ?? null });
      break;
    case "brief_amended":
      tellBrief(s, e.scope, add);
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
      if (f)
        tell(
          s.scopes.get(f.answeredBy)?.owner ?? null,
          "note",
          `Finding ${f.id} from ${f.raisedBy}: ${f.text}\nMeanwhile: ${f.default}`,
          true,
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
    case "claim_made":
      add("candidate", { kind: "workspace.candidate", scope: e.claim.scope, commit: e.claim.commit });
      tell(
        parentOwner(e.claim.scope),
        "note",
        `Scope ${e.claim.scope} handed back ${e.claim.commit}: ${e.claim.text}`,
        true,
      );
      break;
    case "candidate_ready":
      add("evidence", { kind: "evidence.run", scope: e.scope, subject: e.candidate, steps: s.project?.checks ?? [] });
      break;
    case "candidate_conflict": {
      const text = `Scope ${e.scope}'s ${e.commit} conflicts with its parent in: ${e.paths.join(", ")}. Merge the parent into your branch and hand back again.`;
      tell(s.scopes.get(e.scope)?.writer ?? null, "note", text, true);
      tell(parentOwner(e.scope), "note-owner", `Scope ${e.scope} conflicts with its parent in: ${e.paths.join(", ")}.`);
      break;
    }
    case "evidence_requested":
      add("evidence", { kind: "evidence.run", scope: e.scope, subject: e.subject, steps: e.steps });
      break;
    case "evidence_recorded": {
      const x = e.evidence;
      if (x.kind === "check") {
        const text = `Checks on ${x.subject} for scope ${x.scope}: ${x.ok ? "passed" : "failed"}. ${x.summary}`;
        for (const to of e.wake) tell(to, "note", text, true);
        const owner = parentOwner(x.scope);
        if (owner === null || !e.wake.includes(owner)) tell(owner, "note", text);
      }
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
      tell(
        s.scopes.get("root")?.owner ?? null,
        "note",
        e.type === "published"
          ? `Published ${e.branch} to ${e.remote} at ${e.sha}.`
          : `Publishing ${e.branch} to ${e.remote} was refused: ${e.why}`,
      );
      break;
    case "integration_started":
      add("advance", { kind: "workspace.advance", scope: e.scope, from: e.parentHead, to: e.candidate });
      break;
    case "integration_refused": {
      const claim = s.scopes.get(e.scope)?.claim;
      const commit = claim ? s.claims.get(claim)?.commit : undefined;
      if (e.why === "moved" && commit !== undefined)
        add("candidate", { kind: "workspace.candidate", scope: e.scope, commit });
      else tell(parentOwner(e.scope), "note", `Scope ${e.scope} was not integrated: ${e.why}`, true);
      break;
    }
    case "integrated":
    case "scope_dropped": {
      const scope = s.scopes.get(e.scope);
      const parent = scope?.parent == null ? undefined : s.scopes.get(scope.parent);
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
