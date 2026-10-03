import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { galleryOf } from "../editor/template/gallery.ts";
import { filesUnder } from "../server/profile/template-files.ts";

/** `gallery.ts <out> <dir>...`: builds a gallery, and fails naming each template that does not load. */

const [out, ...dirs] = process.argv.slice(2);
if (out === undefined || dirs.length === 0) {
  process.stderr.write("usage: gallery.ts <out> <directory of template directories>...\n");
  process.exit(2);
}
const found = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "profile.yaml")))
    .map((name) => ({ name, dir })),
);
// One name is one template to install: two directories that both hold it would list whichever was read last.
const twice = found.filter((one, at) => found.findIndex((other) => other.name === one.name) < at);
const templates = new Map(
  found
    .filter((one) => !twice.some((other) => other.name === one.name))
    .map(({ name, dir }): [string, Map<string, string>] => [name, new Map(filesUnder(join(dir, name)))]),
);
// What is built from the plugin's own templates comes with it; any other directory is where others share theirs.
const own = resolve(import.meta.dirname, "..", "templates");
const comes = new Set(found.filter(({ dir }) => resolve(dir) === own).map(({ name }) => name));
const built = galleryOf(templates, comes);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [file, text] of built.files) writeFileSync(join(out, file), text);
process.stdout.write(`${built.files.size - 1} template${built.files.size === 2 ? "" : "s"} in ${out}\n`);
for (const { id, says } of built.refused) process.stderr.write(`${id} is left out: ${says}\n`);
for (const { name, dir } of twice)
  process.stderr.write(
    `${name} is left out: it is in both ${found.find((one) => one.name === name)!.dir} and ${dir}\n`,
  );
if (built.refused.length + twice.length > 0) process.exit(1);
