import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Writes the `git` launcher agents find first on PATH, pointing at this Node and the shim script; returns its dir. */
export function installShim(root: string, script: string): string {
  const dir = join(root, "bin");
  mkdirSync(dir, { recursive: true });
  const node = process.execPath;
  if (process.platform === "win32") {
    writeFileSync(join(dir, "git.cmd"), `@"${node}" --experimental-strip-types --no-warnings "${script}" %*\r\n`);
  } else {
    const launcher = join(dir, "git");
    writeFileSync(launcher, `#!/bin/sh\nexec "${node}" --experimental-strip-types --no-warnings "${script}" "$@"\n`);
    chmodSync(launcher, 0o755);
  }
  return dir;
}
