import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ViewOutput } from "../../shared/contracts/rpc.ts";
import { CONTROL, FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { agoOf } from "../state/words.ts";

type Entry = { readonly key: string; readonly text: string; readonly by?: string };

type SectionProps = {
  readonly label: string;
  readonly entries: readonly Entry[];
  /** A section whose count says nothing, such as what happened lately, shows none. */
  readonly counted: boolean;
  readonly theme: PluginTheme;
};

/** A part of the record folded to its name and a count, opening in place. */
function Section({ label, entries, counted, theme }: SectionProps) {
  const [open, setOpen] = useState(false);
  const { foreground, foregroundMuted } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  let body: ReactNode = null;
  if (open)
    body = (
      <View style={{ gap: 10, paddingLeft: 30, paddingRight: SPACE.sm, paddingTop: SPACE.xs, paddingBottom: 10 }}>
        {entries.length === 0 ? <Text style={small}>Nothing yet.</Text> : null}
        {entries.map((entry) => (
          <View key={entry.key} style={{ gap: 2 }}>
            <Text style={{ fontSize: FONT.small, lineHeight: 18, color: foreground }} selectable>
              {entry.text}
            </Text>
            {entry.by ? <Text style={small}>{entry.by}</Text> : null}
          </View>
        ))}
      </View>
    );
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        onPress={() => {
          setOpen(!open);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.sm,
          minHeight: CONTROL.height,
          paddingHorizontal: SPACE.sm,
          borderRadius: RADIUS.control,
        }}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={foregroundMuted} />
        <Text style={{ flex: 1, fontSize: FONT.base, color: foreground }} numberOfLines={1}>
          {label}
        </Text>
        {counted ? <Text style={small}>{entries.length}</Text> : null}
      </Pressable>
      {body}
    </View>
  );
}

/** A team's record, each part folded: what agents decided, what is disputed, words not carried in, what happened. */
export function Record({ view, theme }: { view: ViewOutput; theme: PluginTheme }) {
  const human = view.human;
  if (!human) return null;
  const sections = [
    {
      label: "Decided by agents",
      counted: true,
      entries: human.decisions.map((d) => ({ key: d.line, text: d.text, by: `${d.by} · scope ${d.scope}` })),
    },
    {
      label: "Still disputed",
      counted: true,
      entries: human.disagreements.map((d) => ({
        key: d.id,
        text: d.text,
        by: [d.raisedBy, `scope ${d.scope}`, d.status, d.reason].filter(Boolean).join(" · "),
      })),
    },
    {
      label: "Your words not yet carried in",
      counted: true,
      entries: human.directions.map((d) => ({ key: d.message, text: d.text, by: `to ${d.to} · owed by ${d.owedBy}` })),
    },
    {
      label: "Lately",
      counted: false,
      entries: [...view.activity].reverse().map((line, at) => ({
        key: `${at}-${line.at}`,
        text: line.text,
        by: agoOf(Date.now() - Date.parse(line.at)),
      })),
    },
  ];
  return (
    <View style={{ gap: 2 }}>
      {sections.map((section) => (
        <Section
          key={section.label}
          label={section.label}
          entries={section.entries}
          counted={section.counted}
          theme={theme}
        />
      ))}
    </View>
  );
}
