import { installName } from "../../shared/contracts/template.ts";
import { packed } from "../template/pack.ts";
import type { TemplateFiles } from "../template/read-template.ts";

/** The files of a folder a person picked, by their path inside it; a hidden file is left out. */
export async function filesOfFolder(picked: FileList): Promise<TemplateFiles> {
  const files = new Map<string, string>();
  for (const file of picked) {
    const [, ...within] = file.webkitRelativePath.split("/");
    if (within.some((part) => part.startsWith("."))) continue;
    files.set(within.join("/"), await file.text());
  }
  return files;
}

/** Hands the person the template as the one file it is shared as. */
export function download(name: string, files: TemplateFiles): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([packed(files)], { type: "application/json" }));
  link.download = `${installName(name)}.template.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
