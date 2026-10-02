import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { galleryOf, loadGallery } from "../../editor/template/gallery.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Gallery: template directories in, what a page lists out.

const repo = join(import.meta.dirname, "../..");
const crew = () =>
  new Map([
    ...slpFiles(),
    ["template.json", JSON.stringify({ name: "Night Crew", description: "For the night shift.", tags: ["night"] })],
  ]);
const twoRoots = () =>
  new Map([
    ...slpFiles(),
    ["profile.yaml", slpFiles().get("profile.yaml")!.replace("  lead:\n", "  lead:\n    root: true\n")],
  ]);
const from = (files: ReadonlyMap<string, string>) => (file: string) => Promise.resolve(files.get(file) ?? null);

test("a gallery built from template directories lists each by its directory's name, and a page reads back the very files", async () => {
  const built = galleryOf(
    new Map([
      ["slp", slpFiles()],
      ["night-crew", crew()],
    ]),
  );
  assert.deepEqual(built.refused, []);
  assert.deepEqual([...built.files.keys()].sort(), ["index.json", "night-crew.template.json", "slp.template.json"]);

  const read = await loadGallery(from(built.files));

  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.deepEqual(
    read.templates.map(({ entry }) => `${entry.id}: ${entry.name} [${entry.tags.join(",")}]`),
    ["night-crew: Night Crew [night]", "slp: SLP [team,lanes,review]"],
  );
  const slp = read.templates.find(({ entry }) => entry.id === "slp")!;
  assert.ok(slp.ok);
  assert.deepEqual([...slp.files].sort(), [...slpFiles()].sort());
});

test("a template that does not load, or whose directory is not a name to install under, is left out of the gallery and said why", () => {
  const built = galleryOf(
    new Map([
      ["slp", slpFiles()],
      ["broken", twoRoots()],
      ["Night Crew", crew()],
    ]),
  );

  assert.deepEqual(
    built.refused.map(({ id }) => id),
    ["broken", "Night Crew"],
  );
  assert.match(built.refused[0]!.says, /exactly one role must be `root`/);
  assert.match(built.refused[1]!.says, /lower-case letters, digits and dashes/);
  assert.deepEqual([...built.files.keys()].sort(), ["index.json", "slp.template.json"]);
});

test("a page says why when there is no gallery beside it, when the index is wrong, and on the card of a template whose file is gone or changed", async () => {
  const none = await loadGallery(() => Promise.resolve(null));
  assert.ok(!none.ok);
  assert.match(none.says, /no gallery was built beside this page/);

  const wrong = await loadGallery(from(new Map([["index.json", JSON.stringify({ templates: [{ id: "slp" }] })]])));
  assert.ok(!wrong.ok);
  assert.match(wrong.says, /the gallery's index is wrong/);

  const built = new Map(
    galleryOf(
      new Map([
        ["slp", slpFiles()],
        ["night-crew", crew()],
      ]),
    ).files,
  );
  built.delete("night-crew.template.json");
  built.set("slp.template.json", JSON.stringify({ files: { "profile.yaml": "roles: {}" } }));
  const read = await loadGallery(from(built));
  assert.ok(read.ok);
  const said = read.templates.map((listed) => `${listed.entry.id}: ${listed.ok ? "opens" : listed.says}`);
  assert.match(said[0]!, /^night-crew: night-crew\.template\.json is not in the gallery$/);
  assert.match(said[1]!, /^slp: a template needs template\.json/);
});

test("the build command writes a gallery from a directory of template directories, and fails naming a template that does not load", () => {
  const sources = mkdtempSync(join(tmpdir(), "sw-gallery-src-"));
  cpSync(join(repo, "profile", "slp"), join(sources, "slp"), { recursive: true });
  const out = join(mkdtempSync(join(tmpdir(), "sw-gallery-out-")), "gallery");
  const command = ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", join(repo, "bin", "gallery.ts")];

  execFileSync(process.execPath, [...command, out, sources]);
  assert.deepEqual(readdirSync(out).sort(), ["index.json", "slp.template.json"]);
  const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as { templates: { id: string }[] };
  assert.deepEqual(
    index.templates.map((entry) => entry.id),
    ["slp"],
  );

  mkdirSync(join(sources, "broken"));
  writeFileSync(join(sources, "broken", "profile.yaml"), "roles: {}\n");
  const failed = spawnSync(process.execPath, [...command, out, sources], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /broken is left out: /);
  assert.deepEqual(readdirSync(out).sort(), ["index.json", "slp.template.json"]);
});
