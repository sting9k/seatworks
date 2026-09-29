import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const root = join(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const code = [...files("shared"), ...files("server"), ...files("bin"), "index.server.ts"];

test("no role of the profile is named in the plugin's code: roles are data, and a renamed profile behaves the same", () => {
  const roles = Object.keys(
    (parse(readFileSync(join(root, "profile/slp/profile.yaml"), "utf8")) as { roles: Record<string, unknown> }).roles,
  );
  const named = code.flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8");
    return roles
      .filter((role) => new RegExp(`["'\`]${role}["'\`]`).test(text))
      .map((role) => `${relative(root, join(root, file))}: ${role}`);
  });
  assert.deepEqual(named, []);
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
