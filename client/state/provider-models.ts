import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ProviderModel, RPC } from "../../shared/contracts/rpc.ts";
import { problemText } from "./problem-text.ts";

type Listed = Readonly<Record<string, readonly ProviderModel[]>>;

/** The models of each provider named, read once each and kept; `read` gives those of one more, as when one is picked. */
export function useModelsOf(providers: readonly string[]): {
  models: Listed;
  /** Why a provider's models were not read. */
  problem: string | null;
  read: (provider: string) => Promise<readonly ProviderModel[] | null>;
} {
  const ask = useRpc(RPC.models);
  const [models, setModels] = useState<Listed>({});
  const [problem, setProblem] = useState<string | null>(null);
  const asked = useRef(new Map<string, Promise<readonly ProviderModel[] | null>>());
  const read = useCallback(
    (provider: string) => {
      const known = asked.current.get(provider);
      if (known) return known;
      const reading = ask({ provider }).then(
        (answer) => {
          if (!answer.ok) {
            setProblem(answer.text);
            return null;
          }
          setModels((all) => ({ ...all, [provider]: answer.models }));
          return answer.models;
        },
        (failed: unknown) => {
          setProblem(problemText(failed));
          return null;
        },
      );
      asked.current.set(provider, reading);
      // One that was not read is asked again the next time it is wanted.
      void reading.then((got) => {
        if (got === null) asked.current.delete(provider);
      });
      return reading;
    },
    [ask],
  );
  const wanted = [...new Set(providers)].sort().join("\n");
  useEffect(() => {
    for (const provider of wanted.split("\n").filter(Boolean)) void read(provider);
  }, [wanted, read]);
  return { models, problem, read };
}
