import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A state root with SLP installed, as the Human has once they install the template that comes with the plugin. */
export function stateRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  cpSync(join(import.meta.dirname, "../../templates/slp"), join(root, "profiles", "slp"), { recursive: true });
  return root;
}
