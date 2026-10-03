import type { PluginTheme } from "@getpaseo/plugin";
import { Children, type ReactNode, isValidElement } from "react";
import { View } from "react-native";
import { RADIUS, useStyles } from "./theme.ts";

/** The host's card look, with a rule between each of its children as the host's own cards draw their rows. */
export function Card({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  const styles = useStyles(theme, (colors) => ({
    card: {
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
      overflow: "hidden" as const,
    },
    ruled: { borderTopWidth: 1, borderTopColor: colors.border },
  }));
  const shown = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.card}>
      {shown.map((child, index) => (
        <View key={child.key ?? index} style={index > 0 ? styles.ruled : null}>
          {child}
        </View>
      ))}
    </View>
  );
}
