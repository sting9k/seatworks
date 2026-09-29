import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Who holds the machine, for every project the plugin runs: a measurement in one project is spoiled by a build in
 * another as surely as by one of its own (KERNEL.md §4.8). Kept on disk so a restart keeps the hold.
 */
export class MachineHolds {
  private readonly db: DatabaseSync;
  private readonly listeners = new Set<() => void>();

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file, { timeout: 5000 });
    this.db.exec(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS holds (project TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY (project, actor)) STRICT;",
    );
  }

  held(): boolean {
    return this.db.prepare("SELECT 1 FROM holds LIMIT 1").get() !== undefined;
  }

  set(project: string, actor: string, hold: boolean): void {
    if (hold) this.db.prepare("INSERT OR IGNORE INTO holds (project, actor) VALUES (?, ?)").run(project, actor);
    else this.db.prepare("DELETE FROM holds WHERE project = ? AND actor = ?").run(project, actor);
    if (!hold) for (const listener of this.listeners) listener();
  }

  /** Called when a hold lifts, so every project's dispatcher starts what waited. */
  onRelease(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.db.close();
  }
}
