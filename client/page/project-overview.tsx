import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { HumanView, ViewOutput } from "../../shared/contracts/rpc.ts";
import { waitsOf } from "../decide/waiting.tsx";
import { Card } from "../kit/card.tsx";
import { Mark } from "../kit/mark.tsx";
import { Meter } from "../kit/meter.tsx";
import { Label } from "../kit/row.tsx";
import { FONT, RADIUS, SPACE, pressState } from "../kit/theme.ts";
import { type Seat, countsOf } from "../state/team.ts";
import { sinceOf } from "../state/words.ts";
import { Tree } from "../team/tree.tsx";

/** How many of the last things that happened the page shows; the Team tab's record holds the rest. */
const LATELY = 4;

type Props = {
  readonly project: string;
  readonly view: ViewOutput;
  readonly human: HumanView;
  readonly seats: readonly Seat[];
  /** Whether the page has little room across: its two columns then stand one over the other. */
  readonly compact: boolean;
  readonly theme: PluginTheme;
  /** What a press on a seat does; none where its agent has no chat to open. */
  readonly onSeat: (seat: Seat) => (() => void) | undefined;
  readonly onAnswered: () => void;
};

/** A project at a glance: what is stuck, what waits on the Human, its team, what it spent, what happened lately. */
export function ProjectOverview({ project, view, human, seats, compact, theme, onSeat, onAnswered }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const { foreground, foregroundMuted, statusDanger, border, surface1 } = theme.colors;
  const box = {
    padding: SPACE.lg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: surface1,
  };
  const small = { fontSize: FONT.small, color: foregroundMuted };
  const waits = waitsOf({ project, human, theme, onAnswered });
  const counts = countsOf(seats);
  const numbers = [
    [seats.length, seats.length === 1 ? "seat" : "seats"],
    [counts.working, "working"],
    [counts.waiting, "waiting"],
    [view.landed, "landed"],
  ] as const;
  const lately = view.activity.slice(-LATELY).reverse();
  const now = Date.now();
  return (
    <>
      {view.stuck.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Label text="Stuck" theme={theme}>
            <Text style={small}>{view.stuck.length}</Text>
          </Label>
          <Card theme={theme}>
            {view.stuck.map((fact) => (
              <View
                key={fact}
                style={{ flexDirection: "row", gap: SPACE.sm, paddingVertical: 10, paddingHorizontal: SPACE.lg }}
              >
                <Icon name="TriangleAlert" size={14} color={statusDanger} />
                <Text style={{ flex: 1, fontSize: FONT.small, lineHeight: 18, color: foreground }} selectable>
                  {fact}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      {waits.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Label text="Needs you" theme={theme}>
            <Text style={small}>{waits.length}</Text>
          </Label>
          <Card theme={theme}>
            {waits.map((one) => {
              const open = one.id === picked;
              return (
                <View key={one.id}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${one.kind}: ${one.says}`}
                    onPress={() => {
                      setPicked(open ? null : one.id);
                    }}
                    style={({ pressed }) => [
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: SPACE.sm,
                        minHeight: 40,
                        paddingHorizontal: SPACE.lg,
                      },
                      pressState(false, pressed),
                    ]}
                  >
                    <Mark tone="you" theme={theme} />
                    <Text style={{ fontSize: FONT.small, fontWeight: "500", color: foreground }}>{one.kind}</Text>
                    <Text style={[small, { flex: 1 }]} numberOfLines={1}>
                      {one.says}
                    </Text>
                    <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={foregroundMuted} />
                  </Pressable>
                  {open ? <View style={{ padding: SPACE.md, paddingTop: 0 }}>{one.card}</View> : null}
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}
      <View style={{ flexDirection: compact ? "column" : "row", alignItems: "flex-start", gap: SPACE.lg }}>
        <View
          style={{ flex: compact ? undefined : 1, width: compact ? "100%" : undefined, minWidth: 0, gap: SPACE.sm }}
        >
          <Label text="Team" theme={theme} />
          <Card theme={theme}>
            <View style={{ flexDirection: "row", padding: SPACE.lg }}>
              {numbers.map(([count, name]) => (
                <View key={name} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: FONT.title, fontWeight: "600", color: foreground }}>{count}</Text>
                  <Text style={small}>{name}</Text>
                </View>
              ))}
            </View>
            <View style={{ padding: SPACE.xs }}>
              <Tree seats={seats} theme={theme} onPress={onSeat} />
            </View>
          </Card>
        </View>
        <View style={{ width: compact ? "100%" : 260, gap: SPACE.sm }}>
          <Label text="Spent" theme={theme} />
          <View style={box}>
            <Meter usd={human.spent.usd} of={human.spent.appetiteUsd} theme={theme} />
          </View>
          {lately.length > 0 ? (
            <>
              <Label text="Lately" theme={theme} />
              <View style={[box, { gap: 10 }]}>
                {lately.map((line) => (
                  <View key={`${line.at}:${line.text}`} style={{ flexDirection: "row", gap: SPACE.sm }}>
                    <Text style={[small, { width: 44 }]}>{sinceOf(now - Date.parse(line.at))}</Text>
                    <Text style={{ flex: 1, fontSize: FONT.small, color: foreground }} numberOfLines={2}>
                      {line.text}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </>
  );
}
