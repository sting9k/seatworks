// What a seated agent's hook runs between two of its steps, with the hook's event as its one argument: asks the
// plugin whether mail may enter the turn, and hands what comes to the agent as context for its next step, in the
// form Claude Code and Codex both read. It says nothing when there is none.
import { Line } from "./team-line.ts";

/** A hook that hangs holds its agent's next step: past this the agent goes on, and the mail waits for the next pause. */
const WAIT_MS = 5_000;

const event = process.argv[2];
if (!event) throw new Error("seatworks-mail is run with the name of the hook's event");
const line = new Line(process.env.SEATWORKS_SOCKET ?? "");
// The line keeps no process alive on its own, so this timer does while the plugin answers.
const waiting = setTimeout(() => process.exit(0), WAIT_MS);
const text = await line.mail();
clearTimeout(waiting);
if (text !== "")
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
line.close();
