import type { Server } from "../../shared/contracts/profile.ts";
import type { Grant } from "./bundle.ts";

/** A variable named in a server's settings, as a profile writes one: `$NAME`. */
const NAMED = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** Every environment variable the servers name, for the Human to see what a profile reads of their machine. */
export function variablesNamed(servers: readonly Server[]): string[] {
  const texts = servers.flatMap((server) =>
    server.type === "stdio"
      ? [server.command, ...server.args, ...Object.values(server.env)]
      : [server.url, ...Object.values(server.headers)],
  );
  return [...new Set(texts.flatMap((text) => [...text.matchAll(NAMED)].map((found) => found[1]!)))].sort();
}

/**
 * A role's servers with each variable they name filled in from the environment, or the first one that names a
 * variable with no value: a server started without what it reads fails where nobody looks.
 */
export function filledIn(
  grants: readonly Grant[],
  env: NodeJS.ProcessEnv,
): { readonly ok: true; readonly grants: readonly Grant[] } | { readonly ok: false; readonly says: string } {
  const filled: Grant[] = [];
  for (const grant of grants) {
    const missing = variablesNamed([grant.server]).find((name) => (env[name] ?? "") === "");
    if (missing !== undefined)
      return { ok: false, says: `the outside server ${grant.name} reads $${missing}, which is not set` };
    const fill = (text: string) => text.replace(NAMED, (_, name: string) => env[name]!);
    const each = (values: Readonly<Record<string, string>>) =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fill(value)]));
    const { server } = grant;
    filled.push({
      ...grant,
      server:
        server.type === "stdio"
          ? { ...server, command: fill(server.command), args: server.args.map(fill), env: each(server.env) }
          : { ...server, url: fill(server.url), headers: each(server.headers) },
    });
  }
  return { ok: true, grants: filled };
}
