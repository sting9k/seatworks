import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

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
  /** The folder of the home its agent finds skills in, each a folder of its own. */
  readonly skills: string;
  /** For an agent that has no switch for skills elsewhere: the folders they are under, and what a file says of each. */
  readonly leaves?: { readonly under: readonly string[]; readonly file: string; readonly each: string };
  /** What of the Human's own file of that name is kept in the home's: these keys of its top, each table so named. */
  readonly keeps?: { readonly file: string; readonly keys: readonly string[]; readonly tables: readonly string[] };
};

/** Where things are on this machine, by the name a harness file writes in braces: `{plugin}`, `{node}`, `{socket}`. */
export type Places = Readonly<Record<string, string>>;

/** Lays the home out in `dir` with the skills given and returns the variable naming it; the Human's own stays as is. */
export function layHome(dir: string, home: Home, places: Places, skills: readonly string[]): Record<string, string> {
  mkdirSync(dir, { recursive: true });
  const given = process.env[home.env];
  const from = given && given !== dir ? given : home.from.replace(/^~(?=$|[\\/])/, homedir());
  for (const name of home.link) {
    const target = join(from, name);
    const at = join(dir, name);
    if (existsSync(at) || isLink(at)) rmSync(at, { force: true });
    if (existsSync(target)) symlinkSync(target, at);
  }
  const here = { ...places, home: homedir(), room: dir };
  const left = home.leaves ? leftOut(home.leaves, here) : "";
  const kept = home.keeps ? keptOf(join(from, home.keeps.file), home.keeps) : { top: "", tables: "" };
  for (const [name, content] of Object.entries(home.files)) {
    const placed = withPlaces(content, here);
    const said = typeof placed === "string" ? placed : `${JSON.stringify(placed, null, 2)}\n`;
    // Keys of a file's top come before its first table, so the Human's stand first and their tables after.
    const whole = name === home.keeps?.file ? kept.top + said + kept.tables : said;
    put(join(dir, name), name === home.leaves?.file ? whole + left : whole);
  }
  placeSkills(join(dir, home.skills), skills);
  return { [home.env]: dir };
}

/** Writes a file, for its owner alone to read, unless it says so already: an agent in the home may be reading it. */
function put(file: string, said: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === said) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, said, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** The lines of a TOML file that set the keys named at its top, and those of each table named or under one named. */
function keptOf(file: string, keeps: NonNullable<Home["keeps"]>): { top: string; tables: string } {
  if (!existsSync(file)) return { top: "", tables: "" };
  const lines = readFileSync(file, "utf8").split("\n");
  const header = (line: string) => /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/.exec(line)?.[1];
  const first = lines.findIndex((line) => header(line) !== undefined);
  const top = lines
    .slice(0, first < 0 ? lines.length : first)
    .filter((line) => keeps.keys.includes(/^([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1] ?? ""));
  const tables: string[] = [];
  let within = false;
  for (const line of first < 0 ? [] : lines.slice(first)) {
    const named = header(line);
    if (named !== undefined) within = keeps.tables.some((table) => named === table || named.startsWith(`${table}.`));
    if (within) tables.push(line);
  }
  const said = (some: string[]) => (some.length > 0 ? `${some.join("\n").trimEnd()}\n` : "");
  return { top: top.length > 0 ? `${said(top)}\n` : "", tables: tables.length > 0 ? `\n${said(tables)}` : "" };
}

/** What a file is given for each skill found under the folders named, by the path the skill's file really has. */
function leftOut(leaves: NonNullable<Home["leaves"]>, places: Places): string {
  return leaves.under
    .flatMap((folder) => skillFiles(String(withPlaces(folder, places)), 4))
    .map((file) => leaves.each.replace("{path}", JSON.stringify(realpathSync(file))))
    .join("");
}

/** Every `SKILL.md` under a folder, a link followed, as deep as an agent groups its skills. */
function skillFiles(dir: string, depth: number): string[] {
  if (depth === 0 || !existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const at = join(dir, name);
      if (name === "SKILL.md") return [at];
      // A link to nothing is no skill.
      return existsSync(at) && statSync(at).isDirectory() ? skillFiles(at, depth - 1) : [];
    });
}

/** Makes a folder hold a copy of each skill given and no other: what an agent writes in a copy reaches no source. */
function placeSkills(dir: string, skills: readonly string[]): void {
  mkdirSync(dir, { recursive: true });
  const wanted = new Map(skills.map((skill) => [basename(skill), skill]));
  for (const name of readdirSync(dir))
    // What begins with a dot is the agent's own to keep there.
    if (!name.startsWith(".") && !wanted.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
  for (const [name, skill] of wanted) {
    const at = join(dir, name);
    if (sameFiles(skill, at)) continue;
    rmSync(at, { recursive: true, force: true });
    cpSync(skill, at, { recursive: true });
  }
}

/** Whether two folders hold the same files with the same contents. */
function sameFiles(one: string, other: string): boolean {
  if (!existsSync(other)) return false;
  const names = readdirSync(one, { recursive: true, encoding: "utf8" }).sort();
  if (names.join("\n") !== readdirSync(other, { recursive: true, encoding: "utf8" }).sort().join("\n")) return false;
  return names.every((name) => {
    const [a, b] = [join(one, name), join(other, name)];
    if (statSync(a).isDirectory()) return statSync(b).isDirectory();
    return statSync(b).isFile() && readFileSync(a).equals(readFileSync(b));
  });
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    // Nothing there.
    return false;
  }
}

/** A value from a harness file with a key written `{skill}` set once for each skill named, to the value it has. */
export function withSkills(value: unknown, skills: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => withSkills(v, skills));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([k, v]): [string, unknown][] =>
      k === "{skill}" ? skills.map((skill) => [skill, v]) : [[k, withSkills(v, skills)]],
    ),
  );
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
