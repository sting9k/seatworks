import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** A home directory an agent is pointed at through one variable, as a harness file describes it. */
export type Home = {
  /** The variable the agent reads its home from, such as `PI_CODING_AGENT_DIR`. */
  readonly env: string;
  /** Where the Human's own home is when that variable is unset; `~` is their home directory. */
  readonly from: string;
  /** The Human's files the agent needs, their login among them, linked rather than copied so a refresh reaches both. */
  readonly link: readonly string[];
  /** v3's own files, written as JSON; `{plugin}` in a string is the plugin's directory. */
  readonly files: Readonly<Record<string, unknown>>;
};

/** Lays out the home in `dir` and returns the variable that points an agent at it. Nothing of the Human's is written. */
export function layHome(dir: string, home: Home, pluginDir: string): Record<string, string> {
  mkdirSync(dir, { recursive: true });
  const given = process.env[home.env];
  const from = given && given !== dir ? given : home.from.replace(/^~(?=$|[\\/])/, homedir());
  for (const name of home.link) {
    const target = join(from, name);
    const at = join(dir, name);
    if (existsSync(at) || isLink(at)) rmSync(at, { force: true });
    if (existsSync(target)) symlinkSync(target, at);
  }
  for (const [name, content] of Object.entries(home.files))
    writeFileSync(join(dir, name), `${JSON.stringify(withPlugin(content, pluginDir), null, 2)}\n`);
  return { [home.env]: dir };
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    // Nothing there.
    return false;
  }
}

function withPlugin(value: unknown, pluginDir: string): unknown {
  if (typeof value === "string") return value.replaceAll("{plugin}", pluginDir);
  if (Array.isArray(value)) return value.map((v) => withPlugin(v, pluginDir));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withPlugin(v, pluginDir)]));
  return value;
}
