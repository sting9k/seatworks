import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("a template that does not load, or whose directory is not the name it is installed under, is left out of the gallery and said why", () => {
  const built = galleryOf(
    new Map([
      ["slp", slpFiles()],
      ["broken", twoRoots()],
      ["crew", crew()],
    ]),
  );

  assert.deepEqual(
    built.refused.map(({ id }) => id),
    ["broken", "crew"],
  );
  assert.match(built.refused[0]!.says, /exactly one role must be `root`/);
  assert.match(built.refused[1]!.says, /its name, Night Crew, installs it as night-crew/);
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
  cpSync(join(repo, "templates", "slp"), join(sources, "slp"), { recursive: true });
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

test("the build command takes several directories: the templates of each are listed, and one both hold is left out, saying where", () => {
  const ours = mkdtempSync(join(tmpdir(), "sw-gallery-ours-"));
  cpSync(join(repo, "templates", "slp"), join(ours, "slp"), { recursive: true });
  const theirs = mkdtempSync(join(tmpdir(), "sw-gallery-theirs-"));
  for (const [path, text] of crew()) {
    mkdirSync(dirname(join(theirs, "night-crew", path)), { recursive: true });
    writeFileSync(join(theirs, "night-crew", path), text);
  }
  const out = join(mkdtempSync(join(tmpdir(), "sw-gallery-out-")), "gallery");
  const command = ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", join(repo, "bin", "gallery.ts")];

  execFileSync(process.execPath, [...command, out, ours, theirs]);
  assert.deepEqual(readdirSync(out).sort(), ["index.json", "night-crew.template.json", "slp.template.json"]);

  cpSync(join(ours, "slp"), join(theirs, "slp"), { recursive: true });
  const failed = spawnSync(process.execPath, [...command, out, ours, theirs], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.ok(
    failed.stderr.includes(`slp is left out: it is in both ${ours} and ${theirs}`),
    `it says where each is: ${failed.stderr}`,
  );
  assert.deepEqual(readdirSync(out).sort(), ["index.json", "night-crew.template.json"]);
});

test("the page built asks for its scripts, styles and type beside itself, so it is served from any path and calls no other host", () => {
  const out = mkdtempSync(join(tmpdir(), "sw-page-"));
  const vite = join(repo, "node_modules", "vite", "bin", "vite.js");
  execFileSync(process.execPath, [vite, "build", join(repo, "editor"), "--outDir", out, "--emptyOutDir"], {
    stdio: "pipe",
  });

  const asked = [...readFileSync(join(out, "index.html"), "utf8").matchAll(/(?:src|href)="([^"]+)"/g)].map(
    (found) => found[1]!,
  );
  assert.ok(asked.length >= 2, asked.join(", "));
  assert.deepEqual(
    asked.filter((path) => !path.startsWith("./")),
    [],
  );

  const beside = readdirSync(join(out, "assets"));
  for (const family of ["red-hat-display", "red-hat-text", "red-hat-mono"])
    assert.ok(
      beside.some((file) => file.startsWith(family) && file.endsWith(".woff2")),
      `${family} is carried with the page: ${beside.join(", ")}`,
    );
  const styles = beside
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(join(out, "assets", file), "utf8"));
  const urls = styles.flatMap((style) => [...style.matchAll(/url\(([^)]+)\)/g)].map((found) => found[1]!));
  assert.deepEqual(
    urls.filter((url) => !url.startsWith("./") && !url.startsWith("data:")),
    [],
    "a style asks for a file beside it, never for one on another host",
  );
});
