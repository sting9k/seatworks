import { format } from "node:util";

/** What the plugin says outside any project: to stderr, which Paseo keeps in its daemon log. The only file that writes it. */
export const daemonLog = {
  info(...args: unknown[]): void {
    process.stderr.write(`[seatworks] ${format(...args)}\n`);
  },
  error(message: string, cause?: unknown): void {
    process.stderr.write(`[seatworks] ${message}${cause === undefined ? "" : `: ${describe(cause)}`}\n`);
  },
};

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? cause.message;
  return format(cause);
}
