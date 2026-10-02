import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { CODE_MOMENTS } from "../shared/contracts/reflex.ts";

const root = join(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const code = [...files("shared"), ...files("server"), ...files("bin"), "index.server.ts"];

/** What a file of the template that comes with the plugin writes. */
const written = (file: string) => parse(readFileSync(join(root, "templates/slp", file), "utf8")) as unknown;

test("no role, moment or question of the profile is named in the plugin's code, even in what it says: each is data, and a renamed profile behaves the same", () => {
  const counted: readonly string[] = CODE_MOMENTS;
  const roles = [
    ...Object.keys((written("profile.yaml") as { roles: Record<string, unknown> }).roles),
    ...Object.keys((written("reflex.yaml") as { questions: Record<string, unknown> }).questions),
    // The moments counted in code are switched on by names the plugin gives them: those are its own.
    ...Object.keys((written("watch.yaml") as { moments: Record<string, unknown> }).moments).filter(
      (moment) => !counted.includes(moment),
    ),
  ];
  const named = code.flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return [...text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].flatMap(([, , words]) => {
      const said = words!.replace(/\$\{[^}]*\}/g, "");
      return roles
        .filter((role) => new RegExp(`\\b${role}s?\\b`, "i").test(said))
        .map((role) => `${file}: ${role}: ${said}`);
    });
  });
  assert.deepEqual(named, []);
});

test("the Human's surface writes no role's name of its own: it shows the names the project's profile gives", () => {
  const roles = Object.keys((written("profile.yaml") as { roles: Record<string, unknown> }).roles);
  const named = [...files("client"), "index.client.tsx"].flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return roles.filter((role) => new RegExp(`\\b${role}s?\\b`, "i").test(text)).map((role) => `${file}: ${role}`);
  });
  assert.deepEqual(named, []);
});

/** What Paseo's plugin compiler supplies; every other package a bundle imports must be installed by the build. */
const SUPPLIED = /^(@getpaseo\/plugin(\/.*)?|zod|react|react-native|@tanstack\/react-query)$|^node:/;

test("every package a bundle Paseo compiles imports, types included, is installed by the build or supplied by Paseo", () => {
  const { dependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  const seen = new Set<string>();
  const missing = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, spec] of readFileSync(join(root, file), "utf8").matchAll(
      /^(?:import|export)\b[^;"'`]*?\bfrom "([^"]+)"/gm,
    )) {
      if (spec!.startsWith(".")) visit(relative(root, join(root, file, "..", spec!)));
      else if (!SUPPLIED.test(spec!)) {
        const name = spec!
          .split("/")
          .slice(0, spec!.startsWith("@") ? 2 : 1)
          .join("/");
        if (!(name in dependencies)) missing.add(`${name} (${file})`);
      }
    }
  };
  visit("index.server.ts");
  visit("index.client.tsx");
  assert.deepEqual([...missing], []);
});

test("only the agent host, the bridge and the shared settings definition import Paseo", () => {
  const allowed = [
    /^server\/satellites\/agent-host\//,
    /^server\/bridge\//,
    /^index\.server\.ts$/,
    /^shared\/contracts\/settings\.ts$/,
  ];
  const importing = code.filter((file) => /from "@getpaseo\//.test(readFileSync(join(root, file), "utf8")));
  assert.deepEqual(
    importing.filter((file) => !allowed.some((a) => a.test(file))),
    [],
  );
});
