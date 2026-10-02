import type { TemplateFiles } from "../template/read-template.ts";

const shipped = "../../profile/slp/";

/** The gallery's templates, each with its files. SLP is the one shipped with the plugin, and the only one so far. */
export const TEMPLATES: readonly TemplateFiles[] = [
  new Map(
    Object.entries(
      import.meta.glob<string>("../../profile/slp/**/*", { query: "?raw", import: "default", eager: true }),
    ).map(([path, text]) => [path.slice(shipped.length), text]),
  ),
];
