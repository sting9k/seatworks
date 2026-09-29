import { join } from "node:path";
import type { CommandBody } from "../../shared/contracts/commands.ts";
import { ROOT } from "../../shared/contracts/ids.ts";
import type { Scope } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";
import type { Keys } from "../core/keys.ts";
import type { PaseoHost } from "../satellites/agent-host/host.ts";
import { renderBatch } from "../satellites/delivery/render.ts";
import type { EvidenceRunner } from "../satellites/evidence/runner.ts";
import type { MachineHolds } from "../satellites/machine/holds.ts";
import type { Workspace } from "../satellites/workspace/workspace.ts";
import type { Bundle } from "../profile/bundle.ts";
import { firstPrompt, systemPromptFor } from "./briefing.ts";
import type { Handled, Handlers } from "./dispatcher.ts";

export type Wiring = {
  readonly project: string;
  readonly workspace: Workspace;
  readonly evidence: EvidenceRunner;
  readonly host: PaseoHost;
  readonly holds: MachineHolds;
  readonly bundle: Bundle;
  readonly keys: Keys;
  /** How an agent's tool server is started, and the directory of the git shim put first on its PATH. */
  readonly team: {
    readonly command: string;
    readonly args: readonly string[];
    readonly socket: string;
    readonly shimDir: string;
  };
  readonly scratch: string;
  readonly checkTimeoutMs: number;
};

const WAIT: Handled = { status: "wait" };
const done = (...facts: CommandBody[]): Handled => ({ status: "done", facts });

