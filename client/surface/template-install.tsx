import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { RPC, type TemplateOffer } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
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
  const missing = offer?.agentProfiles.filter((profile) => !profile.there) ?? [];
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
                ? `Not in Paseo yet: ${missing.map((profile) => profile.name).join(", ")}. Add them in Paseo's settings before a role that names one is seated.`
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
                act(() => install({ path: path.trim(), hash: offer.hash }));
              }}
            />
          </View>
        </SettingsCard>
      ) : null}
    </SettingsSection>
  );
}
