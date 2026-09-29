# node:sqlite for the store

Checked on Node 22.22 (the Node Paseo's CI runs): `DatabaseSync` is synchronous, and the first load prints one
`ExperimentalWarning` to stderr.

```ts
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(file, { timeout: 5000 }); // busy timeout in ms
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY, command_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL, by TEXT NOT NULL,
    type TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS effects (
    key TEXT PRIMARY KEY, event_seq INTEGER NOT NULL REFERENCES events(seq), kind TEXT NOT NULL,
    payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, result TEXT) STRICT;
  CREATE TABLE IF NOT EXISTS snapshots (seq INTEGER PRIMARY KEY, state TEXT NOT NULL) STRICT;`);
```

- **Append**: `BEGIN IMMEDIATE`, read `max(seq)`, compare with the expected sequence, insert events and effects,
  `COMMIT`; `ROLLBACK` in `finally` if `db.isTransaction` is still true. `IMMEDIATE` takes the write lock at the
  start, so two writers never both read the same `max(seq)`.
- **Prepare once** per statement and reuse it; `run()` returns `{ changes, lastInsertRowid }`, `get()` one row or
  `undefined`, `all()` an array, `iterate()` a lazy iterator for folding a long log.
- **Rows are null-prototype objects.** Parse them with a zod schema at the boundary; never spread one into state.
- **A constraint failure throws** an `Error` with `code: 'ERR_SQLITE_ERROR'` and `errcode` 2067 for UNIQUE: a
  command id seen before is detected this way or by a `SELECT` first, and answered with its earlier result.
- `synchronous = FULL` makes an append durable before it returns (`spec/PORTS.md`, Store), at a cost that one
  project's command rate never feels.
- Payloads are JSON text; `STRICT` tables refuse a wrong type instead of storing it.
- One file per project in the plugin's own state root; the machine's holds in one more file for the machine.
