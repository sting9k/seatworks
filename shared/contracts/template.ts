import { z } from "zod";

/**
 * A template as it is shared: one JSON file that holds the text of each of its files by its path (TEMPLATE.md). The
 * editor writes it and the plugin installs it, so both read it here.
 */
const PackedSchema = z.object({ files: z.record(z.string().min(1), z.string()) }).strict();

/** A path inside a template: names joined by `/`, none of them a way out of the template's own directory. */
const PATH = /^(?!\.{1,2}(\/|$))[A-Za-z0-9._-]+(\/(?!\.{1,2}(\/|$))[A-Za-z0-9._-]+)*$/;

export function unpacked(
  text: string,
): { readonly ok: true; readonly files: ReadonlyMap<string, string> } | { readonly ok: false; readonly says: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, says: "this is not a packed template: it is not JSON" };
  }
  const parsed = PackedSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, says: `this is not a packed template: ${z.prettifyError(parsed.error)}` };
  const outside = Object.keys(parsed.data.files).find((path) => !PATH.test(path));
  if (outside !== undefined)
    return { ok: false, says: `this is not a packed template: ${outside} is not a path inside a template` };
  return { ok: true, files: new Map(Object.entries(parsed.data.files)) };
}
