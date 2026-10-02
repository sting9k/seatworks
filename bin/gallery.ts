import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { galleryOf } from "../editor/template/gallery.ts";
import { filesUnder } from "../server/profile/template-files.ts";

/** `gallery.ts <out> <dir>...`: builds a gallery, and fails naming each template that does not load. */

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
