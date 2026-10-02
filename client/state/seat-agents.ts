import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ACTOR_LABEL, PROJECT_LABEL } from "../../shared/contracts/ids.ts";

/** How often a project's agents are listed again: seats come and go as scopes open and land. */
const EVERY_MS = 10_000;

/** Each seat's agent in Paseo, found by the labels the plugin gave it, so a line can open that agent's chat. */
export function useSeatAgents(project: string | null): Readonly<Record<string, string>> {
  const paseo = usePaseo();
  const [agents, setAgents] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    setAgents({});
    if (!project) return;
    const read = () =>
      paseo.agents
        .list({ filter: { labels: { [PROJECT_LABEL]: project } } })
        .then(({ entries }) => {
          setAgents(
            Object.fromEntries(
              entries.flatMap(({ agent }) => {
                const actor = agent.labels[ACTOR_LABEL];
                return actor && !agent.archivedAt ? [[actor, agent.id]] : [];
              }),
            ),
          );
        })
        // A missed listing leaves the chats unopenable until the next one.
        .catch(() => undefined);
    void read();
    const timer = setInterval(() => void read(), EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [paseo, project]);
  return agents;
}
