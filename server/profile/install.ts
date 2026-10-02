import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { variablesNamed } from "../../shared/contracts/profile.ts";
import type { TemplateOffer } from "../../shared/contracts/rpc.ts";
import { unpacked } from "../../shared/contracts/template.ts";
import { loadReflex } from "../satellites/reflex/config.ts";
import { type Bundle, loadBundle } from "./bundle.ts";
import { profilesDir } from "./profiles.ts";

/**
 * What installing a shared template would bring to this machine, for the Human to read before it is theirs. Its
 * `hash` is of the file as it was read: installing asks for the same file again, and takes no other.
 */
type Offer = TemplateOffer;

type Failed = { readonly ok: false; readonly says: string };
type Staged = { readonly ok: true; readonly offer: Offer; readonly dir: string };

/**
 * Reads a shared template from a file on this machine, unpacks it aside and loads it as the plugin would. Nothing is
 * put where a project could run it. The directory it hands back is the caller's to install or remove.
 */
function staged(
  stateRoot: string,
  path: string,
  agentProfiles: readonly string[],
  env: NodeJS.ProcessEnv,
): Staged | Failed {
  if (!existsSync(path)) return { ok: false, says: `there is no file at ${path}` };
  const text = readFileSync(path, "utf8");
  const read = unpacked(text);
  if (!read.ok) return read;
  const about = aboutOf(read.files.get("template.json"));
  if (about === null) return { ok: false, says: "its template.json does not say its name" };
  const name = about.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (name === "") return { ok: false, says: `its name, ${about.name}, has no letter or digit to install it under` };

  mkdirSync(join(stateRoot, "staging"), { recursive: true });
  const dir = mkdtempSync(join(stateRoot, "staging", "template-"));
  for (const [file, body] of read.files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), body);
  }
  let bundle: Bundle;
  try {
    bundle = loadBundle(dir);
    loadReflex(dir, bundle.asks);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    return { ok: false, says: `it does not load: ${error instanceof Error ? error.message : String(error)}` };
  }
  const models = [...new Set([...bundle.profile.roles.values()].flatMap((role) => role.models))].sort();
  const servers = new Map([...bundle.servers.values()].flat().map((grant) => [grant.name, grant.server]));
  return {
    ok: true,
    dir,
    offer: {
      name,
      title: about.name,
      description: about.description,
      hash: createHash("sha256").update(text).digest("hex").slice(0, 16),
      replaces: existsSync(join(profilesDir(stateRoot), name)),
      roles: [...bundle.profile.roles.keys()],
      agentProfiles: models.map((model) => ({ name: model, there: agentProfiles.includes(model) })),
      servers: [...servers].map(([server, how]) => ({
        name: server,
        runs: how.type === "stdio" ? [how.command, ...how.args].join(" ") : how.url,
      })),
      variables: variablesNamed([...servers.values()]).map((variable) => ({
        name: variable,
        there: (env[variable] ?? "") !== "",
      })),
    },
  };
}

/** What installing the template at `path` would bring; nothing of it is kept. */
export function offerOf(
  stateRoot: string,
  path: string,
  agentProfiles: readonly string[],
  env: NodeJS.ProcessEnv,
): { readonly ok: true; readonly offer: Offer } | Failed {
  const made = staged(stateRoot, path, agentProfiles, env);
  if (!made.ok) return made;
  rmSync(made.dir, { recursive: true, force: true });
  return { ok: true, offer: made.offer };
}

/**
 * Installs the template at `path` under its name, in place of one already there. `hash` is the offer the Human
 * agreed to: a file that changed since is not what they read, and is not installed.
 */
export function install(
  stateRoot: string,
  path: string,
  hash: string,
  agentProfiles: readonly string[],
  env: NodeJS.ProcessEnv,
): { readonly ok: true; readonly offer: Offer } | Failed {
  const made = staged(stateRoot, path, agentProfiles, env);
  if (!made.ok) return made;
  if (made.offer.hash !== hash) {
    rmSync(made.dir, { recursive: true, force: true });
    return { ok: false, says: "the file changed since it was read: look at it again before installing it" };
  }
  const into = join(profilesDir(stateRoot), made.offer.name);
  mkdirSync(profilesDir(stateRoot), { recursive: true });
  rmSync(into, { recursive: true, force: true });
  renameSync(made.dir, into);
  return { ok: true, offer: made.offer };
}

function aboutOf(text: string | undefined): { name: string; description: string } | null {
  if (text === undefined) return null;
  try {
    const about = JSON.parse(text) as { name?: unknown; description?: unknown };
    if (typeof about.name !== "string" || about.name.trim() === "") return null;
    return { name: about.name, description: typeof about.description === "string" ? about.description : "" };
  } catch {
    // A template.json that is not JSON names nothing, which is the refusal its caller gives.
    return null;
  }
}
