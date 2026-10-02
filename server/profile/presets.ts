import { join } from "node:path";
import type { Preset } from "../../shared/contracts/rpc.ts";
import { loadBundle } from "./bundle.ts";
import { profilePath, templatesIn } from "./profiles.ts";
import { filesUnder } from "./template-files.ts";

/** Where the templates that come with the plugin are kept: installed like any other, never run from here. */
const presetsDir = (pluginDir: string) => join(pluginDir, "templates");

/** The hash of a profile's files, or null when it does not load. */
function hashAt(dir: string): string | null {
  try {
    return loadBundle(dir).hash;
  } catch {
    // One that does not load matches nothing, which is what its caller compares for.
    return null;
  }
}

/** Each template that comes with the plugin, and whether the Human installed it as it comes. */
export function listPresets(pluginDir: string, stateRoot: string): Preset[] {
  return templatesIn(presetsDir(pluginDir)).map((preset) => {
    const installed = profilePath(stateRoot, preset.name);
    const same = installed !== null && hashAt(installed) === hashAt(join(presetsDir(pluginDir), preset.name));
    return { ...preset, installed: installed === null ? "no" : same ? "same" : "differs" };
  });
}

/** The files of a template that comes with the plugin; null for a name that is not one, so no other path is read. */
export function presetFiles(pluginDir: string, name: string): Map<string, string> | null {
  const listed = templatesIn(presetsDir(pluginDir)).some((preset) => preset.name === name);
  return listed ? new Map(filesUnder(join(presetsDir(pluginDir), name))) : null;
}
