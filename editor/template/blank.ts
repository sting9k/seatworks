import type { Role } from "../../shared/contracts/profile.ts";
import { installName } from "../../shared/contracts/template.ts";
import type { TemplateFiles } from "./read-template.ts";
import { promptSkeleton } from "./skeletons.ts";
import { toolsFollowing } from "./tool-groups.ts";

/** What the one role of a new template is called until its author names it. */
const FIRST = "first";

/** A template started from nothing: one role the Human works with, its prompt a skeleton, and nothing else. */
export function blankTemplate(
  name: string,
): { readonly ok: true; readonly files: TemplateFiles } | { readonly ok: false; readonly says: string } {
  if (installName(name) === "")
    return { ok: false, says: `a template's name needs a letter or digit to install it under: ${name} has none` };
  const role: Role = {
    name: FIRST,
    root: true,
    delegates: false,
    writes: false,
    reading: false,
    watches: false,
    humanDoor: true,
    spawns: new Set(),
    speaksTo: new Set(["human"]),
    tools: new Set(),
    models: [],
  };
  const prompt = `roles/${FIRST}.md`;
  const profile = [
    "roles:",
    `  ${FIRST}:`,
    "    root: true",
    "    humanDoor: true",
    "    speaksTo: [human]",
    `    prompt: ${prompt}`,
    `    tools: [${[...toolsFollowing(role)].join(", ")}]`,
    "",
  ].join("\n");
  const about = { name: name.trim(), description: "One role that works with the Human.", tags: [] };
  return {
    ok: true,
    files: new Map([
      ["template.json", `${JSON.stringify(about, null, 2)}\n`],
      ["profile.yaml", profile],
      [prompt, promptSkeleton(FIRST)],
    ]),
  };
}
