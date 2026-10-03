import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Effect } from "../../../shared/contracts/effects.ts";
import type { Event } from "../../../shared/contracts/events.ts";

/** `abandoned`: its satellite threw on every try, so no fact about it reached the record. */
export type EffectStatus = "pending" | "done" | "dropped" | "failed" | "abandoned";
export type PendingEffect = Effect & { readonly seq: number; readonly attempts: number };
/** An event filed under a subject, so that what is read of one thing reads its own events and not the whole log. */
export type Filed = { readonly subject: string; readonly seq: number };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY, command_id TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, type TEXT NOT NULL,
    payload TEXT NOT NULL) STRICT;
  CREATE INDEX IF NOT EXISTS events_command ON events (command_id);
  CREATE INDEX IF NOT EXISTS events_type ON events (type);
  CREATE TABLE IF NOT EXISTS effects (
    key TEXT PRIMARY KEY, event_seq INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, result TEXT, settled_at TEXT) STRICT;
  CREATE INDEX IF NOT EXISTS effects_pending ON effects (status, event_seq);
  CREATE TABLE IF NOT EXISTS snapshots (seq INTEGER PRIMARY KEY, state TEXT NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS filed (
    subject TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (subject, seq)) STRICT, WITHOUT ROWID;
`;

/** Snapshots kept: the latest two, so a torn write of one leaves the other (LEDGER.md §10). */
const SNAPSHOTS_KEPT = 2;
/** How long a settled effect's key is kept, so a late duplicate fact is still recognised and dropped. */
const SETTLED_KEPT_MS = 7 * 24 * 3600 * 1000;

/** One project's log in its own SQLite file: events and the effects they ask for in one transaction. */
export class ProjectStore {
  private readonly db: DatabaseSync;
  private readonly insertEvent: StatementSync;
  private readonly insertEffect: StatementSync;
  private readonly insertFiled: StatementSync;
  private readonly filedRows: StatementSync;
  private readonly lastSeq: StatementSync;
  private readonly byCommand: StatementSync;
  private readonly pendingRows: StatementSync;
  private readonly settleRow: StatementSync;
  private readonly attemptRow: StatementSync;
  private readonly recentRows: StatementSync;
  private readonly countRows: StatementSync;

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
    this.insertFiled = this.db.prepare("INSERT OR IGNORE INTO filed (subject, seq) VALUES (?, ?)");
    this.filedRows = this.db.prepare(
      "SELECT e.seq, e.command_id, e.at, e.by, e.type, e.payload FROM filed f JOIN events e ON e.seq = f.seq WHERE f.subject = ? ORDER BY f.seq",
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
    this.recentRows = this.db.prepare(
      "SELECT seq, command_id, at, by, type, payload FROM events ORDER BY seq DESC LIMIT ?",
    );
    this.countRows = this.db.prepare("SELECT count(*) AS n FROM events WHERE type = ?");
  }

  /** Appends one command's events with their effects and filings, atomically; fails if another append came first. */
  append(
    events: readonly Event[],
    effects: readonly Effect[],
    filed: readonly Filed[],
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
      for (const f of filed) this.insertFiled.run(f.subject, f.seq);
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

  /** The events filed under a subject, in order. */
  about(subject: string): Event[] {
    return this.filedRows.all(subject).map(toEvent);
  }

  /** The latest events, newest last, for the Human's view of what happened. */
  recent(limit: number): Event[] {
    return this.recentRows.all(limit).map(toEvent).reverse();
  }

  /** How many events of a type the log holds, read off the index and never off the events themselves. */
  count(type: Event["type"]): number {
    return (this.countRows.get(type) as { n: number }).n;
  }

  pending(): PendingEffect[] {
    return this.pendingRows.all().map((row) => {
      const r = row as { key: string; event_seq: number; payload: string; attempts: number };
      return { key: r.key, seq: r.event_seq, attempts: r.attempts, body: JSON.parse(r.payload) as Effect["body"] };
    });
  }

  /** Effects given up after throwing, with the last error, for as long as their rows are kept. */
  abandoned(): (Effect & { why: string })[] {
    return this.db
      .prepare("SELECT key, payload, result FROM effects WHERE status = 'abandoned' ORDER BY event_seq, key")
      .all()
      .map((row) => {
        const r = row as { key: string; payload: string; result: string };
        return { key: r.key, body: JSON.parse(r.payload) as Effect["body"], why: String(JSON.parse(r.result)) };
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
