import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { type ProviderModel, RPC } from "../../shared/contracts/rpc.ts";
import { problemText } from "./problem-text.ts";

/** The models a provider has, read when a provider is named; null while they are read, and why where they are not. */
export function useModels(provider: string | null): {
  models: readonly ProviderModel[] | null;
  problem: string | null;
} {
  const read = useRpc(RPC.models);
  const [models, setModels] = useState<readonly ProviderModel[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setModels(null);
    setProblem(null);
    if (provider === null) return;
    // A provider picked while another is still read wins: the earlier answer is dropped.
    let current = true;
    void read({ provider }).then(
      (answer) => {
        if (!current) return;
        if (answer.ok) setModels(answer.models);
        else setProblem(answer.text);
      },
      (failed: unknown) => {
        if (current) setProblem(problemText(failed));
      },
    );
    return () => {
      current = false;
    };
  }, [provider, read]);
  return { models, problem };
}
