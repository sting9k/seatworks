import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The profile Seatworks ships, by the name a project runs it under. */
export const SHIPPED = "slp";

/** Where the profiles the Human installed are kept, each in a directory of its name (TEMPLATE.md). */
export const profilesDir = (stateRoot: string) => join(stateRoot, "profiles");

/**
 * The directory of a profile by its name: one installed under that name, or the one shipped. An installed profile
 * of the shipped one's name stands in its place, so the shipped way of working is changed without a fork.
 */
export function profilePath(pluginDir: string, stateRoot: string, name: string): string | null {
  const installed = join(profilesDir(stateRoot), name);
  if (existsSync(join(installed, "profile.yaml"))) return installed;
  return name === SHIPPED ? join(pluginDir, "profile", SHIPPED) : null;
}

export type Listed = { readonly name: string; readonly title: string; readonly description: string };

/** Every profile a project may be attached with: the shipped one, and each installed. */
export function listProfiles(pluginDir: string, stateRoot: string): Listed[] {
  const dir = profilesDir(stateRoot);
  const installed = existsSync(dir)
    ? readdirSync(dir).filter((name) => existsSync(join(dir, name, "profile.yaml")))
    : [];
  return [...new Set([SHIPPED, ...installed])].sort().map((name) => {
    const about = aboutOf(join(profilePath(pluginDir, stateRoot, name)!, "template.json"));
    return { name, title: about.name ?? name, description: about.description ?? "" };
  });
}

/** What a profile's `template.json` calls it, when it has one that reads; the plugin needs nothing else of the file. */
function aboutOf(path: string): { name?: string; description?: string } {
  if (!existsSync(path)) return {};
  try {
    const about = JSON.parse(readFileSync(path, "utf8")) as { name?: unknown; description?: unknown };
    return {
      ...(typeof about.name === "string" ? { name: about.name } : {}),
      ...(typeof about.description === "string" ? { description: about.description } : {}),
    };
  } catch {
    // A template.json that is not JSON names nothing; the profile is still listed by its directory.
    return {};
  }
}
