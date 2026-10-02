import { join } from "node:path";
import type { TemplateFiles } from "../editor/template/read-template.ts";
import { filesUnder } from "../server/profile/template-files.ts";

/** A small template that shares no role with SLP: each path inside it, with its text. */
export const pairFiles = (): TemplateFiles => new Map(filesUnder(join(import.meta.dirname, "templates/pair")));
