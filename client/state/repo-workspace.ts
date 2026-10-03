import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";

/** The workspace Paseo keeps for a repository, to open its Team tab; none where Paseo has not opened it. */
export function useRepoWorkspace(repo: string): string | null {
  const paseo = usePaseo();
  const [workspace, setWorkspace] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void paseo.workspaces.list().then(
      ({ entries }) => {
        if (current) setWorkspace(entries.find((entry) => entry.projectRootPath === repo)?.id ?? null);
      },
      // A missed listing leaves the row without its way to the Team tab; the chat's pill has one too.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [paseo, repo]);
  return workspace;
}
