import type { PaseoApi } from "@getpaseo/client";

/** Paseo's API as last received; it reconnects by itself, and work that needs it waits until the first arrives. */
export class PaseoLink {
  private api: PaseoApi | null = null;
  private readonly waiting = new Set<() => void>();

  set(api: PaseoApi): void {
    if (this.api === api) return;
    this.api = api;
    for (const wake of this.waiting) wake();
    this.waiting.clear();
  }

  get current(): PaseoApi | null {
    return this.api;
  }

  /** Calls `wake` once the API arrives; returns the way to stop waiting. */
  onReady(wake: () => void): () => void {
    if (this.api) {
      wake();
      return () => undefined;
    }
    this.waiting.add(wake);
    return () => this.waiting.delete(wake);
  }
}
