import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Mark } from "../kit/mark.tsx";
import { FONT, RADIUS, SPACE, pressState } from "../kit/theme.ts";
import { AttentionCard } from "./attention-card.tsx";
import { ClaimCard } from "./claim-card.tsx";
import { PermissionCard } from "./permission-card.tsx";
import { QuestionCard } from "./question-card.tsx";

type Props = {
  readonly project: string;
  readonly human: HumanView;
  readonly theme: PluginTheme;
  readonly onAnswered: () => void;
};

export type Waits = { readonly id: string; readonly kind: string; readonly says: string; readonly card: ReactNode };

/** Each thing that waits on the Human: what kind it is, a line of it, and the card it is answered in. */
export function waitsOf({ project, human, theme, onAnswered }: Props): Waits[] {
  const shared = { project, theme, onAnswered };
  return [
    ...human.questions.map((q) => ({
      id: `question:${q.id}`,
      kind: "Question",
      says: `${q.from} · ${q.text}`,
      card: <QuestionCard key={q.id} question={q} {...shared} />,
    })),
    ...human.permissions.map((p) => ({
      id: `permission:${p.id}`,
      kind: "Asks permission",
      says: `${p.actor} · ${p.text}`,
      card: <PermissionCard key={p.id} permission={p} {...shared} />,
    })),
    ...human.attentions.map((t) => ({
      id: `attention:${t.id}`,
      kind: "Heads-up",
      says: `about ${t.actor} · ${t.why}`,
      card: <AttentionCard key={t.id} attention={t} {...shared} />,
    })),
    ...human.claims.map((c) => ({
      id: `claim:${c.scope}:${c.commit}`,
      kind: "Ready for you",
      says: `${c.by} · ${c.text}`,
      card: <ClaimCard key={c.commit} claim={c} remote={human.remote} {...shared} />,
    })),
  ];
}

/** What waits on the Human: one thing open to answer, the rest a line each, any of them opened by a press. */
export function Waiting(props: Props) {
  const { theme } = props;
  const [picked, setPicked] = useState<string | null>(null);
  const all = waitsOf(props);
  const open = all.find((waits) => waits.id === picked) ?? all[0];
  const { border, foreground, foregroundMuted } = theme.colors;
  return (
    <View style={{ gap: SPACE.sm }}>
      {all.map((waits) =>
        waits === open ? (
          waits.card
        ) : (
          <Pressable
            key={waits.id}
            accessibilityRole="button"
            accessibilityLabel={`${waits.kind}: ${waits.says}`}
            onPress={() => {
              setPicked(waits.id);
            }}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: SPACE.sm,
                minHeight: 36,
                paddingHorizontal: SPACE.md,
                borderRadius: RADIUS.card,
                borderWidth: 1,
                borderColor: border,
              },
              pressState(false, pressed),
            ]}
          >
            <Mark tone="you" theme={theme} />
            <Text style={{ fontSize: FONT.small, fontWeight: "500", color: foreground }}>{waits.kind}</Text>
            <Text style={{ flex: 1, fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
              {waits.says}
            </Text>
            <Icon name="ChevronRight" size={14} color={foregroundMuted} />
          </Pressable>
        ),
      )}
    </View>
  );
}
