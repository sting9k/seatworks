import { homedir } from "node:os";
import { join } from "node:path";

/** The plugin's own state root, apart from V1's and from Paseo's files. */
export function stateRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "win32") return join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "seatworks");
  return join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), ".local", "share"), "seatworks");
}

export function projectDir(root: string, project: string): string {
  return join(root, "projects", project);
}
