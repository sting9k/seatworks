import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { CONTROL, FONT, RADIUS, SPACE, faded, pressState } from "./theme.ts";

type Props = {
  readonly text: string;
  readonly tone: "danger" | "warning";
  readonly theme: PluginTheme;
  /** Where the thing is mended; a banner with none only says. */
  readonly onPress?: () => void;
  /** The one button that mends it in place. */
  readonly children?: ReactNode;
};

/** One line for what cannot wait: a seat that is stuck, a template that changed. */
export function Banner({ text, tone, theme, onPress, children }: Props) {
  const color = tone === "danger" ? theme.colors.statusDanger : theme.colors.statusWarning;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={text}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.sm,
          minHeight: CONTROL.height,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: RADIUS.control,
          backgroundColor: faded(color, 0.14),
        },
        pressState(false, pressed && Boolean(onPress)),
      ]}
    >
      <Icon name="TriangleAlert" size={14} color={color} />
      <Text style={{ flex: 1, fontSize: FONT.small, color: theme.colors.foreground }}>{text}</Text>
      {onPress ? <Icon name="ChevronRight" size={12} color={theme.colors.foregroundMuted} /> : null}
      {children}
    </Pressable>
  );
}
