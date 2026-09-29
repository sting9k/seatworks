import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";
import { CONTROL, FONT, RADIUS, SPACE, pressState, useStyles } from "./theme.ts";

/** `accent` is the one action a card asks for; `quiet` steps back beside it. */
type Tone = "accent" | "outline" | "quiet";

type Props = {
  readonly label: string;
  readonly theme: PluginTheme;
  readonly tone?: Tone;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
};

export function Button({ label, theme, tone = "outline", icon, disabled, onPress }: Props) {
  const styles = useStyles(
    theme,
    (colors) => ({
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: SPACE.sm,
        minHeight: CONTROL.height,
        paddingHorizontal: SPACE.md,
        borderRadius: RADIUS.control,
        borderWidth: tone === "quiet" ? 0 : 1,
        borderColor: tone === "accent" ? colors.accent : colors.border,
        backgroundColor: tone === "accent" ? colors.accent : "transparent",
      },
      label: {
        fontSize: FONT.base,
        color:
          tone === "accent" ? colors.accentForeground : tone === "quiet" ? colors.foregroundMuted : colors.foreground,
      },
    }),
    [tone],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressState(disabled, pressed)]}
    >
      {icon ? <Icon name={icon} size={14} color={styles.label.color} /> : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
