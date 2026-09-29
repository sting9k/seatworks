import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { checkUpdate } from "../../server/bridge/update-check.ts";

const path = process.env.PATH;
afterEach(() => {
  process.env.PATH = path;
});

/** A `paseo` on PATH that notes what it was asked and prints `answer`, as Paseo's command line prints `--json`. */
function fakeCli(answer: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "sw-cli-"));
  writeFileSync(join(dir, "answer.json"), JSON.stringify(answer));
  writeFileSync(join(dir, "paseo"), `#!/bin/sh\necho "$@" > "${dir}/asked"\ncat "${dir}/answer.json"\n`);
  chmodSync(join(dir, "paseo"), 0o755);
  process.env.PATH = `${dir}:${path ?? ""}`;
  return dir;
}

test("a newer release is shown with its review links and the command that applies it, and nothing is installed", async () => {
  const dir = fakeCli([
    {
      id: "seatworks",
      outcome: "update",
      current: {
        identity: { kind: "git", remote: "sting9k/seatworks", pluginPath: "." },
        currentRevision: "aaa",
      },
      target: { kind: "git", commit: "bbb" },
      links: ["https://github.com/sting9k/seatworks/compare/aaa...bbb"],
      proposal: {},
    },
  ]);
  const check = await checkUpdate("seatworks");
  assert.equal(readFileSync(join(dir, "asked"), "utf8").trim(), "plugin update seatworks --check --json");
  assert.deepEqual(
    { status: check.status, current: check.current, latest: check.latest, links: check.links },
    {
      status: "available",
      current: "aaa",
      latest: "bbb",
      links: ["https://github.com/sting9k/seatworks/compare/aaa...bbb"],
    },
  );
  assert.match(check.text, /`paseo plugin update seatworks`/);
});

test("with no Paseo command line on the daemon's PATH, the Human is told the command to run", async () => {
  process.env.PATH = mkdtempSync(join(tmpdir(), "sw-empty-"));
  const check = await checkUpdate("seatworks");
  assert.equal(check.status, "unknown");
  assert.match(check.text, /`paseo plugin update seatworks --check`/);
});
