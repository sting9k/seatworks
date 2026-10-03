import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Choices } from "../kit/pick.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { titled } from "../state/words.ts";
import type { Columns } from "./agent-picks.tsx";

const NAME = 140;
const GAP = 10;
const DOTS = 14;

type Agent = {
  readonly name: string;
  readonly roles: readonly string[];
  readonly runsOn: string;
};

type LineProps = {
  readonly agent: Agent;
  /** Without room for them, the roles that name it are left out. */
  readonly compact: boolean;
  readonly theme: PluginTheme;
  /** What it runs, or why it runs nothing yet. */
  readonly children: ReactNode;
  /** What stands at the end of the line. */
  readonly tail?: ReactNode;
};

/** One name a template gives, on a line: the name, the roles that name it, what it runs. */
export function AgentLine({ agent, compact, theme, children, tail }: LineProps) {
  const { foreground, foregroundMuted, border } = theme.colors;
  const matched = agent.runsOn === agent.name ? [] : [`on ${agent.runsOn}`];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: GAP,
        minHeight: 44,
        paddingHorizontal: SPACE.lg,
        borderTopWidth: 1,
        borderTopColor: border,
      }}
    >
      <Text
        style={{ width: compact ? undefined : NAME, flexShrink: 1, fontSize: FONT.base, color: foreground }}
        numberOfLines={1}
      >
        {agent.name}
      </Text>
      <Text style={{ flex: 1, minWidth: 0, fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
        {compact ? "" : [agent.roles.map(titled).join(", "), ...matched].join(" · ")}
      </Text>
      {children}
      {tail}
    </View>
  );
}

type HeadProps = {
  /** What the lines under it are, said where their names stand. */
  readonly text: string;
  readonly columns: Columns;
  /** How wide the end of each line is, so the columns stand over their picks. */
  readonly tail: number;
  /** Whether it is the first thing in its card, which has an edge of its own there. */
  readonly first?: boolean;
  readonly theme: PluginTheme;
};

/** The names of the columns over the lines. */
export function AgentHead({ text, columns, tail, first, theme }: HeadProps) {
  const { foregroundMuted, border } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: GAP,
        minHeight: 32,
        paddingHorizontal: SPACE.lg,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: border,
      }}
    >
      <Text style={[small, { flex: 1 }]} numberOfLines={1}>
        {text}
      </Text>
      <Text style={[small, { width: columns.provider }]}>Provider</Text>
      <Text style={[small, { width: columns.model }]}>Model</Text>
      <Text style={[small, { width: columns.effort }]}>Effort</Text>
      <View style={{ width: tail }} />
    </View>
  );
}

type DotsProps = {
  readonly agent: Agent;
  /** The agent profiles the Human keeps in Paseo. */
  readonly available: readonly string[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onMatch: (runsOn: string) => void;
};

/** The end of a template's line: a name is run on another of the Human's agent profiles from here. */
export function RunsOn({ agent, available, theme, busy, onMatch }: DotsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Run ${agent.name} on another agent profile`}
        hitSlop={8}
        disabled={busy}
        onPress={() => {
          setOpen(true);
        }}
      >
        <Icon name="Ellipsis" size={DOTS} color={theme.colors.foregroundMuted} />
      </Pressable>
      {open ? (
        <Choices
          title={`Run ${agent.name} on`}
          choices={[...new Set([agent.name, ...available, agent.runsOn])].map((name) => ({
            value: name,
            label: name,
            ...(name === agent.name ? { note: "its own" } : {}),
          }))}
          value={agent.runsOn}
          theme={theme}
          onClose={() => {
            setOpen(false);
          }}
          onPick={onMatch}
        />
      ) : null}
    </>
  );
}

/** How wide the dots at the end of a template's line are. */
export const DOTS_WIDE = DOTS;
