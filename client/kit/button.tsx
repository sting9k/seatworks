import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";
import { CONTROL, FONT, RADIUS, SPACE, pressState, useStyles } from "./theme.ts";

/** `accent` is the one action a card asks for, `danger` the one that cannot be undone; `quiet` steps back. */
type Tone = "accent" | "tonal" | "quiet" | "danger";

type Props = {
  readonly label: string;
  readonly theme: PluginTheme;
  readonly tone?: Tone;
  /** A small button sits in a row of quick actions. */
  readonly small?: boolean;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
};

export function Button({ label, theme, tone = "tonal", small, icon, disabled, onPress }: Props) {
  const styles = useStyles(
    theme,
    (colors) => ({
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: small ? 6 : SPACE.sm,
        minHeight: small ? CONTROL.small : CONTROL.height,
        paddingHorizontal: small ? 10 : SPACE.md,
        borderRadius: small ? RADIUS.control : RADIUS.card,
        backgroundColor: {
          accent: colors.accent,
          tonal: colors.surface2,
          quiet: "transparent",
          danger: colors.statusDanger,
        }[tone],
      },
      label: {
        fontSize: small ? FONT.small : FONT.base,
        color: {
          accent: colors.accentForeground,
          tonal: colors.foreground,
          quiet: colors.foregroundMuted,
          danger: colors.surface0,
        }[tone],
      },
    }),
    [tone, small],
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
      {icon ? <Icon name={icon} size={14} color={small ? theme.colors.foregroundMuted : styles.label.color} /> : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
