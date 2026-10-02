import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type Preset, RPC, type TemplateOffer, type TemplateSource } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

/** What is said of a template that comes with the plugin, by whether it is installed. */
const INSTALLED: Record<Preset["installed"], string> = {
  no: "Comes with Seatworks, not installed.",
  same: "Installed as it comes.",
  differs: "Installed, and not as this release brings it: installing it again puts this release's in its place.",
};

/** Installs a template, one that comes with the plugin or a file on this machine: read what it brings, then agree. */
export function TemplateInstall({ theme, onInstalled }: { theme: PluginTheme; onInstalled: () => void }) {
  const read = useRpc(RPC.templateOffer);
  const install = useRpc(RPC.installTemplate);
  const list = useRpc(RPC.presets);
  const [presets, setPresets] = useState<readonly Preset[]>([]);
  const [path, setPath] = useState("");
  /** Where the offer shown was read from, which is where it is installed from. */
  const [from, setFrom] = useState<TemplateSource | null>(null);
  const [offer, setOffer] = useState<TemplateOffer | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };

  const act = (work: () => Promise<{ ok: boolean; text: string; offer?: TemplateOffer | null }>) => {
    setBusy(true);
    void work()
      .then((answer) => {
        setOffer(answer.offer ?? null);
        setSaid(answer.text === "" ? null : { ok: answer.ok, text: answer.text });
      })
      .catch((failed: unknown) => {
        setSaid({ ok: false, text: problemText(failed) });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const listPresets = useCallback(async () => {
    try {
      setPresets((await list({})).presets);
    } catch {
      // Read again on the next visit; a plugin that does not answer says so where a template is read.
    }
  }, [list]);
  useEffect(() => {
    void listPresets();
  }, [listPresets]);
  const offered = (source: TemplateSource) => {
    setFrom(source);
    act(() => read({ from: source }));
  };
  const missing = offer?.agentProfiles.filter((profile) => !profile.there) ?? [];
  const unset = offer?.variables.filter((variable) => !variable.there) ?? [];

  return (
    <SettingsSection title="Templates">
      {presets.length > 0 ? (
        <SettingsCard>
          {presets.map((preset) => (
            <SettingsAction
              key={preset.name}
              label={preset.title}
              hint={`${INSTALLED[preset.installed]} ${preset.description}`}
              actionLabel="Read"
              disabled={busy}
              onPress={() => {
                offered({ preset: preset.name });
              }}
            />
          ))}
        </SettingsCard>
      ) : null}
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
                offered({ path: path.trim() });
              }}
            />
          </View>
        </View>
      </Card>
      {offer && from ? (
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
            hint={offer.agentProfiles.map((profile) => profile.name).join(", ") || "None"}
            error={
              missing.length > 0
                ? `Not in Paseo under that name: ${missing.map((profile) => profile.name).join(", ")}. Once it is installed, match each to one of yours under Agent profiles below, or add it in Paseo's settings.`
                : null
            }
          />
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
                act(async () => {
                  const made = await install({ from, hash: offer.hash });
                  if (made.ok) onInstalled();
                  await listPresets();
                  return made;
                });
              }}
            />
          </View>
        </SettingsCard>
      ) : null}
    </SettingsSection>
  );
}
