import { isMap, isScalar, type Pair, parseDocument, type Range, type YAMLMap } from "yaml";

/**
 * Changes to a YAML file made in its source, at the place of the node they change (EDITOR.md, Decided 7): the file
 * is never written whole from what was parsed, so every comment and every line a change does not touch stays as it is.
 */

export type Value = boolean | string | readonly string[] | { readonly [key: string]: Value };

const WIDTH = 120;
const PLAIN = /^[A-Za-z_][A-Za-z0-9_./-]*$/;
const RESERVED = new Set(["true", "false", "null", "yes", "no", "on", "off"]);

/** The text with the value at `path` set: replaced where it stands, or added as the last key of its map. */
export function setIn(text: string, path: readonly string[], value: Value): string {
  const { map, pair, key } = pairAt(text, path);
  const range = pair ? rangeOf(pair.value) : null;
  if (range) return splice(text, range[0], range[1], rendered(value, columnOf(text, range[0])));
  if (pair) return setIn(deleteIn(text, path), path, value);
  const first = map.items[0];
  const last = map.items.at(-1);
  if (!first || !last) throw new Error(`the map at ${path.slice(0, -1).join(".")} is empty: nothing to add after`);
  const indent = columnOf(text, rangeOf(first.key)![0]);
  const after = lineEnd(text, endOf(last));
  const second = map.items[1];
  const apart = second !== undefined && lineEnd(text, endOf(first)) < lineStart(text, rangeOf(second.key)![0]);
  const lead = (atLineStart(text, after) ? "" : "\n") + (apart ? "\n" : "");
  return splice(text, after, after, `${lead}${entry(key, value, indent)}`);
}

/** The text without the key at `path`, its whole lines taken out; a key that is not there changes nothing. */
export function deleteIn(text: string, path: readonly string[]): string {
  const { pair } = pairAt(text, path);
  if (!pair) return text;
  const from = lineStart(text, rangeOf(pair.key)![0]);
  const to = lineEnd(text, endOf(pair));
  // A key set apart by blank lines leaves one behind it, not two.
  const between = text.slice(0, from).endsWith("\n\n") && text[to] === "\n";
  return splice(text, from, between ? to + 1 : to, "");
}

/** The text with the key at `path` called `to`, its value untouched. */
export function renameKey(text: string, path: readonly string[], to: string): string {
  const { pair } = pairAt(text, path);
  if (!pair) throw new Error(`no key at ${path.join(".")} to rename`);
  const key = rangeOf(pair.key)!;
  return splice(text, key[0], key[1], scalar(to));
}

function pairAt(text: string, path: readonly string[]): { map: YAMLMap; pair: Pair | undefined; key: string } {
  const key = path.at(-1);
  const map: unknown = parseDocument(text).getIn(path.slice(0, -1), true);
  if (key === undefined || !isMap(map)) throw new Error(`no map at ${path.slice(0, -1).join(".")}`);
  return { map, pair: map.items.find((item) => isScalar(item.key) && item.key.value === key), key };
}

const rangeOf = (node: unknown): Range | null =>
  typeof node === "object" && node !== null && "range" in node
    ? ((node.range as Range | null | undefined) ?? null)
    : null;

/** Where a key's value ends in the source, or its key when it has none. */
const endOf = (pair: Pair) => rangeOf(pair.value)?.[1] ?? rangeOf(pair.key)![1];
const atLineStart = (text: string, at: number) => at === 0 || text[at - 1] === "\n";

const splice = (text: string, from: number, to: number, put: string) => text.slice(0, from) + put + text.slice(to);
const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;
const columnOf = (text: string, at: number) => at - lineStart(text, at);

/** Just past the line that ends at or after `at`. A nested map ends at the start of the line after it: that is `at`. */
function lineEnd(text: string, at: number): number {
  if (atLineStart(text, at)) return at;
  const end = text.indexOf("\n", at);
  return end === -1 ? text.length : end + 1;
}

function entry(key: string, value: Value, indent: number): string {
  const pad = " ".repeat(indent);
  if (typeof value === "object" && !Array.isArray(value)) {
    const inside = Object.entries(value as { readonly [key: string]: Value });
    return `${pad}${scalar(key)}:\n${inside.map(([k, v]) => entry(k, v, indent + 2)).join("")}`;
  }
  const head = `${pad}${scalar(key)}: `;
  return `${head}${rendered(value, head.length)}\n`;
}

/** A value as the profile's files write one: a list in brackets, broken at 120 columns under its first item. */
function rendered(value: Value, column: number): string {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return scalar(value);
  if (!Array.isArray(value)) throw new Error("a map is added as a key of its own, never set in place of a value");
  const pad = " ".repeat(column + 1);
  const lines: string[] = [];
  let line = "[";
  for (const [index, item] of (value as readonly string[]).entries()) {
    const piece = scalar(item) + (index === value.length - 1 ? "" : ",");
    const width = (lines.length === 0 ? column : 0) + line.length;
    if (line === "[") line += piece;
    else if (width + 1 + piece.length <= WIDTH) line += ` ${piece}`;
    else {
      lines.push(line);
      line = pad + piece;
    }
  }
  return [...lines, `${line}]`].join("\n");
}

const scalar = (value: string) => (PLAIN.test(value) && !RESERVED.has(value) ? value : JSON.stringify(value));
