import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Effect } from "../../../shared/contracts/effects.ts";
import type { Event } from "../../../shared/contracts/events.ts";

export type EffectStatus = "pending" | "done" | "dropped" | "failed";
export type PendingEffect = Effect & { readonly seq: number; readonly attempts: number };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY, command_id TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, type TEXT NOT NULL,
    payload TEXT NOT NULL) STRICT;
  CREATE INDEX IF NOT EXISTS events_command ON events (command_id);
  CREATE TABLE IF NOT EXISTS effects (
    key TEXT PRIMARY KEY, event_seq INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, result TEXT, settled_at TEXT) STRICT;
  CREATE INDEX IF NOT EXISTS effects_pending ON effects (status, event_seq);
  CREATE TABLE IF NOT EXISTS snapshots (seq INTEGER PRIMARY KEY, state TEXT NOT NULL) STRICT;
`;

/** Snapshots kept: the latest two, so a torn write of one leaves the other (LEDGER.md §10). */
const SNAPSHOTS_KEPT = 2;
/** How long a settled effect's key is kept, so a late duplicate fact is still recognised and dropped. */
const SETTLED_KEPT_MS = 7 * 24 * 3600 * 1000;

/**
 * One project's log in its own SQLite file: events appended in order, the effects they ask for written in the same
 * transaction (an outbox), and snapshots as a cache (CORE.md, The store). Synchronous, as node:sqlite is.
 */
export class ProjectStore {
  private readonly db: DatabaseSync;
  private readonly insertEvent: StatementSync;
  private readonly insertEffect: StatementSync;
  private readonly lastSeq: StatementSync;
  private readonly byCommand: StatementSync;
  private readonly pendingRows: StatementSync;
  private readonly settleRow: StatementSync;
  private readonly attemptRow: StatementSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.insertEvent = this.db.prepare(
      "INSERT INTO events (seq, command_id, at, by, type, payload) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.insertEffect = this.db.prepare(
      "INSERT INTO effects (key, event_seq, kind, payload, status) VALUES (?, ?, ?, ?, 'pending')",
    );
    this.lastSeq = this.db.prepare("SELECT coalesce(max(seq), 0) AS seq FROM events");
    this.byCommand = this.db.prepare(
      "SELECT seq, command_id, at, by, type, payload FROM events WHERE command_id = ? ORDER BY seq",
    );
    this.pendingRows = this.db.prepare(
      "SELECT key, event_seq, payload, attempts FROM effects WHERE status = 'pending' ORDER BY event_seq, key",
    );
    this.settleRow = this.db.prepare(
      "UPDATE effects SET status = ?, result = ?, settled_at = ? WHERE key = ? AND status = 'pending'",
    );
    this.attemptRow = this.db.prepare("UPDATE effects SET attempts = attempts + 1 WHERE key = ?");
  }

  /** Appends one command's events and the effects they ask for, atomically; fails if another append came first. */
  append(
    events: readonly Event[],
    effects: readonly Effect[],
    expectedSeq: number,
  ): { ok: true; seq: number } | { ok: false; says: string } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const seq = this.seq();
      if (seq !== expectedSeq) {
        this.db.exec("ROLLBACK");
        return { ok: false, says: `the log is at ${seq}, not ${expectedSeq}: another writer appended` };
      }
      for (const e of events) {
        const { seq: s, at, by, commandId, type, ...rest } = e;
        this.insertEvent.run(s, commandId, at, by, type, JSON.stringify(rest));
      }
      const firstSeq = events[0]?.seq ?? seq;
      for (const f of effects)
        this.insertEffect.run(f.key, Number(f.key.split(":")[0] ?? firstSeq), f.body.kind, JSON.stringify(f.body));
      this.db.exec("COMMIT");
      return { ok: true, seq: events.at(-1)?.seq ?? seq };
    } finally {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
    }
  }

  seq(): number {
    return (this.lastSeq.get() as { seq: number }).seq;
  }

  /** The events a command appended before, for answering a retried command with its earlier result. */
  commandEvents(commandId: string): Event[] {
    return this.byCommand.all(commandId).map(toEvent);
  }

  /** Events after `fromSeq`, in order, read lazily so a long log is never held whole. */
  *read(fromSeq: number): Generator<Event> {
    for (const row of this.db
      .prepare("SELECT seq, command_id, at, by, type, payload FROM events WHERE seq > ? ORDER BY seq")
      .iterate(fromSeq))
      yield toEvent(row);
  }

  pending(): PendingEffect[] {
    return this.pendingRows.all().map((row) => {
      const r = row as { key: string; event_seq: number; payload: string; attempts: number };
      return { key: r.key, seq: r.event_seq, attempts: r.attempts, body: JSON.parse(r.payload) as Effect["body"] };
    });
  }

  /** Settles a pending effect; false when its key is unknown or was settled before, so a duplicate fact is dropped. */
  settle(key: string, status: Exclude<EffectStatus, "pending">, result: unknown, at: string): boolean {
    const changed = this.settleRow.run(status, JSON.stringify(result ?? null), at, key);
    return changed.changes === 1;
  }

  attempted(key: string): void {
    this.attemptRow.run(key);
  }

  putSnapshot(seq: number, state: string): void {
    this.db.prepare("INSERT OR REPLACE INTO snapshots (seq, state) VALUES (?, ?)").run(seq, state);
    this.db
      .prepare(
        `DELETE FROM snapshots WHERE seq NOT IN (SELECT seq FROM snapshots ORDER BY seq DESC LIMIT ${SNAPSHOTS_KEPT})`,
      )
      .run();
  }

  latestSnapshot(): { seq: number; state: string } | null {
    const row = this.db.prepare("SELECT seq, state FROM snapshots ORDER BY seq DESC LIMIT 1").get() as
      { seq: number; state: string } | undefined;
    return row ?? null;
  }

  /** Lets go of settled effects older than a week: their keys can no longer come back as facts. */
  sweep(now: number): number {
    const before = new Date(now - SETTLED_KEPT_MS).toISOString();
    return Number(
      this.db.prepare("DELETE FROM effects WHERE status != 'pending' AND settled_at < ?").run(before).changes,
    );
  }

  close(): void {
    this.db.exec("PRAGMA optimize");
    this.db.close();
  }
}

function toEvent(row: unknown): Event {
  const r = row as { seq: number; command_id: string; at: string; by: string; type: string; payload: string };
  return {
    ...(JSON.parse(r.payload) as Record<string, unknown>),
    type: r.type,
    seq: r.seq,
    at: r.at,
    by: r.by,
    commandId: r.command_id,
  } as Event;
}
