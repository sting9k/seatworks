/** JSON that keeps Maps and Sets, for snapshots of the folded state. */

type Tagged = { $map: [unknown, unknown][] } | { $set: unknown[] };

export function encode(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v instanceof Map) return { $map: [...(v as Map<unknown, unknown>).entries()] } satisfies Tagged;
    if (v instanceof Set) return { $set: [...(v as Set<unknown>).values()] } satisfies Tagged;
    return v;
  });
}

export function decode(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.$map) && Object.keys(o).length === 1) return new Map(o.$map as [unknown, unknown][]);
      if (Array.isArray(o.$set) && Object.keys(o).length === 1) return new Set(o.$set);
    }
    return v;
  });
}
