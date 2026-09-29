import type { PluginTheme } from "@getpaseo/plugin";
import { Children, type ReactNode, isValidElement } from "react";
import { View } from "react-native";
import { RADIUS, useStyles } from "./theme.ts";

/** A theme colour faded, for a border or a row held open; a colour that is not plain hex is used as it is. */
export function faded(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The host's card look, for rows the host's own SettingsCard cannot hold. */
export function Card({ theme, accent, children }: { theme: PluginTheme; accent?: string; children: ReactNode }) {
  const styles = useStyles(
    theme,
    (colors) => ({
      card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: accent ? faded(accent, 0.6) : colors.border,
        backgroundColor: colors.surface1,
        overflow: "hidden" as const,
      },
    }),
    [accent],
  );
  return <View style={styles.card}>{children}</View>;
}

/** Stacked children with a rule between each, as the host's cards draw their rows. */
export function Rows({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  const shown = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {shown.map((child, index) => (
        <View
          key={child.key ?? index}
          style={index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
