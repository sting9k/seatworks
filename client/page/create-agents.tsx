import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../kit/button.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { effortOn, startOf } from "../state/models.ts";
import { useModels } from "../state/provider-models.ts";

type Props = {
  /** How many names the template gives that Paseo has no agent profile for. */
  readonly missing: number;
  /** The providers Paseo finds on this machine. */
  readonly providers: readonly string[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onCreate: (provider: string, model: string, effort: string | null) => void;
};

/** Makes in Paseo the agent profiles a template names that it lacks: on a provider, a model of it and an effort. */
export function CreateAgents({ missing, providers, theme, busy, onCreate }: Props) {
  const [picked, setPicked] = useState<{ provider?: string; model?: string; effort?: string | null }>({});
  const provider =
    picked.provider !== undefined && providers.includes(picked.provider) ? picked.provider : providers[0];
  const { models, problem } = useModels(provider ?? null);
  const { foregroundMuted, statusDanger } = theme.colors;
  const note = { fontSize: FONT.small, padding: SPACE.lg };
  if (provider === undefined)
    return <Text style={[note, { color: foregroundMuted }]}>Paseo finds no provider here to run an agent on.</Text>;
  if (problem) return <Text style={[note, { color: statusDanger }]}>{problem}</Text>;
  const start = models ? startOf(models) : null;
  if (!models || !start)
    return <Text style={[note, { color: foregroundMuted }]}>Reading the models of {provider}.</Text>;
  const model = models.find((one) => one.id === picked.model) ?? models.find((one) => one.id === start.model)!;
  const effort = picked.effort !== undefined ? effortOn(models, model.id, picked.effort) : model.defaultEffort;
  return (
    <View>
      <SettingsSelect
        label={missing === 1 ? "Create the one missing in Paseo, on" : `Create the ${missing} missing in Paseo, on`}
        value={provider}
        options={providers.map((name) => ({ label: name, value: name }))}
        disabled={busy}
        onValueChange={(next) => {
          setPicked({ provider: next });
        }}
      />
      <SettingsSelect
        label="Model"
        value={model.id}
        options={models.map((one) => ({ label: one.label, value: one.id }))}
        disabled={busy}
        onValueChange={(next) => {
          setPicked({ provider, model: next });
        }}
      />
      {model.efforts.length > 0 ? (
        <SettingsSelect
          label="Effort"
          value={effort ?? ""}
          options={[
            { label: "The model's own", value: "" },
            ...model.efforts.map((one) => ({ label: one.label, value: one.id })),
          ]}
          disabled={busy}
          onValueChange={(next) => {
            setPicked({ provider, model: model.id, effort: next === "" ? null : next });
          }}
        />
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: SPACE.lg,
          paddingBottom: SPACE.md,
        }}
      >
        <Button
          label={`Create ${missing}`}
          tone="accent"
          theme={theme}
          disabled={busy}
          onPress={() => {
            onCreate(provider, model.id, effort);
          }}
        />
      </View>
    </View>
  );
}
