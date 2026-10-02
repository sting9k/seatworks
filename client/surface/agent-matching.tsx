import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsSection } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { type ProfileAgents, RPC } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { DisclosureList } from "../kit/disclosure.tsx";
import { FONT } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

type Listed = { readonly profiles: readonly ProfileAgents[]; readonly available: readonly string[] };

/** Matches the agent profiles each profile's roles name to the Human's own; `stamp` changes when one is installed. */
export function AgentMatching({ theme, stamp }: { theme: PluginTheme; stamp: number }) {
  const ask = useRpc(RPC.agents);
  const [listed, setListed] = useState<Listed | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };

  const read = useCallback(
    async (match?: { profile: string; matching: Record<string, string> }) => {
      setBusy(true);
      try {
        const answer = await ask(match ? { match } : {});
        if (answer.ok) setListed(answer);
        setSaid(answer.ok ? null : answer.text);
      } catch (failed) {
        setSaid(problemText(failed));
      } finally {
        setBusy(false);
      }
    },
    [ask],
  );
  useEffect(() => {
    void read();
  }, [read, stamp]);

  /** One name of a profile run on one of the Human's own, or on the profile of its own name again. */
  const match = (profile: ProfileAgents, named: string, runs: string | null) => {
    const kept = profile.agents.filter((agent) => agent.runsOn !== agent.name && agent.name !== named);
    const matching = Object.fromEntries(kept.map((agent) => [agent.name, agent.runsOn]));
    setChoosing(null);
    void read({ profile: profile.name, matching: runs === null ? matching : { ...matching, [named]: runs } });
  };

  return (
    <>
      <SettingsSection title="Agent profiles">
        <Text style={[muted, said ? { color: theme.colors.statusDanger } : null]}>
          {said ??
            "Each name a profile's roles give runs on the agent profile of that name in Paseo, or on one of yours that you pick here. It holds for agents seated from then on."}
        </Text>
      </SettingsSection>
      {(listed?.profiles ?? []).map((profile) => (
        <SettingsSection key={profile.name} title={profile.title}>
          {profile.problem ? (
            <Text style={[muted, { color: theme.colors.statusDanger }]}>{profile.problem}</Text>
          ) : null}
          <DisclosureList
            theme={theme}
            compact
            open={choosing}
            onOpen={setChoosing}
            items={profile.agents.map((agent) => {
              const matched = agent.runsOn !== agent.name;
              return {
                id: `${profile.name}/${agent.name}`,
                title: agent.name,
                hint: `${matched ? `Runs on ${agent.runsOn}` : "Runs on the profile of this name"}${agent.there ? "" : ", which Paseo does not have"}`,
                dimmed: !agent.there,
                body: [
                  ...(listed?.available ?? []).map((has) => (
                    <Button
                      key={has}
                      label={has}
                      theme={theme}
                      tone={agent.runsOn === has ? "accent" : "outline"}
                      disabled={busy}
                      onPress={() => {
                        match(profile, agent.name, has);
                      }}
                    />
                  )),
                  matched ? (
                    <Button
                      key="its own name"
                      label="The profile of its own name"
                      theme={theme}
                      tone="quiet"
                      disabled={busy}
                      onPress={() => {
                        match(profile, agent.name, null);
                      }}
                    />
                  ) : null,
                ],
              };
            })}
          />
        </SettingsSection>
      ))}
    </>
  );
}
