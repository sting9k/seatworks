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
  /** Seatworks' own files: a string is written as it is, anything else as JSON; a `{name}` in a string is a place. */
  readonly files: Readonly<Record<string, unknown>>;
};

/** Where things are on this machine, by the name a harness file writes in braces: `{plugin}`, `{node}`, `{socket}`. */
export type Places = Readonly<Record<string, string>>;

/** Lays out the home in `dir` and returns the variable that points an agent at it. Nothing of the Human's is written. */
export function layHome(dir: string, home: Home, places: Places): Record<string, string> {
  mkdirSync(dir, { recursive: true });
  const given = process.env[home.env];
  const from = given && given !== dir ? given : home.from.replace(/^~(?=$|[\\/])/, homedir());
  for (const name of home.link) {
    const target = join(from, name);
    const at = join(dir, name);
    if (existsSync(at) || isLink(at)) rmSync(at, { force: true });
    if (existsSync(target)) symlinkSync(target, at);
  }
  for (const [name, content] of Object.entries(home.files)) {
    const placed = withPlaces(content, places);
    writeFileSync(join(dir, name), typeof placed === "string" ? placed : `${JSON.stringify(placed, null, 2)}\n`);
  }
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

/** A value from a harness file with each `{name}` in its strings put in place; a name that is no place stays. */
export function withPlaces(value: unknown, places: Places): unknown {
  if (typeof value === "string")
    return value.replace(/\{([a-z]+)\}/g, (written, name: string) => places[name] ?? written);
  if (Array.isArray(value)) return value.map((v) => withPlaces(v, places));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withPlaces(v, places)]));
  return value;
}
