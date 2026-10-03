import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../kit/button.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { startOf } from "../state/models.ts";
import { useModelsOf } from "../state/provider-models.ts";
import type { Wanted } from "../state/runs.ts";
import { AgentPicks } from "./agent-picks.tsx";

type Props = {
  /** How many names the template gives that Paseo has no agent profile for. */
  readonly missing: number;
  /** The providers Paseo finds on this machine. */
  readonly providers: readonly string[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onCreate: (wanted: Wanted) => void;
};

/** Makes in Paseo the agent profiles a template names that it lacks, on one line: a provider, a model, an effort. */
export function CreateAgents({ missing, providers, theme, busy, onCreate }: Props) {
  const [picked, setPicked] = useState<Wanted | null>(null);
  const first = providers[0];
  const { models, problem, read } = useModelsOf(first === undefined ? [] : [picked?.provider ?? first]);
  const { foregroundMuted, statusDanger, surface0, border } = theme.colors;
  const provider = picked?.provider ?? first;
  const listed = provider === undefined ? undefined : models[provider];
  const start = listed ? startOf(listed) : null;
  const wanted = picked ?? (provider !== undefined && start ? { provider, ...start } : null);
  const says =
    provider === undefined
      ? "Paseo finds no provider here to run an agent on."
      : (problem ?? (wanted ? null : `Reading the models of ${provider}.`));
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 52,
        paddingHorizontal: SPACE.lg,
        backgroundColor: surface0,
        borderTopWidth: 1,
        borderTopColor: border,
      }}
    >
      <Text
        style={{ flex: 1, minWidth: 0, fontSize: FONT.small, color: problem ? statusDanger : foregroundMuted }}
        numberOfLines={2}
      >
        {says ?? (missing === 1 ? "Create the one in Paseo on" : `Create the ${missing} in Paseo on`)}
      </Text>
      {wanted && listed ? (
        <>
          <AgentPicks
            name="the new profiles"
            runs={wanted}
            providers={providers}
            models={listed}
            read={read}
            theme={theme}
            busy={busy}
            onWant={setPicked}
          />
          <Button
            label={`Create ${missing}`}
            tone="accent"
            theme={theme}
            disabled={busy}
            onPress={() => {
              onCreate(wanted);
            }}
          />
        </>
      ) : null}
    </View>
  );
}
