import { existsSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { alwaysOnWords, notesOf } from "../editor/template/checks.ts";
import { readTemplate } from "../editor/template/read-template.ts";
import { loadBundle } from "../server/profile/bundle.ts";
import { loadReflex } from "../server/satellites/reflex/config.ts";
import { variablesNamed } from "../shared/contracts/profile.ts";
import { installName, packed } from "../shared/contracts/template.ts";
import { filesUnder } from "../server/profile/template-files.ts";

/** `check <dir>` and `pack <dir> <file>`: loads a template as the editor and the plugin do, and prints its notes. */

const USAGE = "usage: template.ts check <dir> | template.ts pack <dir> <file>\n";
const say = (line: string) => process.stdout.write(`${line}\n`);

function fail(line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

const [command, given, out] = process.argv.slice(2);
if ((command !== "check" && command !== "pack") || given === undefined || (command === "pack" && out === undefined)) {
  process.stderr.write(USAGE);
  process.exit(2);
}
const dir = resolve(given);
if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`${given} is not a directory`);

const files = new Map(filesUnder(dir));
const read = readTemplate(files);
if (!read.ok) fail(`it does not load: ${read.says}`);
const template = read.template;
const name = installName(template.about.name);
if (name === "") fail(`its name, ${template.about.name}, has no letter or digit to install it under`);
try {
  const bundle = loadBundle(dir);
  loadReflex(dir, bundle.asks);
} catch (error) {
  fail(`the plugin does not load it: ${error instanceof Error ? error.message : String(error)}`);
}

const roles = [...template.profile.roles.values()];
const agentProfiles = [...new Set(roles.flatMap((role) => role.models))].sort();
const variables = variablesNamed(Object.values(template.file.servers));
say(`${template.about.name} loads. It installs as ${name}.`);
say(
  `  roles: ${roles.map((role) => `${role.name} (${alwaysOnWords(template, role.name)} words every turn)`).join(", ")}`,
);
say(`  Paseo agent profiles it needs: ${agentProfiles.join(", ") || "none named"}`);
if (variables.length > 0) say(`  variables its servers read: ${variables.join(", ")}`);
const notes = notesOf(template, template);
say(notes.length === 0 ? "No note." : `${notes.length} note${notes.length === 1 ? "" : "s"}, which stop nothing:`);
for (const note of notes) say(`  ${note.node}: ${note.says}`);

if (command === "pack" && out !== undefined) {
  writeFileSync(resolve(out), packed(files));
  say(`Packed into ${out}: install it from the Seatworks page in Paseo.`);
}
