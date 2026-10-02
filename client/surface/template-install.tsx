import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { RPC, type TemplateOffer } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { DisclosureList } from "../kit/disclosure.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

/**
 * Installs a template from a file the Human downloaded: they give its path, read what it would bring, and agree.
 * The plugin reads the file where it is and fetches nothing (TEMPLATE.md, Installing).
 */
export function TemplateInstall({ theme }: { theme: PluginTheme }) {
  const read = useRpc(RPC.templateOffer);
  const install = useRpc(RPC.installTemplate);
  const [path, setPath] = useState("");
  const [offer, setOffer] = useState<TemplateOffer | null>(null);
  /** Each agent profile the template names that the Human runs on one of their own. */
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [choosing, setChoosing] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };

  const act = (work: () => Promise<{ ok: boolean; text: string; offer?: TemplateOffer | null }>) => {
    setBusy(true);
    void work()
      .then((answer) => {
        setOffer(answer.offer ?? null);
        // What an earlier install matched stays matched, until the Human picks otherwise.
        setAgents(
          Object.fromEntries(
            (answer.offer?.agentProfiles ?? []).flatMap((profile) =>
              profile.runsOn === null ? [] : [[profile.name, profile.runsOn]],
            ),
          ),
        );
        setSaid(answer.text === "" ? null : { ok: answer.ok, text: answer.text });
      })
      .catch((failed: unknown) => {
        setSaid({ ok: false, text: problemText(failed) });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const missing = offer?.agentProfiles.filter((profile) => !profile.there && agents[profile.name] === undefined) ?? [];
  const match = (named: string, runs: string | null) => {
    setAgents(({ [named]: _was, ...rest }) => (runs === null ? rest : { ...rest, [named]: runs }));
    setChoosing(null);
  };
  const unset = offer?.variables.filter((variable) => !variable.there) ?? [];

  return (
    <SettingsSection title="Templates">
      <Card theme={theme}>
        <View style={{ padding: SPACE.md, gap: SPACE.sm }}>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: RADIUS.control,
              padding: SPACE.sm,
              color: theme.colors.foreground,
              fontSize: FONT.base,
            }}
            value={path}
            onChangeText={(text) => {
              setPath(text);
              setOffer(null);
            }}
            editable={!busy}
            placeholder="The path of a template file on this machine"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
            <Text style={[muted, { flex: 1 }, said && !said.ok ? { color: theme.colors.statusDanger } : null]}>
              {said?.text ?? "Read it first: it shows what the template would bring before anything is installed."}
            </Text>
            <Button
              label={busy && !offer ? "Reading" : "Read"}
              theme={theme}
              disabled={busy || path.trim() === ""}
              onPress={() => {
                act(() => read({ path: path.trim() }));
              }}
            />
          </View>
        </View>
      </Card>
      {offer ? (
        <>
          <SettingsCard>
            <SettingsRow label={offer.title} hint={offer.description} />
            <SettingsRow
              label={`Installed as ${offer.name}`}
              hint={
                offer.replaces
                  ? "A template of this name is installed already: this one takes its place, for agents seated after."
                  : "A project is attached with it by this name."
              }
            />
            <SettingsRow label="Roles" hint={offer.roles.join(", ")} />
            <SettingsRow
              label="Agent profiles its roles name"
              hint="Each runs on the agent profile of that name in Paseo, or on one of yours that you pick below."
              error={
                missing.length > 0
                  ? `Not in Paseo and not matched: ${missing.map((profile) => profile.name).join(", ")}. Pick one of yours for each, or add them in Paseo's settings before a role that names one is seated.`
                  : null
              }
            />
          </SettingsCard>
          <DisclosureList
            theme={theme}
            compact
            open={choosing}
            onOpen={setChoosing}
            items={offer.agentProfiles.map((profile) => {
              const runs = agents[profile.name];
              return {
                id: profile.name,
                title: profile.name,
                hint:
                  runs !== undefined
                    ? `Runs on ${runs}`
                    : profile.there
                      ? "Runs on the profile of this name in Paseo"
                      : "Not in Paseo",
                body: [
                  ...offer.available.map((has) => (
                    <Button
                      key={has}
                      label={has}
                      theme={theme}
                      tone={runs === has ? "accent" : "outline"}
                      disabled={busy}
                      onPress={() => {
                        match(profile.name, has);
                      }}
                    />
                  )),
                  runs !== undefined ? (
                    <Button
                      key="its own name"
                      label="The profile of its own name"
                      theme={theme}
                      tone="quiet"
                      disabled={busy}
                      onPress={() => {
                        match(profile.name, null);
                      }}
                    />
                  ) : null,
                ],
              };
            })}
          />
          <SettingsCard>
            {offer.servers.length > 0 ? (
              <SettingsRow
                label="Outside tool servers it starts"
                hint={offer.servers.map((server) => `${server.name}: ${server.runs}`).join("\n")}
                error={
                  unset.length > 0
                    ? `Not set on this machine: ${unset.map((variable) => `$${variable.name}`).join(", ")}. A role given a server that reads one is not seated until it is.`
                    : null
                }
              />
            ) : null}
            <View style={{ padding: SPACE.md, alignItems: "flex-end" }}>
              <Button
                label={busy ? "Installing" : offer.replaces ? "Install in its place" : "Install"}
                theme={theme}
                tone="accent"
                disabled={busy}
                onPress={() => {
                  act(() => install({ path: path.trim(), hash: offer.hash, agents }));
                }}
              />
            </View>
          </SettingsCard>
        </>
      ) : null}
    </SettingsSection>
  );
}
