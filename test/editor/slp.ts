import { join } from "node:path";
import type { TemplateFiles } from "../../editor/template/read-template.ts";
import { filesUnder } from "../../server/profile/template-files.ts";

/** SLP's files as the page is handed them: each path inside it, with its text. */
export const slpFiles = (): TemplateFiles => new Map(filesUnder(join(import.meta.dirname, "../../templates/slp")));
