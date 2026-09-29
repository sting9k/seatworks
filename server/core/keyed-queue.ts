/**
 * Runs work one at a time per key, and lets a key go once its queue is empty, so a long-lived process keeps no entry
 * for a project or agent that went quiet.
 */
export class KeyedQueue<K> {
  private readonly tails = new Map<K, Promise<unknown>>();

  run<T>(key: K, work: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(work, work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  get size(): number {
    return this.tails.size;
  }
}
