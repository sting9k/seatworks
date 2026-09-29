import { execFile } from "node:child_process";
import type { UpdateCheck } from "../../shared/contracts/rpc.ts";

const CHECK_TIMEOUT_MS = 120_000;

/** One plugin's line of `paseo plugin update --check --json`, read accepting fields it does not know. */
type Preview = {
  id?: string;
  outcome?: string;
  current?: { currentRevision?: string };
  target?: { kind?: string; commit?: string; version?: string };
  links?: string[];
  error?: string;
};

/**
 * Asks Paseo's own command line whether a newer release of the plugin is out: the plugin API has no call for it, and
 * the reviewed update stays Paseo's, so this only reads.
 */
export async function checkUpdate(pluginId: string): Promise<UpdateCheck> {
  const apply = `paseo plugin update ${pluginId}`;
  const ran = await run("paseo", ["plugin", "update", pluginId, "--check", "--json"]);
  if ("missing" in ran)
    return unknown(`Paseo's command line is not on the daemon's PATH: run \`${apply} --check\` in a terminal.`);
  if (ran.code !== 0) return unknown(`Paseo could not check: ${(ran.stderr || ran.stdout).trim().slice(-500)}`);
  let items: Preview[];
  try {
    items = JSON.parse(ran.stdout) as Preview[];
  } catch {
    return unknown(`Paseo answered what is not JSON: ${ran.stdout.trim().slice(0, 200)}`);
  }
  const item = (Array.isArray(items) ? items : [items]).find((i) => i.id === pluginId);
  if (!item) return unknown(`Paseo listed no plugin ${pluginId}.`);
  const current = item.current?.currentRevision ?? null;
  const latest = item.target?.commit ?? item.target?.version ?? null;
  const links = item.links ?? [];
  switch (item.outcome) {
    case "update":
      return {
        status: "available",
        current,
        latest,
        links,
        text: `A newer release is out (${current ?? "?"} → ${latest ?? "?"}). Review it, then run \`${apply}\`.`,
      };
    case "current":
    case "installed-newer":
      return { status: "current", current, latest, links, text: `Up to date (${current ?? "?"}).` };
    case "local":
      return {
        status: "local",
        current,
        latest,
        links,
        text: `Installed from a directory: update that directory, then run \`paseo plugin reload ${pluginId}\`.`,
      };
    default:
      return { ...unknown(item.error ?? `Paseo answered ${item.outcome ?? "nothing"}.`), current, links };
  }
}

function unknown(text: string): UpdateCheck {
  return { status: "unknown", current: null, latest: null, links: [], text };
}

function run(
  command: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string } | { missing: true }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: CHECK_TIMEOUT_MS, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") resolve({ missing: true });
      else resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}
