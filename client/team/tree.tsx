import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";
import { Mark } from "../kit/mark.tsx";
import { CONTROL, FONT, RADIUS, SPACE, pressState } from "../kit/theme.ts";
import type { Seat } from "../state/team.ts";

type Props = {
  readonly seats: readonly Seat[];
  readonly theme: PluginTheme;
  /** Opens a seat's chat; none where the host gives no way to. */
  readonly onOpen: ((owner: string) => (() => void) | undefined) | undefined;
};

/** The team as a tree, a seat a line: its mark, what it is for, and one word for what it is doing now. */
export function Tree({ seats, theme, onOpen }: Props) {
  const { foreground, foregroundMuted, statusWarning, statusSuccess } = theme.colors;
  return (
    <View style={{ gap: 2 }}>
      {seats.map((seat) => {
        const open = seat.owner === null ? undefined : onOpen?.(seat.owner);
        const color = seat.tone === "you" ? statusWarning : seat.tone === "done" ? statusSuccess : foregroundMuted;
        return (
          <Pressable
            key={seat.scope}
            accessibilityRole="button"
            accessibilityLabel={`${seat.title ?? seat.scope}, ${seat.says}`}
            disabled={!open}
            onPress={open}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: SPACE.sm,
                minHeight: CONTROL.height,
                paddingRight: SPACE.sm,
                paddingLeft: SPACE.sm + seat.depth * 14,
                borderRadius: RADIUS.control,
              },
              pressState(false, pressed && Boolean(open)),
            ]}
          >
            <Mark tone={seat.tone} theme={theme} />
            <Text
              style={{
                flex: 1,
                fontSize: FONT.base,
                color: seat.title && seat.tone !== "off" ? foreground : foregroundMuted,
              }}
              numberOfLines={1}
            >
              {seat.title ?? "No goal yet"}
            </Text>
            <Text style={{ fontSize: FONT.small, color }}>{seat.says}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
