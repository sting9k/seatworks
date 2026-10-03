import type { ProfileAgents } from "../../shared/contracts/rpc.ts";

type Agent = ProfileAgents["agents"][number];

/** A profile's matching as it is sent whole: each name that runs on another profile than the one of its own name. */
const matchingOf = (agents: readonly Agent[]): Record<string, string> =>
  Object.fromEntries(agents.filter((agent) => agent.runsOn !== agent.name).map((agent) => [agent.name, agent.runsOn]));

/** One name run on another of the Human's profiles, or on the profile of its own name again; the rest as they are. */
export const oneOn = (agents: readonly Agent[], named: string, runsOn: string): Record<string, string> =>
  matchingOf(agents.map((agent) => (agent.name === named ? { ...agent, runsOn } : agent)));

/** Every name Paseo has no profile for run on one of the Human's own; a name matched to one it has is kept. */
export const restOn = (agents: readonly Agent[], runsOn: string): Record<string, string> =>
  matchingOf(agents.map((agent) => (agent.there ? agent : { ...agent, runsOn })));
