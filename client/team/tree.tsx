import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import { Mark } from "../kit/mark.tsx";
import { CONTROL, FONT, RADIUS, SPACE, pressState } from "../kit/theme.ts";
import { type Seat, sitsOf } from "../state/team.ts";

type Props = {
  readonly seats: readonly Seat[];
  readonly theme: PluginTheme;
  /** What a press on a seat does; none where it does nothing. */
  readonly onPress: (seat: Seat) => (() => void) | undefined;
  /** Given where there is room beside the tree: the seat shown there; each line then says who sits in it. */
  readonly shown?: string | null;
};

/** The team as a tree, a seat a line: its mark, what it is for, and one word for what it is doing now. */
export function Tree({ seats, theme, onPress, shown }: Props) {
  const { foreground, foregroundMuted, statusWarning, statusSuccess, surface2 } = theme.colors;
  const wide = shown !== undefined;
  return (
    <View style={{ gap: 2, padding: wide ? SPACE.xs : 0 }}>
      {seats.map((seat) => {
        const press = onPress(seat);
        const color = seat.tone === "you" ? statusWarning : seat.tone === "done" ? statusSuccess : foregroundMuted;
        return (
          <Pressable
            key={seat.scope}
            accessibilityRole="button"
            accessibilityLabel={`${seat.title ?? seat.scope}, ${seat.says}`}
            accessibilityState={{ selected: seat.scope === shown }}
            disabled={!press}
            onPress={press}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: SPACE.sm,
                minHeight: wide ? 52 : CONTROL.height,
                paddingRight: SPACE.sm,
                paddingLeft: SPACE.sm + seat.depth * (wide ? 20 : 14),
                borderRadius: RADIUS.control,
                backgroundColor: seat.scope === shown ? surface2 : "transparent",
              },
              pressState(false, pressed && Boolean(press)),
            ]}
          >
            <Mark tone={seat.tone} theme={theme} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                style={{ fontSize: FONT.base, color: seat.title && seat.tone !== "off" ? foreground : foregroundMuted }}
                numberOfLines={1}
              >
                {seat.title ?? "No goal yet"}
              </Text>
              {wide ? (
                <Text style={{ fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
                  {sitsOf(seat)}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: FONT.small, color }}>{seat.says}</Text>
            {wide ? <Icon name="ChevronRight" size={14} color={foregroundMuted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
