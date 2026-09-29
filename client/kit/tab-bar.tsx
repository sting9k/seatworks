import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";
import { FONT, useStyles } from "./theme.ts";

export type Tab<Id extends string> = { readonly id: Id; readonly label: string };

/** The host's segmented tabs: one row, the chosen one raised. */
export function TabBar<Id extends string>({
  tabs,
  active,
  theme,
  onPick,
}: {
  tabs: readonly Tab<Id>[];
  active: Id;
  theme: PluginTheme;
  onPick: (id: Id) => void;
}) {
  const styles = useStyles(theme, (colors) => ({
    row: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignSelf: "flex-start" as const,
      gap: 2,
      padding: 2,
      borderRadius: 8,
      backgroundColor: colors.surface1,
    },
    tab: {
      minHeight: 28,
      justifyContent: "center" as const,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    on: { backgroundColor: colors.surface2 },
    label: { color: colors.foregroundMuted, fontSize: FONT.base },
    labelOn: { color: colors.foreground },
  }));
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            style={[styles.tab, on ? styles.on : null]}
            onPress={() => {
              onPick(tab.id);
            }}
          >
            <Text style={[styles.label, on ? styles.labelOn : null]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
