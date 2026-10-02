import type { TemplateFiles } from "./read-template.ts";

/** A template as the one file it is shared as, which `shared/contracts/template.ts` reads back. */
export function packed(files: TemplateFiles): string {
  const byPath = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ files: byPath }, null, 2)}\n`;
}
