import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CONTROL, FONT, RADIUS, SPACE, faded, pressState } from "./theme.ts";

export type Choice = {
  readonly value: string;
  readonly label: string;
  /** A word or two at its right: whose default it is. */
  readonly note?: string;
};

type ChoicesProps = {
  readonly title: string;
  readonly choices: readonly Choice[];
  /** The one chosen now; none where nothing is. */
  readonly value: string | null;
  readonly theme: PluginTheme;
  readonly onClose: () => void;
  readonly onPick: (value: string) => void;
};

/** One of a few to choose, in the host's own modal: a line each, the chosen one marked. Shown for as long as it is there. */
export function Choices({ title, choices, value, theme, onClose, onPick }: ChoicesProps) {
  const { foreground, foregroundMuted, accent, surface2 } = theme.colors;
  return (
    <Modal
      title={title}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ padding: SPACE.sm, gap: 2 }}>
        {choices.map((choice) => {
          const on = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={choice.label}
              onPress={() => {
                onClose();
                if (!on) onPick(choice.value);
              }}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.sm,
                  minHeight: 34,
                  paddingHorizontal: SPACE.sm,
                  borderRadius: RADIUS.control,
                  backgroundColor: on ? surface2 : "transparent",
                },
                pressState(false, pressed),
              ]}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: on ? accent : foregroundMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} /> : null}
              </View>
              <Text
                style={{ flex: 1, fontSize: FONT.base, color: on ? foreground : foregroundMuted }}
                numberOfLines={1}
              >
                {choice.label}
              </Text>
              {choice.note ? <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>{choice.note}</Text> : null}
            </Pressable>
          );
        })}
      </Modal.Content>
    </Modal>
  );
}

type PickProps = {
  /** What is chosen, over the choices: "Model for" and the name it is for. */
  readonly title: string;
  /** What the chip says: the chosen one, or what to do where nothing is chosen. */
  readonly label: string;
  /** `unset` asks to be picked; `inherited` is a default from elsewhere, drawn as an outline. */
  readonly state?: "set" | "unset" | "inherited";
  readonly choices: readonly Choice[];
  readonly value: string | null;
  readonly theme: PluginTheme;
  readonly disabled?: boolean;
  readonly onPick: (value: string) => void;
};

/** A choice on a line, as small as its word: a press opens what there is to choose. */
export function Pick({ title, label, state = "set", choices, value, theme, disabled, onPick }: PickProps) {
  const [open, setOpen] = useState(false);
  const { foreground, foregroundMuted, surface2, border, statusWarning } = theme.colors;
  const color = { set: foreground, unset: statusWarning, inherited: foregroundMuted }[state];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${label}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.xs,
            flexShrink: 1,
            minHeight: CONTROL.small,
            paddingHorizontal: 10,
            borderRadius: RADIUS.control,
            borderWidth: 1,
            borderColor: state === "inherited" ? border : "transparent",
            backgroundColor: { set: surface2, unset: faded(statusWarning, 0.16), inherited: "transparent" }[state],
          },
          pressState(disabled, pressed),
        ]}
      >
        <Text style={{ flexShrink: 1, fontSize: FONT.small, fontWeight: "500", color }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name="ChevronDown" size={12} color={state === "unset" ? statusWarning : foregroundMuted} />
      </Pressable>
      {open ? (
        <Choices
          title={title}
          choices={choices}
          value={value}
          theme={theme}
          onClose={() => {
            setOpen(false);
          }}
          onPick={onPick}
        />
      ) : null}
    </>
  );
}
