// What a seated Claude Code agent's hook runs between two of its steps: asks the plugin whether mail may enter the
// turn, and hands what comes to Claude as context for its next step. It says nothing when there is none.
import { Line } from "./team-line.ts";

/** A hook that hangs holds its agent's next step: past this the agent goes on, and the mail waits for the next pause. */
const WAIT_MS = 5_000;

const line = new Line(process.env.SEATWORKS_SOCKET ?? "");
// The line keeps no process alive on its own, so this timer does while the plugin answers.
const waiting = setTimeout(() => process.exit(0), WAIT_MS);
const text = await line.mail();
clearTimeout(waiting);
if (text !== "")
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolBatch", additionalContext: text } }),
  );
line.close();
