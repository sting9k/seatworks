import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readTemplate } from "../../editor/template/read-template.ts";
import { unpacked } from "../../shared/contracts/template.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: a template's directory checked and packed from a terminal,
// as whoever writes one without the editor does, a person or an agent.

const repo = join(import.meta.dirname, "../..");
const run = (...args: string[]) =>
  spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", join(repo, "bin", "template.ts"), ...args],
    { encoding: "utf8" },
  );

/** SLP's directory, copied to be changed; `change` rewrites one of its files. */
function copyOf(change: Record<string, (text: string) => string> = {}): string {
  const dir = join(mkdtempSync(join(tmpdir(), "sw-template-")), "night-crew");
  cpSync(join(repo, "templates", "slp"), dir, { recursive: true });
  writeFileSync(join(dir, "template.json"), JSON.stringify({ name: "Night Crew", description: "For the night." }));
  for (const [path, rewrite] of Object.entries(change))
    writeFileSync(join(dir, path), rewrite(readFileSync(join(dir, path), "utf8")));
  return dir;
}

test("the check command on a template that loads says what it installs as and what it needs of the machine, with no note", () => {
  const checked = run("check", copyOf());

  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Night Crew loads\. It installs as night-crew\./);
  assert.match(checked.stdout, /Paseo agent profiles it needs: slp-lead, slp-peer, /);
  assert.match(checked.stdout, /No note\./);
});

test("the check command prints a note and still passes; on a template that does not load it fails, saying why", () => {
  const noted = run(
    "check",
    copyOf({ "profile.yaml": (text) => text.replace("spawns: [peer, reviewer]", "spawns: [peer]") }),
  );
  assert.equal(noted.status, 0, noted.stderr);
  assert.match(noted.stdout, /1 note, which stop nothing:\n {2}role:reviewer: no role seats it/);

  const misspelt = run(
    "check",
    copyOf({
      "profile.yaml": (text) =>
        text.replace("hand_back, run_checks, send_message", "handback, run_checks, send_message"),
    }),
  );
  assert.equal(misspelt.status, 1);
  assert.match(misspelt.stderr, /it does not load: role peer is given the tool handback/);
  assert.equal(misspelt.stdout, "");
});

test("the pack command writes the one file a template is shared as, holding the directory's very files", () => {
  const dir = copyOf();
  const file = join(mkdtempSync(join(tmpdir(), "sw-packed-")), "night-crew.template.json");

  const packed = run("pack", dir, file);

  assert.equal(packed.status, 0, packed.stderr);
  const read = unpacked(readFileSync(file, "utf8"));
  assert.ok(read.ok, read.ok ? "" : read.says);
  assert.equal(read.files.get("roles/peer.md"), readFileSync(join(dir, "roles", "peer.md"), "utf8"));
  assert.ok(readTemplate(read.files).ok);

  const never = join(mkdtempSync(join(tmpdir(), "sw-packed-")), "broken.template.json");
  const refused = run("pack", copyOf({ "profile.yaml": () => "roles: {}\n" }), never);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /it does not load: /);
  assert.equal(existsSync(never), false);
});
