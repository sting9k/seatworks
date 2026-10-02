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

type Props = { theme: PluginTheme; stamp: number; onRemoved: () => void };

/** Each installed template: its agent profiles matched to the Human's own, and its removal; `stamp` says to read again. */
export function AgentMatching({ theme, stamp, onRemoved }: Props) {
  const ask = useRpc(RPC.agents);
  const remove = useRpc(RPC.removeTemplate);
  /** The template whose removal waits on a second press. */
  const [removing, setRemoving] = useState<string | null>(null);
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

  const removed = async (name: string) => {
    setBusy(true);
    setRemoving(null);
    try {
      const answer = await remove({ name });
      setSaid(answer.ok ? null : answer.text);
      if (answer.ok) onRemoved();
    } catch (failed) {
      setSaid(problemText(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsSection title="Agent profiles">
        <Text style={[muted, said ? { color: theme.colors.statusDanger } : null]}>
          {said ??
            "Each name an installed template's roles give runs on the agent profile of that name in Paseo, or on one of yours that you pick here. It holds for agents seated from then on. Removing a template takes it off this machine; a project that runs it goes on with its own copy."}
        </Text>
      </SettingsSection>
      {(listed?.profiles ?? []).map((profile) => (
        <SettingsSection
          key={profile.name}
          title={profile.title}
          trailing={
            <Button
              label={removing === profile.name ? "Press again to remove" : "Remove"}
              theme={theme}
              tone="quiet"
              disabled={busy}
              onPress={() => {
                if (removing === profile.name) void removed(profile.name);
                else setRemoving(profile.name);
              }}
            />
          }
        >
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
