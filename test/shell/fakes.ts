import type { EffectBody } from "../../shared/contracts/effects.ts";
import type { Handled, Handlers } from "../../server/bridge/dispatcher.ts";

/** Satellites that record what they were asked and answer as the test says: they reimplement nothing. */
export function recordingHandlers(answer: (e: EffectBody) => Handled = () => ({ status: "done" })) {
  const asked: EffectBody[] = [];
  const handle = (e: EffectBody): Promise<Handled> => {
    asked.push(e);
    return Promise.resolve(answer(e));
  };
  const handlers: Handlers = {
    "workspace.create": handle,
    "workspace.candidate": handle,
    "workspace.advance": handle,
    "workspace.remove": handle,
    "workspace.publish": handle,
    "evidence.run": handle,
    "agent.create": handle,
    "agent.archive": handle,
    "agent.permission": handle,
    deliver: (batch) => Promise.all(batch.map(handle)).then((all) => all[0] ?? { status: "done" }),
    "machine.hold": handle,
  };
  return { handlers, asked };
}
