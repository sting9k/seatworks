import { z } from "zod";
import { unpacked } from "../../shared/contracts/template.ts";
import { packed } from "./pack.ts";
import { readTemplate, type TemplateFiles } from "./read-template.ts";

/**
 * The gallery as a page reads it (TEMPLATE.md, The gallery): an index of templates beside the one file each is shared
 * as. It is built from a repository's template directories and never written by hand.
 */
const EntrySchema = z
  .object({
    /** The name of its directory in the gallery's repository, which is also the name it is installed under. */
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    description: z.string(),
    tags: z.array(z.string()),
    /** The file it is shared as, beside the index. */
    file: z.string().min(1),
  })
  .strict();
export type Entry = z.infer<typeof EntrySchema>;
const IndexSchema = z.object({ templates: z.array(EntrySchema) }).strict();

const INDEX = "index.json";

/**
 * The files of a gallery built from templates, each by the name of its directory: the index, and every template as
 * the one file it is shared as. A template that does not load is left out and said, with why: a gallery lists only
 * what would run.
 */
export function galleryOf(templates: ReadonlyMap<string, TemplateFiles>): {
  readonly files: ReadonlyMap<string, string>;
  readonly refused: readonly { readonly id: string; readonly says: string }[];
} {
  const files = new Map<string, string>();
  const entries: Entry[] = [];
  const refused: { id: string; says: string }[] = [];
  for (const [id, template] of [...templates].sort(([a], [b]) => a.localeCompare(b))) {
    const read = readTemplate(template);
    const named = EntrySchema.shape.id.safeParse(id);
    if (!read.ok) refused.push({ id, says: read.says });
    else if (!named.success)
      refused.push({ id, says: "its directory's name is not lower-case letters, digits and dashes" });
    else {
      const { name, description, tags } = read.template.about;
      const file = `${id}.template.json`;
      files.set(file, packed(template));
      entries.push({ id, name, description, tags, file });
    }
  }
  files.set(INDEX, `${JSON.stringify({ templates: entries } satisfies z.infer<typeof IndexSchema>, null, 2)}\n`);
  return { files, refused };
}

/** A template of the gallery as a page holds it: its files, or why they could not be had. */
export type Listed =
  | { readonly entry: Entry; readonly ok: true; readonly files: TemplateFiles }
  | { readonly entry: Entry; readonly ok: false; readonly says: string };

/**
 * The gallery a page was built beside. `get` hands back the text of one of its files, or null when it is not there:
 * the page fetches, a test hands over what a build wrote.
 */
export async function loadGallery(
  get: (file: string) => Promise<string | null>,
): Promise<
  { readonly ok: true; readonly templates: readonly Listed[] } | { readonly ok: false; readonly says: string }
> {
  const text = await get(INDEX);
  if (text === null) return { ok: false, says: "no gallery was built beside this page" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, says: "the gallery's index is not JSON" };
  }
  const index = IndexSchema.safeParse(raw);
  if (!index.success) return { ok: false, says: `the gallery's index is wrong: ${z.prettifyError(index.error)}` };
  const templates = await Promise.all(
    index.data.templates.map(async (entry): Promise<Listed> => {
      const shared = await get(entry.file);
      if (shared === null) return { entry, ok: false, says: `${entry.file} is not in the gallery` };
      const opened = unpacked(shared);
      if (!opened.ok) return { entry, ok: false, says: opened.says };
      const read = readTemplate(opened.files);
      return read.ok ? { entry, ok: true, files: opened.files } : { entry, ok: false, says: read.says };
    }),
  );
  return { ok: true, templates };
}
