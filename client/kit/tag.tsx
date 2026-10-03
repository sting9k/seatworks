import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import { FONT, faded } from "./theme.ts";

type Tone = "neutral" | "warning" | "success" | "danger";

/** A state in a word or two, where a sentence would be read past. */
export function Tag({ label, tone = "neutral", theme }: { label: string; tone?: Tone; theme: PluginTheme }) {
  const { surface2, foregroundMuted, statusWarning, statusSuccess, statusDanger } = theme.colors;
  const color = { neutral: foregroundMuted, warning: statusWarning, success: statusSuccess, danger: statusDanger }[
    tone
  ];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: tone === "neutral" ? surface2 : faded(color, 0.16),
      }}
    >
      <Text style={{ fontSize: FONT.small, color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
