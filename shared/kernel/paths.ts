/** Paths are repository-relative prefixes: "src/net/" holds everything under it, "" the whole tree (LEDGER.md §3). */

export function normalize(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

/** Whether `outer` holds `inner`: equal, or a prefix of it at a `/` boundary. */
export function holds(outer: string, inner: string): boolean {
  const o = normalize(outer);
  const i = normalize(inner);
  if (o === "" || o === i) return true;
  if (!i.startsWith(o)) return false;
  return o.endsWith("/") || i.charAt(o.length) === "/";
}

export function overlaps(a: string, b: string): boolean {
  return holds(a, b) || holds(b, a);
}

export function anyOverlap(a: readonly string[], b: readonly string[]): string | null {
  for (const x of a) for (const y of b) if (overlaps(x, y)) return holds(x, y) ? y : x;
  return null;
}

export function within(inner: readonly string[], outer: readonly string[]): string | null {
  for (const i of inner) if (!outer.some((o) => holds(o, i))) return i;
  return null;
}
