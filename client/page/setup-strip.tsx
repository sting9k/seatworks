import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import type { Step } from "../state/setup.ts";

type Props = {
  readonly steps: readonly Step[];
  readonly theme: PluginTheme;
  readonly onPick: (step: Step["id"]) => void;
};

/** What is left of setting up, on one line: done, the one to do now, and those after it. A press goes to its tab. */
export function SetupStrip({ steps, theme, onPick }: Props) {
  const { surface1, border, accent, accentForeground, foreground, foregroundMuted, statusSuccess } = theme.colors;
  const current = steps.find((step) => !step.done);
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SPACE.lg,
        paddingVertical: 10,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: surface1,
      }}
    >
      {steps.map((step, at) => {
        const now = step === current;
        return (
          <Pressable
            key={step.id}
            accessibilityRole="button"
            accessibilityLabel={`${step.label}, ${step.done ? "done" : "to do"}`}
            onPress={() => {
              onPick(step.id);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: now ? 0 : 1,
                borderColor: step.done ? statusSuccess : border,
                backgroundColor: now ? accent : "transparent",
              }}
            >
              {step.done ? (
                <Icon name="Check" size={12} color={statusSuccess} />
              ) : (
                <Text
                  style={{ fontSize: FONT.small, fontWeight: "500", color: now ? accentForeground : foregroundMuted }}
                >
                  {at + 1}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: FONT.base,
                fontWeight: now ? "500" : "400",
                color: now ? foreground : foregroundMuted,
              }}
            >
              {step.label}
            </Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>
        {steps.filter((step) => step.done).length} of {steps.length}
      </Text>
    </View>
  );
}
