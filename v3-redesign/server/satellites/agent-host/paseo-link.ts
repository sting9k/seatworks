import type { PaseoApi } from "@getpaseo/client";

/**
 * Paseo's API as the plugin last received it. Paseo hands it out only with a hook or a panel call; it is one client
 * that reconnects by itself, so the latest one stays good. Until the first arrives, work that needs it waits.
 */
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
