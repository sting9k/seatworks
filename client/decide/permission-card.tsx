import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { Decision } from "./frame.tsx";
import { useHumanCommand } from "./send.ts";

type Props = {
  readonly project: string;
  readonly permission: HumanView["permissions"][number];
  readonly theme: PluginTheme;
  readonly onAnswered: () => void;
};

/** An agent asking leave for what its sandbox would not let it do: allowed or refused, and the record says by whom. */
export function PermissionCard({ project, permission, theme, onAnswered }: Props) {
  const { busy, said, send } = useHumanCommand(project);
  const answer = (allow: boolean) => {
    const reason = allow ? "allowed by the Human" : "refused by the Human";
    void send("answer_permission", { permission: permission.id, allow, reason }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Decision
      kind="Asks permission"
      from={permission.actor}
      theme={theme}
      refused={said && !said.ok ? said.text : null}
      actions={
        <>
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
            theme={theme}
            disabled={busy}
            onPress={() => {
              answer(false);
            }}
          />
        </>
      }
    >
      <View style={{ padding: SPACE.sm, borderRadius: RADIUS.control, backgroundColor: theme.colors.surface2 }}>
        <Text style={{ fontSize: FONT.small, lineHeight: 18, color: theme.colors.foreground }} selectable>
          {permission.text}
        </Text>
      </View>
    </Decision>
  );
}
