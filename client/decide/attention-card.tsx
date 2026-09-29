import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Dot } from "../kit/mark.tsx";
import { FONT, SPACE, useStyles } from "../kit/theme.ts";
import { useHumanCommand } from "./send.ts";

type Attention = HumanView["attentions"][number];

/** Something about an agent that climbed past the root and stopped with the Human: seen, or marked noise. */
export function AttentionCard({
  project,
  attention,
  theme,
  onAnswered,
}: {
  project: string;
  attention: Attention;
  theme: PluginTheme;
  onAnswered: () => void;
}) {
  const { busy, said, send } = useHumanCommand(project);
  const styles = useStyles(theme, (colors) => ({
    body: { padding: SPACE.md, gap: SPACE.md },
    meta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    small: { fontSize: FONT.small, color: colors.foregroundMuted },
    text: { fontSize: FONT.base, lineHeight: 20, color: colors.foreground },
    actions: { flexDirection: "row" as const, gap: SPACE.sm },
  }));
  const settle = (type: "acknowledge" | "mark_noise") => {
    void send(type, { attention: attention.id }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Card theme={theme}>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Dot tone="you" theme={theme} size={6} />
          <Text style={styles.small}>
            About {attention.actor} in scope {attention.scope}
          </Text>
        </View>
        <Text style={styles.text}>{attention.why}</Text>
        {attention.facts.map((f) => (
          <Text key={f} style={styles.small}>
            {f}
          </Text>
        ))}
        <View style={styles.actions}>
          <Button
            label="Seen"
            icon="Check"
            tone="accent"
            theme={theme}
            disabled={busy}
            onPress={() => {
              settle("acknowledge");
            }}
          />
          <Button
            label="Noise"
            icon="X"
            theme={theme}
            disabled={busy}
            onPress={() => {
              settle("mark_noise");
            }}
          />
        </View>
        {said && !said.ok ? (
          <Text style={[styles.small, { color: theme.colors.statusWarning }]}>{said.text}</Text>
        ) : null}
      </View>
    </Card>
  );
}
