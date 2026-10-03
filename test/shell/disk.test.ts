import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sizeOf } from "../../server/core/disk.ts";

test("a folder takes the bytes of every file under it, a link not followed, and one that is gone takes none", async () => {
  const outside = mkdtempSync(join(tmpdir(), "sw-disk-outside-"));
  writeFileSync(join(outside, "big.txt"), "x".repeat(4000));
  const dir = mkdtempSync(join(tmpdir(), "sw-disk-"));
  mkdirSync(join(dir, "src/deep"), { recursive: true });
  writeFileSync(join(dir, "a.txt"), "x".repeat(10));
  writeFileSync(join(dir, "src/deep/b.txt"), "x".repeat(20));
  symlinkSync(join(outside, "big.txt"), join(dir, "linked.txt"));
  symlinkSync(outside, join(dir, "linked"));

  assert.equal(await sizeOf(dir), 30);
  assert.equal(await sizeOf(join(dir, "never-made")), 0);
});
