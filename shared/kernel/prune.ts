import { HUMAN } from "../contracts/ids.ts";
import { sameCommit } from "./commits.ts";
import type { State } from "./state.ts";

/** Keeps the state to open work; nothing an open obligation, attention or message points at is removed (I11). */
export function prune(s: State): State {
  const owedAbout = new Set<string>();
  const parties = new Set<string>();
  for (const o of s.obligations.values()) {
    owedAbout.add(`${o.about.kind}:${o.about.id}`);
    parties.add(o.owedBy).add(o.owedTo);
  }

  const openBelow = new Set<string>();
  for (const scope of s.scopes.values())
    if (scope.status === "open")
      for (let at = scope.parent; at !== null; at = s.scopes.get(at)?.parent ?? null) openBelow.add(at);
  const pinned = (scope: string) =>
    [...s.findings.values()].some((f) => f.scope === scope && owedAbout.has(`finding:${f.id}`)) ||
    [...s.claims.values()].some((c) => c.scope === scope && owedAbout.has(`claim:${c.id}`));
  const gone = new Set<string>();
  for (const scope of s.scopes.values())
    if (scope.status !== "open" && !openBelow.has(scope.id) && !pinned(scope.id)) gone.add(scope.id);

  const messages = new Map(s.messages);
  for (const m of s.messages.values()) {
    const readerLeft = m.to !== HUMAN && s.actors.get(m.to)?.status !== "seated";
    const settled = m.delivered !== null && (!m.asks || m.answered);
    const owed = owedAbout.has(`message:${m.id}`) || owedAbout.has(`direction:${m.id}`);
    if ((settled || readerLeft) && !owed) messages.delete(m.id);
  }

  const claims = new Map(s.claims);
  for (const c of s.claims.values()) {
    const current = s.scopes.get(c.scope)?.claim === c.id;
    if ((gone.has(c.scope) || !current) && !owedAbout.has(`claim:${c.id}`)) claims.delete(c.id);
  }

  const attentions = new Map(s.attentions);
  for (const t of s.attentions.values()) if (s.scopes.get(t.about.scope)?.status !== "open") attentions.delete(t.id);

  const permissions = new Map(s.permissions);
  for (const p of s.permissions.values()) if (!owedAbout.has(`permission:${p.id}`)) permissions.delete(p.id);

  const referenced = new Set<string>(parties);
  for (const m of messages.values()) referenced.add(m.from).add(m.to);
  for (const t of attentions.values()) referenced.add(t.about.actor).add(t.to);
  for (const scope of s.scopes.values()) if (!gone.has(scope.id) && scope.owner !== null) referenced.add(scope.owner);
  const actors = new Map(s.actors);
  for (const a of s.actors.values()) if (a.status !== "seated" && !referenced.has(a.id)) actors.delete(a.id);

  const scopes = new Map(s.scopes);
  const findings = new Map(s.findings);
  const evidence = new Map(s.evidence);
  for (const id of gone) scopes.delete(id);
  for (const f of s.findings.values()) if (gone.has(f.scope)) findings.delete(f.id);
  // Evidence on a commit an open scope may still integrate stays citable, whichever scope recorded it (I4).
  const citable: string[] = [];
  for (const scope of s.scopes.values())
    if (!gone.has(scope.id) && scope.candidate) citable.push(scope.candidate.candidate);
  for (const e of s.evidence.values())
    if (gone.has(e.scope) && !citable.some((commit) => sameCommit(commit, e.subject))) evidence.delete(e.id);
  const noise = new Set([...s.noise].filter((key) => !gone.has(key.split("|")[2] ?? "")));

  return { ...s, scopes, findings, evidence, claims, messages, attentions, permissions, actors, noise };
}
