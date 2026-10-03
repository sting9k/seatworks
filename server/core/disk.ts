import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/** What a folder takes on disk: the bytes of every file under it, links not followed; one that is gone takes none. */
export async function sizeOf(path: string): Promise<number> {
  let total = 0;
  const folders = [path];
  for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
    const here = folder;
    // A folder or a file gone while it is read counts for nothing: the next scan says what is there.
    const entries = await readdir(here, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory()) folders.push(join(here, entry.name));
    const sizes = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          lstat(join(here, entry.name)).then(
            (stat) => stat.size,
            () => 0,
          ),
        ),
    );
    for (const size of sizes) total += size;
  }
  return total;
}
