/** A check's command as one line to read and to type: an argument that needs it goes in double quotes. */
export function lineOf(run: readonly string[]): string {
  return run.map((arg) => (/^[^\s"'\\]+$/.test(arg) ? arg : `"${arg.replace(/["\\]/g, "\\$&")}"`)).join(" ");
}

/** The arguments a typed line names: spaces part them, quotes keep one whole, a backslash keeps what follows. */
export function argvOf(line: string): string[] {
  const argv: string[] = [];
  let arg: string | null = null;
  let quote: '"' | "'" | null = null;
  for (let at = 0; at < line.length; at++) {
    const char = line[at]!;
    if (quote === null && /\s/.test(char)) {
      if (arg !== null) argv.push(arg);
      arg = null;
    } else if (quote === null && (char === '"' || char === "'")) {
      quote = char;
      arg ??= "";
    } else if (char === quote) quote = null;
    else if (char === "\\" && quote !== "'" && at + 1 < line.length) arg = (arg ?? "") + line[++at]!;
    else arg = (arg ?? "") + char;
  }
  if (arg !== null) argv.push(arg);
  return argv;
}
