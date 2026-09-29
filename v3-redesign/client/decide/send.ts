import { useRpc } from "@getpaseo/plugin/client";
import { useState } from "react";
import { RPC } from "../../shared/contracts/rpc.ts";

/** A command from the Human, with what the record said back, and whether one is on its way. */
export function useHumanCommand(project: string) {
  const human = useRpc(RPC.human);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (type: string, args: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const reply = await human({ project, type, args });
      setSaid(reply);
      return reply.ok;
    } catch (problem) {
      setSaid({ ok: false, text: problem instanceof Error ? problem.message : String(problem) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, said, send };
}
