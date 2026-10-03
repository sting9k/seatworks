import { join } from "node:path";
import type { CommandBody } from "../../shared/contracts/commands.ts";
import { ACTOR_LABEL, PROJECT_LABEL, ROOT } from "../../shared/contracts/ids.ts";
import type { Scope } from "../../shared/contracts/ledger.ts";
import type { State } from "../../shared/kernel/state.ts";
import type { Keys } from "../core/keys.ts";
import { humanRules } from "../core/rules.ts";
import { matchingOf, runsOn } from "../profile/agents.ts";
import { ownOf } from "../profile/own-runs.ts";
import { heldFile, laneBranch, laneOf, shares } from "./lane.ts";
import type { PaseoHost } from "../satellites/agent-host/host.ts";
import { type Recorded, renderBatch } from "../satellites/delivery/render.ts";
import type { EvidenceRunner } from "../satellites/evidence/runner.ts";
import type { MachineHolds } from "../satellites/machine/holds.ts";
import type { Workspace } from "../satellites/workspace/workspace.ts";
import type { Bundle } from "../profile/bundle.ts";
import { filledIn } from "../profile/servers.ts";
import { firstPrompt, systemPromptFor } from "./briefing.ts";
import type { Handled, Handlers } from "./dispatcher.ts";

export type Wiring = {
  readonly project: string;
  readonly workspace: Workspace;
  readonly evidence: EvidenceRunner;
  readonly host: PaseoHost;
  readonly holds: MachineHolds;
  /** The profile the project runs, by its name. */
  readonly profile: string;
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
  /** Where the Human keeps their own rules by role. */
  readonly rules: string;
  /** The file of the Human's matching: which of their agent profiles each name the profile gives runs on. */
  readonly agents: string;
  /** The file of the project's own: what it runs in place of the Human's profile, by the name the profile gives. */
  readonly own: string;
  readonly checkTimeoutMs: number;
  /** The events on a scope's record, for what a delivery shows of it. */
  readonly recorded: Recorded;
};

const WAIT: Handled = { status: "wait" };

/** Where a seat's agent works: the root in the repository itself, a watch in the scratch, every other in its lane's worktree. */
export async function seatDir(
  w: Pick<Wiring, "project" | "workspace" | "scratch">,
  state: State,
  scope: Scope,
): Promise<string | null> {
  if (scope.kind === "watch") return w.scratch;
  if (scope.id === ROOT) return w.workspace.repo;
  return (await w.workspace.treeOf(laneBranch(w.project, laneOf(state, scope).id)))?.path ?? null;
}

/** What an agent's tools and its git need to know of its seat: who it is, its key, where it works and what it may do there. */
export function seatEnv(
  w: Pick<Wiring, "project" | "keys" | "team" | "scratch">,
  state: State,
  seat: { readonly actor: string; readonly scope: Scope; readonly cwd: string; readonly writes: boolean },
): Record<string, string> {
  const shared = shares(state, seat.scope, seat.writes);
  return {
    SEATWORKS_PROJECT: w.project,
    SEATWORKS_ACTOR: seat.actor,
    SEATWORKS_KEY: w.keys.keyOf(w.project, seat.actor),
    SEATWORKS_WRITES: seat.writes ? "1" : "0",
    SEATWORKS_COPY: seat.cwd,
    SEATWORKS_SHIM_DIR: w.team.shimDir,
    SEATWORKS_SOCKET: w.team.socket,
    // In a folder others work in, its git is held to its own: this file says which paths are a neighbour's.
    ...(shared ? { SEATWORKS_HELD: heldFile(w.scratch, seat.actor) } : {}),
    // Whoever owns a lane takes its parent's branch in by hand when the two conflict, though it writes nothing else.
    ...(shared && laneOf(state, seat.scope).id === seat.scope.id ? { SEATWORKS_MERGES: "1" } : {}),
  };
}

/** Where an agent's `paseo` looks for a daemon: a name that never resolves, and that says why in the error it gives. */
const NO_DAEMON = { PASEO_HOST: "not-for-a-teams-agent.invalid:1", PASEO_HOME: "" };

/** The seat's environment as its agent's own process gets it: the git shim first on its PATH, and no Paseo daemon. */
export function agentEnv(w: Pick<Wiring, "team">, env: Record<string, string>): Record<string, string> {
  const path = `${w.team.shimDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`;
  // Paseo's command line lists, reads and prompts every agent of the daemon; a team's reach each other by the record.
  return { ...env, ...NO_DAEMON, PATH: path };
}
const done = (...facts: CommandBody[]): Handled => ({ status: "done", facts });
/** The fact that an actor's agent was never made, or is no more, and why. */
const gone = (actor: string, why: string): CommandBody => ({ type: "record_gone", actor, why });

