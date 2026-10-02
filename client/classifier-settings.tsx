import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  type SettingsInputHandle,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { reflexSettings } from "../shared/contracts/settings.ts";

/** Whether a template's classifier is asked on this machine, and the one host the key is sent to. The key is never shown. */
export function ClassifierSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(reflexSettings);
  const [key, setKey] = useState("");
  const [host, setHost] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const field = useRef<SettingsInputHandle>(null);
  if (settings.status === "loading") return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Classifier">
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
      title="Classifier"
      info="A template may name a model its questions about the record and the agents' words are asked of, and where it is served. Setting a key is your consent to send that text to this one host, by a template served there; what looks like a secret is masked first. Switched off, or with no key, the team works on, watched by what the plugin counts itself and by whoever the template seats to watch."
    >
      <SettingsCard>
        <SettingsSwitch
          label="Ask the classifier a template names"
          hint={current.on ? "On, for a template that names one." : "Off: no model is asked on this machine."}
          value={current.on}
          onValueChange={(on) => void settings.save({ ...current, on }, settings.revision)}
          disabled={settings.saving}
        />
        <SettingsInput
          label="Host the key is for"
          hint={`The key goes to ${current.host || "no host"} and to no other, whatever a template names.`}
          initialValue={current.host}
          onChangeText={setHost}
          placeholder="a host the template's classifier is served at"
          disabled={settings.saving}
        />
        <SettingsAction
          label="Save the host"
          actionLabel="Save"
          disabled={settings.saving || host === null || host.trim().toLowerCase() === current.host}
          onPress={() => void settings.save({ ...current, host: (host ?? "").trim().toLowerCase() }, settings.revision)}
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
