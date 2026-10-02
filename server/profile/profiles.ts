import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Where the profiles the Human installed are kept, each in a directory of its name (TEMPLATE.md). */
export const profilesDir = (stateRoot: string) => join(stateRoot, "profiles");

/** An installed profile's directory by its name; null when none of that name is installed. */
export function profilePath(stateRoot: string, name: string): string | null {
  const installed = join(profilesDir(stateRoot), name);
  return existsSync(join(installed, "profile.yaml")) ? installed : null;
}

export type Listed = { readonly name: string; readonly title: string; readonly description: string };

/** Every template directory under `dir`, by its name, with what its `template.json` calls it. */
export function templatesIn(dir: string): Listed[] {
  const names = existsSync(dir) ? readdirSync(dir).filter((name) => existsSync(join(dir, name, "profile.yaml"))) : [];
  return names.sort().map((name) => {
    const about = aboutOf(join(dir, name, "template.json"));
    return { name, title: about.name ?? name, description: about.description ?? "" };
  });
}

/** Every profile a project may be attached with: each the Human installed. */
export const listProfiles = (stateRoot: string): Listed[] => templatesIn(profilesDir(stateRoot));

/** Removes an installed profile; only a listed name is joined into a path, since it comes from the surface. */
export function removeProfile(stateRoot: string, name: string): boolean {
  if (!listProfiles(stateRoot).some((listed) => listed.name === name)) return false;
  rmSync(join(profilesDir(stateRoot), name), { recursive: true, force: true });
  return true;
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
