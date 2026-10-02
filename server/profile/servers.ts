import { VARIABLE, variablesNamed } from "../../shared/contracts/profile.ts";
import type { Grant } from "./bundle.ts";

/** A role's servers with each variable filled in, or the first unset one: a server lacking it fails unseen. */
export function filledIn(
  grants: readonly Grant[],
  env: NodeJS.ProcessEnv,
): { readonly ok: true; readonly grants: readonly Grant[] } | { readonly ok: false; readonly says: string } {
  const filled: Grant[] = [];
  for (const grant of grants) {
    const missing = variablesNamed([grant.server]).find((name) => (env[name] ?? "") === "");
    if (missing !== undefined)
      return { ok: false, says: `the outside server ${grant.name} reads $${missing}, which is not set` };
    const fill = (text: string) => text.replace(VARIABLE, (_, name: string) => env[name]!);
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
