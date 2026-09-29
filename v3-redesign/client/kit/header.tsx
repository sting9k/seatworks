import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { FONT, SPACE, useStyles } from "./theme.ts";

type Props = {
  readonly title: string;
  readonly subtitle?: string;
  readonly theme: PluginTheme;
  readonly onBack?: () => void;
  readonly action?: ReactNode;
};

/** A page's title row: back, the title with what it is about under it, and the one action the page offers. */
export function PageHeader({ title, subtitle, theme, onBack, action }: Props) {
  const styles = useStyles(theme, (colors) => ({
    row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingBottom: SPACE.sm },
    back: { width: 28, height: 28, alignItems: "center" as const, justifyContent: "center" as const },
    words: { flex: 1, gap: 2, minWidth: 0 },
    title: { color: colors.foreground, fontSize: FONT.title, fontWeight: "600" as const },
    subtitle: { color: colors.foregroundMuted, fontSize: FONT.small },
  }));
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.back} onPress={onBack}>
          <Icon name="ArrowLeft" size={16} color={styles.subtitle.color} />
        </Pressable>
      ) : null}
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
