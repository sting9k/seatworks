import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { View } from "react-native";
import type { Tone } from "../state/team.ts";

const BOX = 16;

/** What a line is doing, as a shape: a ringed dot waits on the Human, a dot works, a ring waits, a check is done. */
export function Mark({ tone, theme }: { tone: Tone | "stuck"; theme: PluginTheme }) {
  const { statusWarning, statusSuccess, statusDanger, foreground, foregroundMuted } = theme.colors;
  const box = { width: BOX, height: BOX, alignItems: "center" as const, justifyContent: "center" as const };
  if (tone === "stuck") return <Icon name="TriangleAlert" size={14} color={statusDanger} />;
  if (tone === "done") return <Icon name="Check" size={14} color={statusSuccess} />;
  if (tone === "you")
    return (
      <View style={[box, { borderRadius: BOX / 2, borderWidth: 1.5, borderColor: statusWarning }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusWarning }} />
      </View>
    );
  const hollow = tone !== "work";
  return (
    <View style={box}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: hollow ? 1.5 : 0,
          borderColor: foregroundMuted,
          backgroundColor: hollow ? "transparent" : foreground,
          opacity: tone === "off" ? 0.5 : 1,
        }}
      />
    </View>
  );
}