/** Each effect the kernel asks for, carried to the satellite that does it, and what it found brought back as facts. */
export function handlersFor(w: Wiring): Handlers {
  const branchOf = (scope: string) => `sw/${w.project}/${scope}`;
  const parentBranch = (state: State, scope: Scope) =>
    scope.parent === null ? null : (state.scopes.get(scope.parent)?.branch ?? null);

  return {
    "workspace.create": async (e, { state }) => {
      const scope = state.scopes.get(e.scope);
      if (!scope || scope.status !== "open") return { status: "dropped", why: `scope ${e.scope} is gone` };
      const role = w.bundle.profile.roles.get(scope.role);
      const from = parentBranch(state, scope);
      let made;
      if (scope.id === ROOT)
        made = await w.workspace.create(scope.id, { kind: "reader", at: scope.branch ?? "HEAD", branch: null });
      else if (scope.commit !== null)
        made = await w.workspace.create(scope.id, { kind: "reader", at: scope.commit, branch: null });
      else if (role?.writes)
        made = await w.workspace.create(scope.id, { kind: "writer", branch: branchOf(scope.id), from: from ?? "HEAD" });
      else
        made = await w.workspace.create(scope.id, { kind: "reader", at: from ?? "HEAD", branch: branchOf(scope.id) });
      const branch = scope.id === ROOT ? scope.branch : scope.commit !== null ? null : branchOf(scope.id);
      return made.ok
        ? done({ type: "record_workspace", scope: scope.id, ok: true, branch, why: null })
        : done({ type: "record_workspace", scope: scope.id, ok: false, branch: null, why: made.why });
    },

    "agent.create": async (e, { state, key }) => {
      const actor = state.actors.get(e.actor);
      if (!actor || actor.status !== "seated" || actor.host !== null)
        return { status: "dropped", why: `${e.actor} needs no agent` };
      const scope = state.scopes.get(actor.scope);
      const role = w.bundle.profile.roles.get(actor.role);
      if (!scope || !role) return { status: "dropped", why: `${e.actor}'s scope or role is gone` };
      const cwd = scope.kind === "watch" ? w.scratch : w.workspace.pathOf(scope.id);
      const agentKey = w.keys.keyOf(w.project, actor.id);
      const env = {
        SEATWORKS_PROJECT: w.project,
        SEATWORKS_ACTOR: actor.id,
        SEATWORKS_KEY: agentKey,
        SEATWORKS_WRITES: role.writes ? "1" : "0",
        SEATWORKS_COPY: cwd,
        SEATWORKS_SHIM_DIR: w.team.shimDir,
      };
      const created = await w.host.create({
        key,
        title: `${actor.scope} · ${actor.role}`,
        profile: actor.model,
        cwd,
        systemPrompt: systemPromptFor(w.bundle, actor),
        prompt: firstPrompt(
          state,
          actor,
          [...state.actors.values()].some((a) => a.scope === actor.scope && a.id !== actor.id),
        ),
        env: { ...env, PATH: `${w.team.shimDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` },
        tools: {
          command: w.team.command,
          args: [...w.team.args, w.team.socket],
          env,
          names: [...role.tools, "status", "record", "diff", "look"].filter((t, i, all) => all.indexOf(t) === i),
        },
        labels: { "seatworks.project": w.project, "seatworks.actor": actor.id, "seatworks.scope": actor.scope },
        writes: role.writes,
      });
      if ("unavailable" in created) return WAIT;
      if ("failed" in created)
        return {
          status: "failed",
          why: created.failed,
          facts: [{ type: "record_gone", actor: actor.id, why: created.failed }],
        };
      return done({ type: "record_agent", actor: actor.id, host: created.host });
    },

    "agent.archive": async (e) => {
      if (e.host === null) return { status: "dropped", why: "it never started" };
      const r = await w.host.archive(e.host);
      return r === "done" ? done() : WAIT;
    },

    "agent.permission": async (e) => {
      if (e.host === null) return { status: "dropped", why: "no agent to answer" };
      const r = await w.host.answerPermission(e.host, e.request, e.allow, e.reason);
      return r === "done" ? done() : WAIT;
    },

    deliver: async (batch, { state, key }) => {
      const to = batch[0]?.to;
      const reader = to === undefined ? undefined : state.actors.get(to);
      if (!reader || reader.status !== "seated") return { status: "dropped", why: `${to ?? "nobody"} is not seated` };
      if (reader.host === null) return WAIT;
      const rendered = renderBatch(
        batch.map((b) => b.item),
        state,
      );
      if (!rendered) return { status: "dropped", why: "nothing left to say" };
      // What asks nothing waits for a delivery that asks something (COMMUNICATION.md, The mailbox).
      if (!rendered.asks) return WAIT;
      const sent = await w.host.send(reader.host, rendered.text, key);
      if (sent === "busy" || typeof sent === "object") return WAIT;
      if (sent === "gone") return { status: "dropped", why: `${reader.id} is gone`, facts: [] };
      return done({ type: "record_delivery", messages: rendered.messages, attentions: rendered.attentions });
    },

    "workspace.candidate": async (e, { state }) => {
      const scope = state.scopes.get(e.scope);
      const onto = scope ? parentBranch(state, scope) : null;
      if (!scope || onto === null) return { status: "dropped", why: `scope ${e.scope} has no parent branch` };
      const r = await w.workspace.candidate(e.commit, onto, `Integrate scope ${scope.id}`);
      if ("failed" in r)
        return {
          status: "failed",
          why: r.failed,
          facts: [{ type: "record_candidate", scope: scope.id, commit: e.commit, result: { conflict: [r.failed] } }],
        };
      return done({ type: "record_candidate", scope: scope.id, commit: e.commit, result: r });
    },

    "evidence.run": async (e) => {
      const ran = await w.evidence.run(
        `${w.project}-${e.scope}-${e.subject.slice(0, 12)}`,
        e.subject,
        e.steps,
        w.checkTimeoutMs,
      );
      return done({
        type: "record_evidence",
        scope: e.scope,
        subject: e.subject,
        ok: ran.ok,
        summary: ran.summary,
        steps: ran.steps,
        heldMachine: false,
      });
    },

    "workspace.advance": async (e, { state }) => {
      const scope = state.scopes.get(e.scope);
      const branch = scope ? parentBranch(state, scope) : null;
      if (!scope || branch === null) return { status: "dropped", why: `scope ${e.scope} has no parent branch` };
      const moved = await w.workspace.advance(branch, e.from, e.to);
      if ("sha" in moved && scope.parent !== null) await w.workspace.refresh(scope.parent, branch);
      return done({ type: "record_integration", scope: scope.id, result: moved });
    },

    "workspace.remove": async (e) => {
      const r = await w.workspace.remove(e.scope, e.branch, e.mergedInto);
      return "removed" in r ? done() : { status: "failed", why: r.kept };
    },

    "workspace.publish": async (e) =>
      done({ type: "record_publish", result: await w.workspace.publish(e.remote, e.branch) }),

    "machine.hold": (e) => {
      w.holds.set(w.project, e.actor, e.hold);
      return Promise.resolve(done());
    },
  };
}

export function scratchFor(root: string, project: string): string {
  return join(root, "projects", project, "scratch");
}
