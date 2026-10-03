import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { FONT } from "../kit/theme.ts";
import { Decision, Words } from "./frame.tsx";
import { useHumanCommand } from "./send.ts";

type Props = {
  readonly project: string;
  readonly attention: HumanView["attentions"][number];
  readonly theme: PluginTheme;
  readonly onAnswered: () => void;
};

/** Something about an agent that climbed past the root and stopped with the Human: seen, or marked noise. */
export function AttentionCard({ project, attention, theme, onAnswered }: Props) {
  const { busy, said, send } = useHumanCommand(project);
  const settle = (type: "acknowledge" | "mark_noise") => {
    void send(type, { attention: attention.id }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Decision
      kind="Heads-up"
      from={`about ${attention.actor}`}
      theme={theme}
      refused={said && !said.ok ? said.text : null}
      actions={
        <>
          <Button
            label="Seen"
            icon="Check"
            theme={theme}
            disabled={busy}
            onPress={() => {
              settle("acknowledge");
            }}
          />
          <Button
            label="Not a problem"
            tone="quiet"
            theme={theme}
            disabled={busy}
            onPress={() => {
              settle("mark_noise");
            }}
          />
        </>
      }
    >
      <Words text={attention.why} theme={theme} />
      {attention.facts.length > 0 ? (
        <View style={{ gap: 4 }}>
          {attention.facts.map((fact) => (
            <Text key={fact} style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted }}>
              {fact}
            </Text>
          ))}
        </View>
      ) : null}
    </Decision>
  );
}
