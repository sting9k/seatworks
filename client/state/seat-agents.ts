import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ACTOR_LABEL, PROJECT_LABEL } from "../../shared/contracts/ids.ts";

/** How often a project's agents are listed again: seats come and go, and turns start and end. */
const EVERY_MS = 5000;

/** Each seat's agent in Paseo, by the seat's actor: its id, to open its chat, and whether it is in a turn. */
export type SeatAgents = {
  readonly ids: Readonly<Record<string, string>>;
  readonly running: ReadonlySet<string>;
};

const NONE: SeatAgents = { ids: {}, running: new Set() };

/** The agents Paseo keeps for a project, found by the labels the plugin gave them and listed again as it runs. */
export function useSeatAgents(project: string | null): SeatAgents {
  const paseo = usePaseo();
  const [agents, setAgents] = useState<SeatAgents>(NONE);
  useEffect(() => {
    setAgents(NONE);
    if (!project) return;
    const read = () =>
      paseo.agents
        .list({ filter: { labels: { [PROJECT_LABEL]: project } } })
        .then(({ entries }) => {
          const seated = entries.flatMap(({ agent }) => {
            const actor = agent.labels[ACTOR_LABEL];
            return actor && !agent.archivedAt ? [{ actor, id: agent.id, running: agent.status === "running" }] : [];
          });
          setAgents({
            ids: Object.fromEntries(seated.map((seat) => [seat.actor, seat.id])),
            running: new Set(seated.filter((seat) => seat.running).map((seat) => seat.actor)),
          });
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
