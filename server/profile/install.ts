import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hostOf, variablesNamed } from "../../shared/contracts/profile.ts";
import type { TemplateOffer, TemplateSource } from "../../shared/contracts/rpc.ts";
import { installName, packed, unpacked } from "../../shared/contracts/template.ts";
import { loadReflex } from "../satellites/reflex/config.ts";
import { type Has, namedBy, there } from "./agents.ts";
import { type Bundle, loadBundle } from "./bundle.ts";
import { presetFiles } from "./presets.ts";
import { profilesDir } from "./profiles.ts";

/** What installing a template would bring; its `hash` is of the file as read, and no other file is installed. */
type Offer = TemplateOffer;

type Failed = { readonly ok: false; readonly says: string };
type Staged = { readonly ok: true; readonly offer: Offer; readonly dir: string };

/** The plugin's directory, the state root and the environment a template is installed against. */
type Where = { readonly pluginDir: string; readonly stateRoot: string; readonly env: NodeJS.ProcessEnv };

/** A template's files and the text its hash is of: a shared file as it is, one that comes with the plugin packed. */
function sourced(
  pluginDir: string,
  from: TemplateSource,
): { ok: true; files: ReadonlyMap<string, string>; text: string } | Failed {
  if ("preset" in from) {
    const files = presetFiles(pluginDir, from.preset);
    if (files === null) return { ok: false, says: `no template named ${from.preset} comes with Seatworks` };
    return { ok: true, files, text: packed(files) };
  }
  if (!existsSync(from.path)) return { ok: false, says: `there is no file at ${from.path}` };
  const text = readFileSync(from.path, "utf8");
  const read = unpacked(text);
  return read.ok ? { ok: true, files: read.files, text } : read;
}

/** Reads a template, unpacks it aside and loads it; the directory is the caller's to install or remove. */
function staged({ pluginDir, stateRoot, env }: Where, from: TemplateSource, has: readonly Has[]): Staged | Failed {
  const read = sourced(pluginDir, from);
  if (!read.ok) return read;
  const { text } = read;
  const about = aboutOf(read.files.get("template.json"));
  if (about === null) return { ok: false, says: "its template.json does not say its name" };
  const name = installName(about.name);
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
      agentProfiles: namedBy(bundle).map((named) => ({ name: named, there: there(has, named) })),
      servers: [...servers].map(([server, how]) => ({
        name: server,
        runs: how.type === "stdio" ? [how.command, ...how.args].join(" ") : how.url,
      })),
      variables: variablesNamed([...servers.values()]).map((variable) => ({
        name: variable,
        there: (env[variable] ?? "") !== "",
      })),
      classifier: Object.values(bundle.classifier ?? {}).map((route) => ({
        host: hostOf(route.endpoint) ?? route.endpoint,
        model: route.model,
      })),
    },
  };
}

/** What installing the template would bring; nothing of it is kept. */
export function offerOf(
  where: Where,
  from: TemplateSource,
  has: readonly Has[],
): { readonly ok: true; readonly offer: Offer } | Failed {
  const made = staged(where, from, has);
  if (!made.ok) return made;
  rmSync(made.dir, { recursive: true, force: true });
  return { ok: true, offer: made.offer };
}

/** Installs the template under its name; one that changed since the offer of `hash` is not installed. */
export function install(
  where: Where,
  from: TemplateSource,
  hash: string,
  has: readonly Has[],
): { readonly ok: true; readonly offer: Offer } | Failed {
  const made = staged(where, from, has);
  if (!made.ok) return made;
  if (made.offer.hash !== hash) {
    rmSync(made.dir, { recursive: true, force: true });
    return { ok: false, says: "the template changed since it was read: look at it again before installing it" };
  }
  const into = join(profilesDir(where.stateRoot), made.offer.name);
  mkdirSync(profilesDir(where.stateRoot), { recursive: true });
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
