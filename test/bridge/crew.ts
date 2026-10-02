import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Plugin } from "../../server/bridge/plugin.ts";
import { ROLE_TOOLS } from "../../shared/contracts/tools.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";

const pluginDir = join(import.meta.dirname, "../..");

export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

const ROLES = {
  chief:
    "root: true, delegates: true, humanDoor: true, spawns: [keeper, maker, reader, guard], speaksTo: [human, children, descendants]",
  keeper: "delegates: true, spawns: [maker, reader], speaksTo: [parent, children]",
  maker: "writes: true, speaksTo: [parent]",
  reader: "reading: true, speaksTo: [parent]",
  guard: "watches: true, speaksTo: [parent]",
};

/** A profile of plain roles, each given every tool, so a refusal is the kernel's own and never a role's list. */
function profile(): Map<string, string> {
  const tools = [...ROLE_TOOLS].join(", ");
  const roles = Object.entries(ROLES).map(
    ([name, properties]) =>
      `  ${name}: { ${properties}, prompt: roles/${name}.md, models: [${name}-agent], tools: [${tools}] }`,
  );
  return new Map([
    ["template.json", JSON.stringify({ name: "Crew", description: "Plain roles, to call every tool with." })],
    ["profile.yaml", `roles:\n${roles.join("\n")}\nreport:\n  done: What is done.\n  unsure: What is not sure.\n`],
    ...Object.keys(ROLES).map((name): [string, string] => [`roles/${name}.md`, `# ${name}\n`]),
  ]);
}

/** A project attached with that profile, on a repository with one commit, a check to run and a remote to push to. */
export async function crew() {
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  for (const [path, text] of profile()) {
    mkdirSync(join(root, "profiles", "crew", path, ".."), { recursive: true });
    writeFileSync(join(root, "profiles", "crew", path), text);
  }
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "sw-crew-")));
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "check.sh"), "test -f src/a/done.txt\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "start");
  const remote = realpathSync(mkdtempSync(join(tmpdir(), "sw-remote-")));
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);

  const plugin = new Plugin(root);
  const paseo = fakePaseo(
    pluginDir,
    "claude",
    Object.keys(ROLES).map((name) => `${name}-agent`),
  );
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  const { project } = await plugin.openProject(repo, "main", "crew");
  await plugin.idle();
  /** The tools of the agent made `nth`, in the order agents were made. */
  const tools = (nth: number) => agentTools(socketPath, paseo.created[nth]!.env);
  /** What an agent was told by the plugin, newest last. */
  const told = (nth: number) => paseo.sent.filter((s) => s.host === paseo.created[nth]!.host).map((s) => s.text);
  return { plugin, paseo, repo, remote, project, tools, told };
}
