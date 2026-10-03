import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Waiting } from "../decide/waiting.tsx";
import { Button } from "../kit/button.tsx";
import { Label } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { type Seat, sitsOf, waitingAt, waitingOf } from "../state/team.ts";

type Props = {
  readonly seat: Seat;
  readonly project: string;
  readonly human: HumanView;
  readonly theme: PluginTheme;
  /** Opens the chat of whoever sits in it; none where nobody does, or the host gives no way to. */
  readonly onOpen: (() => void) | undefined;
  readonly onAnswered: () => void;
};

/** One seat beside the tree: what it is for, who sits in it, its chat, and what waits on the Human from it. */
export function SeatDetail({ seat, project, human, theme, onOpen, onAnswered }: Props) {
  const waits = waitingAt(human, seat.scope);
  const { foreground, foregroundMuted } = theme.colors;
  return (
    <View style={{ gap: SPACE.md }}>
      <View style={{ gap: SPACE.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
          <Text style={{ flexShrink: 1, fontSize: FONT.title, fontWeight: "600", color: foreground }} numberOfLines={2}>
            {seat.title ?? "No goal yet"}
          </Text>
          <Tag
            label={seat.says}
            tone={seat.tone === "you" ? "warning" : seat.tone === "done" ? "success" : "neutral"}
            theme={theme}
          />
        </View>
        <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>{sitsOf(seat)}</Text>
      </View>
      {onOpen ? (
        <View style={{ flexDirection: "row" }}>
          <Button label="Open its chat" theme={theme} onPress={onOpen} />
        </View>
      ) : null}
      {waitingOf(waits) > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Label text="Waiting on you here" theme={theme} />
          <Waiting project={project} human={waits} theme={theme} onAnswered={onAnswered} />
        </View>
      ) : null}
    </View>
  );
}
