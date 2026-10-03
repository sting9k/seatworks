import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Mark } from "../kit/mark.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";

type Props = {
  /** What kind of thing waits, in a word or two. */
  readonly kind: string;
  /** Who it came from. */
  readonly from: string;
  readonly theme: PluginTheme;
  /** What the record said back when an answer was refused. */
  readonly refused: string | null;
  readonly actions: ReactNode;
  readonly children: ReactNode;
};

/** The frame every thing that waits on the Human is shown in: what it is, who sent it, its words, its actions. */
export function Decision({ kind, from, theme, refused, actions, children }: Props) {
  const { surface1, border, foreground, foregroundMuted, statusWarning } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  return (
    <View
      style={{
        padding: SPACE.md,
        gap: SPACE.md,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
        <Mark tone="you" theme={theme} />
        <Text style={{ fontSize: FONT.small, fontWeight: "500", color: foreground }}>{kind}</Text>
        <Text style={[small, { flex: 1 }]} numberOfLines={1}>
          {from}
        </Text>
      </View>
      {children}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm }}>{actions}</View>
      {refused ? <Text style={[small, { color: statusWarning }]}>{refused}</Text> : null}
    </View>
  );
}

/** The words of a thing that waits: what was asked, said or claimed. */
export function Words({ text, theme }: { text: string; theme: PluginTheme }) {
  return (
    <Text style={{ fontSize: FONT.base, lineHeight: 20, color: theme.colors.foreground }} selectable>
      {text}
    </Text>
  );
}
