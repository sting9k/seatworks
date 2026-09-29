import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text } from "react-native";
import { reflexSettings } from "../shared/contracts/settings.ts";

const ROUTES = [
  { label: "OpenRouter, data collection denied", value: "openrouter" },
  { label: "TypeSafe's own API", value: "typesafe" },
] as const;

/** Where the reflex asks Jev. The key is written, never read back: the field starts empty and saving keeps it. */
export function JevSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(reflexSettings);
  const [key, setKey] = useState("");
  if (settings.status !== "ready")
    return (
      <Text style={{ color: theme.colors.foregroundMuted }}>
        {settings.status === "loading" ? "Loading…" : settings.error}
      </Text>
    );
  const current = settings.values;
  return (
    <SettingsSection
      title="Jev"
      info="The reflex asks Jev typed questions about the record and the agents' words. Setting a key is your consent to send that text to the route you choose; what looks like a secret is masked first. Without a key the team works on, less watched."
    >
      <SettingsCard>
        <SettingsSelect
          label="Route"
          value={current.route}
          options={ROUTES}
          onValueChange={(route) => void settings.save({ ...current, route }, settings.revision)}
          disabled={settings.saving}
        />
        <SettingsInput
          label="Key"
          hint={current.key ? "A key is set. Type a new one to replace it." : "No key is set."}
          onChangeText={setKey}
          secureTextEntry
          disabled={settings.saving}
          error={settings.saveError}
        />
        <SettingsAction
          label="Save the key"
          actionLabel="Save"
          disabled={settings.saving || key.trim() === ""}
          onPress={() => void settings.save({ ...current, key: key.trim() }, settings.revision)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
