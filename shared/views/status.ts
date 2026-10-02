import { BRIDGE, type ScopeId } from "../contracts/ids.ts";
import type { Brief, Line, Obligation, Plan, Scope } from "../contracts/ledger.ts";
import type { State } from "../kernel/state.ts";

/** What a piece of evidence says of its commit, in a word; a reader's answer to a question says nothing of it. */
export const resultText = (ok: boolean | null): string => (ok === null ? "an answer" : ok ? "ok" : "failing");

/** A scope as its agents read it with `status` (KERNEL.md §8): facts from the record, nothing advised. */
export function statusText(state: State, scopeId: ScopeId, reader: string | null): string | null {
  const scope = state.scopes.get(scopeId);
  if (!scope) return null;
  const out: string[] = [];
  const owner = scope.owner ? state.actors.get(scope.owner) : undefined;
  out.push(
    `Scope ${scope.id} · ${scope.kind} · ${scope.status}${scope.held ? " · held" : ""} · ${owner ? `${owner.id} (${owner.role})` : "nobody seated"}`,
  );
  if (state.machineHeldBy !== null)
    out.push(
      `The machine is held by ${state.machineHeldBy}, measuring: checks and new copies wait until it is let go.`,
    );
  if (scope.workspace === "failed") out.push("Its copy could not be made: no agent works in it.");
  if (scope.paths.length > 0) out.push(`Paths: ${scope.paths.map((p) => p || "(the whole tree)").join(", ")}`);
  if (scope.branch) out.push(`Branch: ${scope.branch}`);
  if (scope.commit) out.push(`Reads commit: ${scope.commit}`);
  if (scope.after.length > 0) out.push(`Waits for: ${scope.after.join(", ")}`);
  // An edge says something only while both its ends are open, and is read at each end.
  const open = (ids: readonly ScopeId[]) => ids.filter((id) => state.scopes.get(id)?.status === "open");
  const from = (edge: "mustTell" | "mayChange") =>
    [...state.scopes.values()].filter((s) => s.status === "open" && s[edge].includes(scope.id)).map((s) => s.id);
  const edges: [string, readonly ScopeId[]][] = [
    ["Must tell", open(scope.mustTell)],
    ["Is told of what changes in", from("mustTell")],
    ["May change the brief of", open(scope.mayChange)],
    ["Its brief may also be amended by the owner of", from("mayChange")],
  ];
  for (const [says, ids] of edges) if (ids.length > 0) out.push(`${says}: ${ids.join(", ")}`);
  if (scope.kind === "watch") out.push(`Watches over: ${scope.over === "all" ? "every scope" : scope.over.join(", ")}`);
  if (scope.brief) out.push(briefText(scope.brief));
  if (scope.plan) out.push(planText(scope.plan));
  const spent = scope.spent;
  const appetite = scope.plan?.appetite;
  out.push(
    `Spent by this scope and below: $${spent.usd.toFixed(2)}, ${spent.tokens} tokens${appetite?.usd ? ` of an appetite of $${appetite.usd}` : ""}`,
  );
  const children = [...state.scopes.values()].filter((c) => c.parent === scope.id);
  if (children.length > 0) out.push(`Children:\n${children.map((c) => `- ${childLine(state, c)}`).join("\n")}`);
  const claim = scope.claim ? state.claims.get(scope.claim) : undefined;
  if (claim)
    out.push(
      `Handed back: ${claim.commit} · ${claim.text}${scope.candidate ? ` · candidate ${scope.candidate.candidate}` : ""}${
        (state.project?.checks ?? []).length === 0 ? "\nNo check is set for the project: nothing was run on it." : ""
      }`,
    );
  const evidence = [...state.evidence.values()].filter((e) => e.scope === scope.id);
  if (evidence.length > 0)
    out.push(
      `Evidence:\n${evidence.map((e) => `- ${e.id} ${e.kind}${e.by === BRIDGE ? "" : ` by ${e.by}`} on ${e.subject}: ${resultText(e.ok)} · ${e.summary.split("\n")[0] ?? ""}`).join("\n")}`,
    );
  const findings = [...state.findings.values()].filter((f) => f.scope === scope.id || f.answeredBy === scope.id);
  if (findings.length > 0)
    out.push(`Findings:\n${findings.map((f) => `- ${f.id} ${f.status} from ${f.raisedBy}: ${f.text}`).join("\n")}`);
  if (reader) {
    const owes = [...state.obligations.values()].filter((o) => o.owedBy === reader);
    const owed = [...state.obligations.values()].filter((o) => o.owedTo === reader);
    // The words an answer or a carrying-in is owed for: whoever came to owe it by a seat left empty never read them.
    const words = (o: Obligation) => {
      const text =
        o.about.kind === "message" || o.about.kind === "direction" ? state.messages.get(o.about.id)?.text : "";
      return text ? `: ${text.replaceAll("\n", "\n  ")}` : "";
    };
    if (owes.length > 0)
      out.push(`You owe:\n${owes.map((o) => `- ${o.about.kind} ${o.about.id} to ${o.owedTo}${words(o)}`).join("\n")}`);
    if (owed.length > 0)
      out.push(`Owed to you:\n${owed.map((o) => `- ${o.about.kind} ${o.about.id} by ${o.owedBy}`).join("\n")}`);
    const sent = [...state.messages.values()].filter((m) => m.from === reader && m.copyOf === null);
    if (sent.length > 0)
      out.push(
        `Your messages:\n${sent.map((m) => `- ${m.id} to ${m.to}: ${m.delivered ? "delivered" : "queued"}${m.asks ? (m.answered ? ", answered" : ", waiting for an answer") : ""}`).join("\n")}`,
      );
  }
  return out.join("\n\n");
}

function lineText(l: Line): string {
  return `[${l.id}${l.origin === "human" ? ", the Human's" : ""}] ${l.text}`;
}

export function briefText(b: Brief): string {
  const section = (name: string, lines: readonly Line[]) =>
    lines.length > 0 ? `${name}:\n${lines.map((l) => `- ${lineText(l)}`).join("\n")}` : "";
  return [
    `Brief v${b.version} (${b.kind})`,
    `Goal: ${lineText(b.goal)}`,
    section("Must hold", b.constraints),
    section("Chosen so far (a default you may argue with)", b.choices),
    section("Context", b.context),
  ]
    .filter(Boolean)
    .join("\n");
}

function planText(p: Plan): string {
  return [
    "Plan",
    `Goal: ${lineText(p.goal)}`,
    ...p.limits.map((l) => `Limit: ${lineText(l)}`),
    ...p.unknowns.map((u) => `Unknown: ${lineText(u.line)} · checked by: ${u.check}`),
    `Appetite: ${lineText(p.appetite.line)}`,
    ...p.terms.map(
      (t) => `Term ${t.name}: ${lineText(t.line)}${t.avoid.length > 0 ? ` · not: ${t.avoid.join(", ")}` : ""}`,
    ),
  ].join("\n");
}

function childLine(state: State, c: Scope): string {
  const owner = c.owner ? state.actors.get(c.owner) : undefined;
  const bits = [`${c.id} ${c.status}`, owner ? `${owner.id} (${owner.role})` : "nobody seated"];
  if (c.paths.length > 0) bits.push(c.paths.join(", "));
  if (c.workspace === "failed") bits.push("no copy");
  else if (owner?.status === "seated" && owner.host === null) bits.push("no agent yet");
  if (c.claim) bits.push("handed back");
  if (c.candidate) bits.push(`candidate ${c.candidate.candidate}`);
  if (c.integrating) bits.push("integrating");
  return bits.join(" · ");
}
