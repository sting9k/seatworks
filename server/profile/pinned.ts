import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ProjectTemplate } from "../../shared/contracts/rpc.ts";
import { loadReflex } from "../satellites/reflex/config.ts";
import { hashOf, loadBundle } from "./bundle.ts";
import { profilePath } from "./profiles.ts";

/** A project's own copy of its profile's files, under their hash: what it runs, whatever is installed since. */
export const pinnedDir = (projectDir: string, hash: string) => join(projectDir, "profile", hash);

/** Takes the installed profile's files for a project and says their hash; one that does not load is not taken. */
export function pin(
  stateRoot: string,
  projectDir: string,
  profile: string,
): { readonly ok: true; readonly hash: string } | { readonly ok: false; readonly says: string } {
  const installed = profilePath(stateRoot, profile);
  if (installed === null) return { ok: false, says: `the template ${profile} is not installed on this machine` };
  let hash: string;
  try {
    const bundle = loadBundle(installed);
    loadReflex(installed, bundle.asks);
    hash = bundle.hash;
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, says: `the installed ${profile} does not load: ${why}` };
  }
  const dir = pinnedDir(projectDir, hash);
  // A copy of this hash that still holds these very files is kept; one changed by hand since is made again.
  if (existsSync(dir) && hashOf(dir) === hash) return { ok: true, hash };
  const part = `${dir}.part`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(join(projectDir, "profile"), { recursive: true });
  cpSync(installed, part, { recursive: true });
  rmSync(dir, { recursive: true, force: true });
  renameSync(part, dir);
  return { ok: true, hash };
}

/** How a project's copy stands beside what is installed, read off the files' hashes alone. */
export function templateOf(stateRoot: string, projectDir: string, profile: string, hash: string): ProjectTemplate {
  const installed = profilePath(stateRoot, profile);
  const state = installed === null ? "uninstalled" : hashOf(installed) === hash ? "current" : "behind";
  return { name: profile, hash, state, edited: hashOf(pinnedDir(projectDir, hash)) !== hash };
}
