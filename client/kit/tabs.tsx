import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";
import { CONTROL, FONT, RADIUS, SPACE, useStyles } from "./theme.ts";

export type Tab<Id extends string> = { readonly id: Id; readonly label: string };

type Props<Id extends string> = {
  readonly tabs: readonly Tab<Id>[];
  readonly active: Id;
  readonly theme: PluginTheme;
  readonly onPick: (id: Id) => void;
};

/** One job a tab, drawn as the host draws a workspace's own tabs: a row of chips, the chosen one raised. */
export function Tabs<Id extends string>({ tabs, active, theme, onPick }: Props<Id>) {
  const styles = useStyles(theme, (colors) => ({
    row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: SPACE.xs },
    tab: {
      minHeight: CONTROL.small,
      justifyContent: "center" as const,
      paddingHorizontal: 10,
      borderRadius: RADIUS.control,
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
