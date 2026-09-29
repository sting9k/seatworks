import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "..", "install.sh");

test("installing again with --ref says the ref was not used, rather than doing nothing silently", () => {
  const bin = mkdtempSync(join(tmpdir(), "sw-bin-"));
  // A stand-in for Paseo's command line that has Seatworks installed already.
  writeFileSync(
    join(bin, "paseo"),
    '#!/bin/sh\ncase "$1" in --version) echo 0.10.1 ;; plugin) [ "$2" = update ] && echo "current" ;; esac\nexit 0\n',
  );
  chmodSync(join(bin, "paseo"), 0o755);
  const out = execFileSync("sh", [script, "--ref", "rebuild"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
  });
  assert.match(out, /already installed/);
  assert.match(out, /--ref .*not used/);
});
