import { TextInput } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Dot } from "../kit/mark.tsx";
import { FONT, RADIUS, SPACE, useStyles } from "../kit/theme.ts";
import { useHumanCommand } from "./send.ts";

type Claim = HumanView["claims"][number];

/** The root's claim that the work is ready — the Human lands it (publish) or sends it back. */
export function ClaimCard({
  project,
  claim,
  remote,
  theme,
  onAnswered,
}: {
  project: string;
  claim: Claim;
  remote: string | null;
  theme: PluginTheme;
  onAnswered: () => void;
}) {
  const [why, setWhy] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  const styles = useStyles(theme, (colors) => ({
    body: { padding: SPACE.md, gap: SPACE.md },
    meta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    small: { fontSize: FONT.small, color: colors.foregroundMuted },
    text: { fontSize: FONT.base, lineHeight: 20, color: colors.foreground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.control,
      padding: SPACE.sm,
      color: colors.foreground,
      fontSize: FONT.base,
    },
    actions: { flexDirection: "row" as const, gap: SPACE.sm },
  }));
  const publish = () => {
    void send("publish", { remote }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  const sendBack = () => {
    void send("send_back", { scope: claim.scope, reason: why.trim() }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Card theme={theme}>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Dot tone="you" theme={theme} size={6} />
          <Text style={styles.small}>
            {claim.by} says the work is ready · {claim.commit}
          </Text>
        </View>
        <Text style={styles.text} selectable>
          {claim.text}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Why it goes back"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={why}
          onChangeText={setWhy}
        />
        <View style={styles.actions}>
          {remote !== null ? (
            <Button
              label={`Publish to ${remote}`}
              icon="Check"
              tone="accent"
              theme={theme}
              disabled={busy}
              onPress={publish}
            />
          ) : null}
          <Button label="Send back" icon="X" theme={theme} disabled={busy || why.trim() === ""} onPress={sendBack} />
        </View>
        {said && !said.ok ? (
          <Text style={[styles.small, { color: theme.colors.statusWarning }]}>{said.text}</Text>
        ) : null}
      </View>
    </Card>
  );
}
