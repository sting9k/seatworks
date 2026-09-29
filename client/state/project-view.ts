import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useState } from "react";
import { RPC, type ViewOutput } from "../../shared/contracts/rpc.ts";
import { problemText } from "./problem-text.ts";

/** How often an open view is read again: the record changes as agents work, and a read is cheap. */
const EVERY_MS = 5000;

/** One project's view, read now and every few seconds while shown; `reload` reads it at once after an action. */
export function useProjectView(project: string | null): {
  view: ViewOutput | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const read = useRpc(RPC.view);
  const [view, setView] = useState<ViewOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!project) return;
    try {
      setView(await read({ project }));
      setError(null);
    } catch (problem) {
      setError(problemText(problem));
    }
  }, [project, read]);
  useEffect(() => {
    setView(null);
    void reload();
    const timer = setInterval(() => void reload(), EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reload]);
  return { view, error, reload };
}
