import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Field } from "../kit/field.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { argvOf, lineOf } from "../state/checks.ts";

type Check = HumanView["checks"][number];
/** A check as it is being typed; the key holds its line in place while its name changes. */
type Draft = { readonly key: number; readonly name: string; readonly line: string };

type Props = {
  readonly checks: readonly Check[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSave: (checks: Check[]) => void;
};

/** A project's checks to change: each a name and the command it runs, typed on one line. */
export function ChecksEditor({ checks, theme, busy, onCancel, onSave }: Props) {
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    checks.map((check, key) => ({ key, name: check.name, line: lineOf(check.run) })),
  );
  const [made, setMade] = useState(checks.length);
  const change = (key: number, to: Partial<Draft>) => {
    setDrafts((all) => all.map((draft) => (draft.key === key ? { ...draft, ...to } : draft)));
  };
  const written = drafts.map((draft) => ({ name: draft.name.trim(), run: argvOf(draft.line) }));
  const whole = written.every((check) => check.name !== "" && check.run.length > 0);
  const { foregroundMuted } = theme.colors;
  return (
    <View style={{ gap: SPACE.sm, paddingVertical: SPACE.md, paddingRight: SPACE.lg, paddingLeft: SPACE.lg * 2 }}>
      {drafts.map((draft) => (
        <View key={draft.key} style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
          <View style={{ width: 140, flexDirection: "row" }}>
            <Field
              value={draft.name}
              placeholder="Name"
              theme={theme}
              disabled={busy}
              onChange={(name) => {
                change(draft.key, { name });
              }}
            />
          </View>
          <Field
            value={draft.line}
            placeholder="The command it runs"
            theme={theme}
            disabled={busy}
            onChange={(line) => {
              change(draft.key, { line });
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Take ${draft.name.trim() || "this check"} away`}
            hitSlop={8}
            disabled={busy}
            onPress={() => {
              setDrafts((all) => all.filter((other) => other.key !== draft.key));
            }}
          >
            <Icon name="X" size={14} color={foregroundMuted} />
          </Pressable>
        </View>
      ))}
      <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>
        Each runs with no shell, in a fresh copy of the commit it checks.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
        <Button
          label="Add a check"
          icon="Plus"
          tone="quiet"
          theme={theme}
          disabled={busy}
          onPress={() => {
            setDrafts((all) => [...all, { key: made, name: "", line: "" }]);
            setMade(made + 1);
          }}
        />
        <View style={{ flex: 1 }} />
        <Button label="Cancel" tone="quiet" theme={theme} disabled={busy} onPress={onCancel} />
        <Button
          label="Save"
          tone="accent"
          theme={theme}
          disabled={busy || !whole}
          onPress={() => {
            onSave(written);
          }}
        />
      </View>
    </View>
  );
}
