import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { FONT, RADIUS, SPACE } from "./theme.ts";

type Props = {
  readonly value: string;
  readonly placeholder: string;
  readonly theme: PluginTheme;
  readonly disabled?: boolean;
  /** A field for more than a line grows with what is typed. */
  readonly multiline?: boolean;
  /** A secret is typed unseen. */
  readonly secret?: boolean;
  readonly onChange: (text: string) => void;
};

/** A place to type, filled as the host fills its own inputs. */
export function Field({ value, placeholder, theme, disabled, multiline, secret, onChange }: Props) {
  return (
    <TextInput
      style={{
        flex: multiline ? undefined : 1,
        minHeight: multiline ? 56 : 32,
        paddingHorizontal: 10,
        paddingVertical: SPACE.sm,
        borderRadius: RADIUS.control,
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        fontSize: FONT.base,
      }}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.foregroundMuted}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      secureTextEntry={secret}
    />
  );
}
