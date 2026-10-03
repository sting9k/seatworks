import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { FONT, SPACE } from "./theme.ts";

type RowProps = {
  readonly title: string;
  /** A few muted words beside the title: a path, a count. Never a sentence. */
  readonly meta?: string;
  /** A name for what the row is, in a narrow column before its title. */
  readonly kind?: string;
  readonly dimmed?: boolean;
  /** A line that is a thing of its own, such as a project, stands taller than a line of a list. */
  readonly height?: number;
  readonly theme: PluginTheme;
  readonly children?: ReactNode;
};

const GAP = 10;
const KIND = 110;
/** Where a row's words start once it names its kind: what opens under one lines up with them. */
export const UNDER_KIND = SPACE.lg + KIND + GAP;

/** One line of a card: what it is, at most a few muted words, then its tags and its one button. */
export function Row({ title, meta, kind, dimmed, height = 44, theme, children }: RowProps) {
  const { foreground, foregroundMuted } = theme.colors;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: GAP,
        minHeight: height,
        paddingVertical: 6,
        paddingHorizontal: SPACE.lg,
      }}
    >
      {kind ? (
        <Text style={{ width: KIND, fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
          {kind}
        </Text>
      ) : null}
      <Text
        style={{ flexShrink: 1, fontSize: FONT.base, color: dimmed ? foregroundMuted : foreground }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={{ flex: 1, minWidth: 0, fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
        {meta ?? ""}
      </Text>
      {children}
    </View>
  );
}

/** The name over a card, with a count or a quiet action at its right. */
export function Label({ text, theme, children }: { text: string; theme: PluginTheme; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 20, paddingHorizontal: SPACE.xs }}>
      <Text style={{ flex: 1, fontSize: FONT.small, color: theme.colors.foregroundMuted }}>{text}</Text>
      {children}
    </View>
  );
}
