import type { PluginTheme } from "@getpaseo/plugin";
import type { SettingsState } from "@getpaseo/plugin/client";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import type { reflexSettings } from "../../shared/contracts/settings.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Field } from "../kit/field.tsx";
import { Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";

type Settings = SettingsState<typeof reflexSettings.schema>;
type Editing = { readonly what: "host" | "key"; readonly text: string } | null;

/** Whether a template's classifier is asked on this machine, and the one host the key is sent to. The key is never shown. */
export function ClassifierTab({ settings, theme }: { settings: Settings; theme: PluginTheme }) {
  const [editing, setEditing] = useState<Editing>(null);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: SPACE.xs };
  if (settings.status === "loading") return <Text style={muted}>Reading the settings.</Text>;
  if (settings.status !== "ready")
    return (
      <Card theme={theme}>
        <Row title="The settings could not be read" meta={settings.error} theme={theme}>
          <Button
            label={settings.status === "invalid" ? "Reset" : "Try again"}
            theme={theme}
            disabled={settings.saving}
            onPress={() => void (settings.status === "invalid" ? settings.reset() : settings.reload())}
          />
        </Row>
      </Card>
    );
  const current = settings.values;
  const save = (values: typeof current) => {
    void settings.save(values, settings.revision).then((ok) => {
      if (ok) setEditing(null);
    });
  };
  const edit = (what: "host" | "key", placeholder: string) =>
    editing?.what === what ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm, padding: SPACE.md }}>
        <Field
          value={editing.text}
          onChange={(text) => {
            setEditing({ what, text });
          }}
          disabled={settings.saving}
          placeholder={placeholder}
          secret={what === "key"}
          theme={theme}
        />
        <Button
          label="Cancel"
          tone="quiet"
          theme={theme}
          onPress={() => {
            setEditing(null);
          }}
        />
        <Button
          label="Save"
          tone="accent"
          theme={theme}
          disabled={settings.saving || editing.text.trim() === ""}
          onPress={() => {
            save({ ...current, [what]: what === "host" ? editing.text.trim().toLowerCase() : editing.text.trim() });
          }}
        />
      </View>
    ) : null;
  const change = (what: "host" | "key", label: string) =>
    editing?.what === what ? null : (
      <Button
        label={label}
        tone="quiet"
        theme={theme}
        onPress={() => {
          setEditing({ what, text: what === "host" ? current.host : "" });
        }}
      />
    );
  return (
    <>
      <Text style={muted}>A small model that spots trouble early. Optional: with it off, nothing breaks.</Text>
      <Card theme={theme}>
        <SettingsSwitch
          label="Ask the classifier"
          value={current.on}
          onValueChange={(on) => {
            save({ ...current, on });
          }}
          disabled={settings.saving}
        />
        <View>
          <Row kind="Host" title={current.host || "Not set"} dimmed={current.host === ""} theme={theme}>
            {change("host", "Change")}
          </Row>
          {edit("host", "A host the template's classifier is served at")}
        </View>
        <View>
          <Row kind="Key" title="" theme={theme}>
            <Tag label={current.key ? "set" : "not set"} tone={current.key ? "success" : "neutral"} theme={theme} />
            {change("key", current.key ? "Replace" : "Set a key")}
          </Row>
          {edit("key", "The key for that host")}
        </View>
      </Card>
      {settings.saveError ? (
        <Text style={[muted, { color: theme.colors.statusDanger }]}>{settings.saveError}</Text>
      ) : null}
      <Text style={muted}>
        A key lets a template served at this host be sent the record's text and the agents' words, with what looks like
        a secret masked first. The key goes to no other host, and is never shown.
      </Text>
    </>
  );
}
