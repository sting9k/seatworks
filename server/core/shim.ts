import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Writes the `git` launcher agents find first on PATH, pointing at this Node and the shim script; returns its dir. */
export function installShim(root: string, script: string): string {
  const dir = join(root, "bin");
  mkdirSync(dir, { recursive: true });
  const node = process.execPath;
  // Under Paseo's desktop app the daemon, and so this worker, is the Electron binary; the flag runs it as Node.
  if (process.platform === "win32") {
    writeFileSync(
      join(dir, "git.cmd"),
      `@set "ELECTRON_RUN_AS_NODE=1"\r\n@"${node}" --experimental-strip-types --no-warnings "${script}" %*\r\n`,
    );
  } else {
    const launcher = join(dir, "git");
    writeFileSync(
      launcher,
      `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${node}" --experimental-strip-types --no-warnings "${script}" "$@"\n`,
    );
    chmodSync(launcher, 0o755);
  }
  return dir;
}

/** Writes what a seated agent's hook runs between two of its steps: silent, and no process started, while nothing waits. */
export function installMail(dir: string, script: string): void {
  if (process.platform === "win32") return;
  const launcher = join(dir, "seatworks-mail");
  writeFileSync(
    launcher,
    `#!/bin/sh\n[ -s "$SEATWORKS_MAIL" ] || exit 0\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" --experimental-strip-types --no-warnings "${script}" "$@"\n`,
  );
  chmodSync(launcher, 0o755);
}
