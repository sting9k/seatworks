import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Who holds the machine across every project, since one's build spoils another's measurement; kept on disk. */
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

  /** Lets go of every hold a project's actors keep: a removed project has no ledger left to release them. */
  releaseProject(project: string): void {
    this.db.prepare("DELETE FROM holds WHERE project = ?").run(project);
    for (const listener of this.listeners) listener();
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
