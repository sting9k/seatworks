import { z } from "zod";
import type { TemplateFiles } from "./read-template.ts";

/** A template as it is shared: one JSON file that holds the text of each of its files by its path (TEMPLATE.md). */
const PackedSchema = z.object({ files: z.record(z.string().min(1), z.string()) }).strict();

export function packed(files: TemplateFiles): string {
  const byPath = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ files: byPath }, null, 2)}\n`;
}

export function unpacked(
  text: string,
): { readonly ok: true; readonly files: TemplateFiles } | { readonly ok: false; readonly says: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, says: "this is not a packed template: it is not JSON" };
  }
  const parsed = PackedSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, files: new Map(Object.entries(parsed.data.files)) }
    : { ok: false, says: `this is not a packed template: ${z.prettifyError(parsed.error)}` };
}
