import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable } from "react-native";
import { CONTROL } from "./theme.ts";

type Props = {
  readonly label: string;
  readonly checked: boolean;
  readonly theme: PluginTheme;
  /** A thing that cannot be picked shows a faded box and takes no press. */
  readonly locked?: boolean;
  readonly onChange: (checked: boolean) => void;
};

/** Picks a thing for a later press, where a switch would act at once. */
export function Check({ label, checked, theme, locked, onChange }: Props) {
  const { accent, accentForeground, foregroundMuted } = theme.colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(locked) }}
      disabled={locked}
      hitSlop={8}
      onPress={() => {
        onChange(!checked);
      }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: checked ? 0 : 1.5,
        borderColor: foregroundMuted,
        backgroundColor: checked ? accent : "transparent",
        opacity: locked ? CONTROL.faded : 1,
      }}
    >
      {checked ? <Icon name="Check" size={12} color={accentForeground} /> : null}
    </Pressable>
  );
}
