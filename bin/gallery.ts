import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { galleryOf } from "../editor/template/gallery.ts";
import { filesUnder } from "./template-files.ts";

/**
 * Builds a gallery (TEMPLATE.md, The gallery): `gallery.ts <out> <dir>...`, each `<dir>` holding template
 * directories. It writes the index and every template as the one file it is shared as, and fails, saying which and
 * why, when a template does not load: that is the check a template passes to be published.
 */

const [out, ...dirs] = process.argv.slice(2);
if (out === undefined || dirs.length === 0) {
  process.stderr.write("usage: gallery.ts <out> <directory of template directories>...\n");
  process.exit(2);
}
const templates = new Map(
  dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => existsSync(join(dir, name, "profile.yaml")))
      .map((name): [string, Map<string, string>] => [name, new Map(filesUnder(join(dir, name)))]),
  ),
);
const built = galleryOf(templates);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [file, text] of built.files) writeFileSync(join(out, file), text);
process.stdout.write(`${built.files.size - 1} template${built.files.size === 2 ? "" : "s"} in ${out}\n`);
for (const { id, says } of built.refused) process.stderr.write(`${id} is left out: ${says}\n`);
if (built.refused.length > 0) process.exit(1);