/** Each effect the kernel asks for, carried to the satellite that does it, and what it found brought back as facts. */
export function handlersFor(w: Wiring): Handlers {
  const parentBranch = (state: State, scope: Scope) =>
    scope.parent === null ? null : (state.scopes.get(scope.parent)?.branch ?? null);

  return {
    "workspace.create": async (e, { state, key }) => {
      const scope = state.scopes.get(e.scope);
      if (!scope || scope.status !== "open") return { status: "dropped", why: `scope ${e.scope} is gone` };
      const ready = async (branch: string | null) => {
        const head = await w.workspace.headOf(branch ?? "HEAD");
        const why = `the repository has no ${branch ?? "HEAD"} to work from`;
        return head === null
          ? done({ type: "record_workspace", scope: scope.id, ok: false, branch: null, head: null, why })
          : done({ type: "record_workspace", scope: scope.id, ok: true, branch, head, why: null });
      };
      // The root is seated where the Human works, in the repository itself: a worktree is for work handed out.
      if (scope.id === ROOT) return ready(scope.branch);
      const lane = laneOf(state, scope);
      const branch = laneBranch(w.project, lane.id);
      // Work under a lane is done in the lane's own worktree, on its branch, by everyone the lane seats.
      if (lane.id !== scope.id || (await w.workspace.treeOf(branch)) !== null) return ready(branch);
      const exists = (await w.workspace.headOf(`refs/heads/${branch}`)) !== null;
      const made = await w.host.openWorktree({
        key: `${w.project}:${key}`,
        projectRoot: w.workspace.repo,
        title: scope.brief?.goal.text ?? `${scope.id} · ${scope.role}`,
        slug: branch.replaceAll("/", "-"),
        branch,
        // A lane that reads one commit starts from it; any other from where its parent's branch stands.
        base: exists ? null : (scope.commit ?? parentBranch(state, scope) ?? "HEAD"),
      });
      if ("unavailable" in made) return WAIT;
      if ("failed" in made)
        return done({
          type: "record_workspace",
          scope: scope.id,
          ok: false,
          branch: null,
          head: null,
          why: made.failed,
        });
      // Paseo names a branch anew where the name was taken: the worktree counts only on the branch asked for.
      if ((await w.workspace.treeOf(branch)) === null) {
        const why = `Paseo made ${made.path} on another branch than ${branch}`;
        return done({ type: "record_workspace", scope: scope.id, ok: false, branch: null, head: null, why });
      }
      return ready(branch);
    },

    "agent.create": async (e, { state, key }) => {
      const actor = state.actors.get(e.actor);
      if (!actor || actor.status !== "seated" || actor.host !== null)
        return { status: "dropped", why: `${e.actor} needs no agent` };
      const scope = state.scopes.get(actor.scope);
      const role = w.bundle.profile.roles.get(actor.role);
      if (!scope || !role) return { status: "dropped", why: `${e.actor}'s scope or role is gone` };
      const cwd = await seatDir(w, state, scope);
      if (cwd === null) {
        const why = `the worktree scope ${actor.scope} works in is gone`;
        return { status: "failed", why, facts: [gone(actor.id, why)] };
      }
      const env = seatEnv(w, state, { actor: actor.id, scope, cwd, writes: role.writes });
      const given = filledIn(w.bundle.servers.get(actor.role) ?? [], process.env);
      if (!given.ok) return { status: "failed", why: given.says, facts: [gone(actor.id, given.says)] };
      const kept = matchingOf(w.agents);
      if (!kept.ok) return { status: "failed", why: kept.says, facts: [gone(actor.id, kept.says)] };
      const profile = runsOn(kept.matching, actor.model);
      const own = ownOf(w.own);
      if (!own.ok) return { status: "failed", why: own.says, facts: [gone(actor.id, own.says)] };
      const created = await w.host.create({
        // Paseo keeps a keyed create for the whole daemon, and every project's log counts from 1.
        key: `${w.project}:${key}`,
        // Its first words go under the effect's own key, as every delivery does: that is how they are known as ours.
        promptId: `${key}:prompt`,
        title: `${actor.scope} · ${actor.role}`,
        profile,
        runs: own.own[actor.model] ?? {},
        cwd,
        projectRoot: w.workspace.repo,
        systemPrompt: systemPromptFor(w.bundle, actor, humanRules(w.rules, actor.role)),
        prompt: firstPrompt(
          state,
          actor,
          [...state.actors.values()].some((a) => a.scope === actor.scope && a.id !== actor.id),
          w.bundle.project?.docs ?? [],
        ),
        env: agentEnv(w, env),
        tools: {
          command: w.team.command,
          args: [...w.team.args, w.team.socket],
          // The command is this worker's executable, which under the desktop app is the Electron binary.
          env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
          names: [...role.tools, "status", "record", "diff", "look"].filter((t, i, all) => all.indexOf(t) === i),
        },
        labels: { [PROJECT_LABEL]: w.project, [ACTOR_LABEL]: actor.id, "seatworks.scope": actor.scope },
        writes: role.writes,
        gitDir: await w.workspace.gitDir(),
        servers: given.grants,
      });
      if ("unavailable" in created) return WAIT;
      if ("failed" in created) {
        // The profile Paseo lacks may be one the template never named: say which name was matched to it.
        const why = profile === actor.model ? created.failed : `${created.failed} (${actor.model} is matched to it)`;
        return { status: "failed", why, facts: [gone(actor.id, why)] };
      }
      return done({ type: "record_agent", actor: actor.id, host: created.host });
    },

    "agent.archive": async (e) => {
      // With no agent on the record, one may still be there: made while its seat was ending, and found by its labels.
      const made = e.host === null ? await w.host.labelled({ [PROJECT_LABEL]: w.project, [ACTOR_LABEL]: e.actor }) : [];
      if ("unavailable" in made) return WAIT;
      const hosts = e.host === null ? made.map((agent) => agent.host) : [e.host];
      if (hosts.length === 0) return { status: "dropped", why: "it never started" };
      for (const host of hosts) if ((await w.host.archive(host)) !== "done") return WAIT;
      return done();
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
        w.recorded,
      );
      if (!rendered) return { status: "dropped", why: "nothing left to say" };
      // What asks nothing waits for a delivery that asks something (COMMUNICATION.md, The mailbox).
      if (!rendered.asks) return WAIT;
      const sent = await w.host.send(reader.host, rendered.text, key);
      if (sent === "busy" || typeof sent === "object") return WAIT;
      if (sent === "gone") return { status: "dropped", why: `${reader.id} is gone`, facts: [] };
      const read = { to: reader.id, messages: rendered.messages, attentions: rendered.attentions };
      return { status: "done", facts: [{ type: "record_delivery", ...read }], taken: rendered.taken };
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
          facts: [
            {
              type: "record_candidate",
              scope: scope.id,
              commit: e.commit,
              result: { conflict: [r.failed], since: [] },
            },
          ],
        };
      return done({ type: "record_candidate", scope: scope.id, commit: e.commit, result: r });
    },

    "evidence.run": async (e) => {
      const ran = await w.evidence.run(
        `${w.project}-${e.scope}-${e.subject.slice(0, 12)}`,
        e.subject,
        e.steps,
        w.checkTimeoutMs,
        w.bundle.environment,
      );
      return done({
        type: "record_evidence",
        scope: e.scope,
        subject: e.subject,
        ok: ran.ok,
        summary: ran.summary,
        steps: ran.steps,
        heldMachine: false,
        asked: e.by,
      });
    },

    "workspace.advance": async (e, { state }) => {
      const scope = state.scopes.get(e.scope);
      const branch = scope ? parentBranch(state, scope) : null;
      if (!scope || branch === null) return { status: "dropped", why: `scope ${e.scope} has no parent branch` };
      const moved = await w.workspace.advance(branch, e.from, e.to);
      return done({ type: "record_integration", scope: scope.id, result: moved });
    },

    "workspace.remove": async (e) => {
      // Only a lane has a worktree and a branch of its own: work under it was done in the lane's, which stays.
      if (e.branch !== laneBranch(w.project, e.scope)) return done();
      const tree = await w.workspace.treeOf(e.branch);
      if (tree?.unsaved) return { status: "failed", why: `${tree.path} holds uncommitted work` };
      if (tree) {
        const closed = await w.host.closeWorktree(tree.path);
        if (closed !== "done") return "unavailable" in closed ? WAIT : { status: "failed", why: closed.failed };
      }
      if (e.mergedInto !== null) await w.workspace.dropMerged(e.branch, e.mergedInto);
      return done();
    },

    "workspace.publish": async (e) => {
      const result = await w.workspace.publish(e.branch, e.remote, e.expectedSha);
      return done({ type: "record_publish", remote: e.remote, branch: e.branch, result });
    },

    "machine.hold": (e) => {
      w.holds.set(w.project, e.actor, e.hold);
      return Promise.resolve(done());
    },
  };
}

export function scratchFor(root: string, project: string): string {
  return join(root, "projects", project, "scratch");
}
