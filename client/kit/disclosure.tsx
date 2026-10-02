import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Rows, faded } from "./card.tsx";
import { FONT, SPACE, pressState, useStyles } from "./theme.ts";

/** One line of a list that opens in place; `body` is what it shows open, none for a line that only leads somewhere. */
export type DisclosureItem = {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly dimmed?: boolean;
  readonly body?: ReactNode;
  readonly onPress?: () => void;
};

type Props = {
  readonly items: readonly DisclosureItem[];
  readonly open: string | null;
  readonly theme: PluginTheme;
  readonly compact?: boolean;
  readonly onOpen: (id: string | null) => void;
};

/** A long list kept to one line an item, opening one at a time, so many scopes stay one screen tall. */
export function DisclosureList({ items, open, theme, compact, onOpen }: Props) {
  const styles = useStyles(
    theme,
    (colors) => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        paddingLeft: SPACE.md,
        paddingRight: SPACE.lg,
        paddingVertical: compact ? 10 : SPACE.md,
      },
      opened: { backgroundColor: faded(colors.surface2, 0.5) },
      words: { flex: 1, gap: 2, minWidth: 0 },
      title: { fontSize: FONT.base, color: colors.foreground },
      dim: { color: colors.foregroundMuted },
      hint: { fontSize: FONT.small, color: colors.foregroundMuted },
      body: { paddingLeft: 36, paddingRight: SPACE.lg, paddingBottom: 14, gap: SPACE.sm },
    }),
    [compact],
  );
  return (
    <Card theme={theme}>
      <Rows theme={theme}>
        {items.map((item) => {
          const isOpen = open === item.id && item.body !== undefined;
          const press = item.body
            ? () => {
                onOpen(isOpen ? null : item.id);
              }
            : item.onPress;
          return (
            <View key={item.id} style={isOpen ? styles.opened : null}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: item.body ? isOpen : undefined }}
                accessibilityLabel={item.title}
                disabled={!press}
                onPress={press}
                style={({ pressed }) => [styles.row, pressState(false, pressed && Boolean(press))]}
              >
                {item.body ? (
                  <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
                ) : null}
                {item.leading}
                <View style={styles.words}>
                  <Text style={[styles.title, item.dimmed ? styles.dim : null]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.hint ? (
                    <Text style={styles.hint} numberOfLines={2}>
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                {item.trailing}
                {!item.body && item.onPress ? (
                  <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
                ) : null}
              </Pressable>
              {isOpen ? <View style={styles.body}>{item.body}</View> : null}
            </View>
          );
        })}
      </Rows>
    </Card>
  );
}
