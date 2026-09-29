import type { PluginTheme } from "@getpaseo/plugin";
import { View } from "react-native";

/** What a line is doing, by colour and never by colour alone: `you` waits on the Human, `wait` on someone else. */
export type Tone = "you" | "work" | "wait" | "done" | "off";

export function toneColor(theme: PluginTheme, tone: Tone): string {
  const { statusWarning, statusSuccess, foregroundMuted } = theme.colors;
  return {
    you: statusWarning,
    work: foregroundMuted,
    wait: foregroundMuted,
    done: statusSuccess,
    off: foregroundMuted,
  }[tone];
}

/** A dot for a line's tone; one that waits is hollow, so it reads apart from one at work without the words. */
export function Dot({ tone, theme, size = 7 }: { tone: Tone; theme: PluginTheme; size?: number }) {
  const color = toneColor(theme, tone);
  const hollow = tone === "wait" || tone === "off";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: hollow ? 1.2 : 0,
        borderColor: color,
        backgroundColor: hollow ? "transparent" : color,
        opacity: tone === "off" ? 0.6 : 1,
      }}
    />
  );
}
