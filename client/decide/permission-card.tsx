import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Dot } from "../kit/mark.tsx";
import { FONT, SPACE, useStyles } from "../kit/theme.ts";
import { useHumanCommand } from "./send.ts";

type Permission = HumanView["permissions"][number];

/** An agent asking leave for what its sandbox would not let it do: allowed or refused, and the record says by whom. */
export function PermissionCard({
  project,
  permission,
  theme,
  onAnswered,
}: {
  project: string;
  permission: Permission;
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
  const answer = (allow: boolean) => {
    const reason = allow ? "allowed by the Human" : "refused by the Human";
    void send("answer_permission", { permission: permission.id, allow, reason }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Card theme={theme}>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Dot tone="you" theme={theme} size={6} />
          <Text style={styles.small}>{permission.actor} asks your leave</Text>
        </View>
        <Text style={styles.text} selectable>
          {permission.text}
        </Text>
        <View style={styles.actions}>
          <Button
            label="Allow"
            icon="Check"
            tone="accent"
            theme={theme}
            disabled={busy}
            onPress={() => {
              answer(true);
            }}
          />
          <Button
            label="Refuse"
            icon="X"
            theme={theme}
            disabled={busy}
            onPress={() => {
              answer(false);
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
