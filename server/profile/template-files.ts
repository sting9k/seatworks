import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** A template directory's files, each by its path inside it with its text; a hidden file or folder is left out. */
export function filesUnder(dir: string, prefix = ""): [string, string][] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".")) return [];
    const path = join(dir, name);
    const within = prefix + name;
    return statSync(path).isDirectory() ? filesUnder(path, `${within}/`) : [[within, readFileSync(path, "utf8")]];
  });
}
