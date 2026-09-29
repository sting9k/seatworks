import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach } from "node:test";
import { format } from "node:util";

/** A HOME of its own for every test, so none reads the owner's state or another test's. */
const homes: string[] = [];
const freshHome = () => {
  const home = mkdtempSync(join(tmpdir(), "sw-home-"));
  homes.push(home);
  process.env.HOME = home;
};
freshHome();
beforeEach(freshHome);
after(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const said: string[] = [];
console.error = (...args: unknown[]) => {
  said.push(format(...args));
};

/** A test that expects an error reads it with `reported()`; anything else printed fails it. */
afterEach(() => {
  const found = said.splice(0);
  if (found.length > 0)
    throw new Error(`console.error was called and the test did not expect it:\n${found.join("\n")}`);
});

export function reported(): string[] {
  return said.splice(0);
}
