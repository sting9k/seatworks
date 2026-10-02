import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TemplateFiles } from "../../editor/template/read-template.ts";

function filesUnder(dir: string, prefix = ""): [string, string][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const within = prefix + name;
    return statSync(path).isDirectory() ? filesUnder(path, `${within}/`) : [[within, readFileSync(path, "utf8")]];
  });
}

/** The shipped template's files as the page is handed them: each path inside it, with its text. */
export const slpFiles = (): TemplateFiles => new Map(filesUnder(join(import.meta.dirname, "../../profile/slp")));
