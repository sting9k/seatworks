import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  type SettingsInputHandle,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { reflexSettings } from "../shared/contracts/settings.ts";

const ROUTES = [
  { label: "OpenRouter, data collection denied", value: "openrouter" },
  { label: "TypeSafe's own API", value: "typesafe" },
] as const;

/** Where the reflex asks Jev. The key is never shown: the field starts empty and is emptied once the key is saved. */
export function JevSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(reflexSettings);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const field = useRef<SettingsInputHandle>(null);
  if (settings.status === "loading") return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Jev">
        <SettingsCard>
          {settings.status === "invalid" ? (
            <SettingsAction
              label="The stored settings are not ones Seatworks reads"
              error={settings.error}
              actionLabel="Reset"
              disabled={settings.saving}
              onPress={() => void settings.reset()}
            />
          ) : (
            <SettingsAction
              label="The settings could not be read"
              error={settings.error}
              actionLabel="Try again"
              onPress={() => void settings.reload()}
            />
          )}
        </SettingsCard>
      </SettingsSection>
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
          hint={
            saved
              ? "Saved. Type a new one to replace it."
              : current.key
                ? "A key is set. Type a new one to replace it."
                : "No key is set."
          }
          ref={field}
          onChangeText={(text) => {
            setKey(text);
            setSaved(false);
          }}
          secureTextEntry
          disabled={settings.saving}
          error={settings.saveError}
        />
        <SettingsAction
          label="Save the key"
          actionLabel="Save"
          disabled={settings.saving || key.trim() === ""}
          onPress={() =>
            void settings.save({ ...current, key: key.trim() }, settings.revision).then((ok) => {
              if (!ok) return;
              field.current?.replaceText("");
              setKey("");
              setSaved(true);
            })
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}
