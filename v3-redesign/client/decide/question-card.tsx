import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Dot } from "../kit/mark.tsx";
import { FONT, RADIUS, SPACE, useStyles } from "../kit/theme.ts";
import { useHumanCommand } from "./send.ts";

type Question = HumanView["questions"][number];

/** A question put to the Human, drawn as Paseo draws an agent's own question: options, the one recommended, a note. */
export function QuestionCard({
  project,
  question,
  theme,
  onAnswered,
}: {
  project: string;
  question: Question;
  theme: PluginTheme;
  onAnswered: () => void;
}) {
  const [choice, setChoice] = useState(question.recommend ?? question.options[0] ?? "");
  const [note, setNote] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  const styles = useStyles(theme, (colors) => ({
    body: { padding: SPACE.md, gap: SPACE.md },
    meta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    small: { fontSize: FONT.small, color: colors.foregroundMuted },
    question: { fontSize: FONT.base, lineHeight: 22, color: colors.foreground },
    option: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: SPACE.sm,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.control,
    },
    chosen: { backgroundColor: colors.surface2 },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.control,
      padding: SPACE.sm,
      color: colors.foreground,
      fontSize: FONT.base,
    },
    actions: { flexDirection: "row" as const, gap: SPACE.sm },
  }));
  const answer = () => {
    const text = [choice, note.trim()].filter(Boolean).join(": ");
    void send("answer_question", { question: question.id, text }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Card theme={theme}>
      <View style={styles.body}>
        <View style={styles.meta}>
          <Dot tone="you" theme={theme} size={6} />
          <Text style={styles.small}>{question.from} asks</Text>
        </View>
        <Text style={styles.question}>{question.text}</Text>
        {question.options.length > 0 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={question.text}>
            {question.options.map((option) => {
              const on = option === choice;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    setChoice(option);
                  }}
                  style={[styles.option, on ? styles.chosen : null]}
                >
                  <View
                    style={[styles.radio, { borderColor: on ? theme.colors.accent : theme.colors.foregroundMuted }]}
                  >
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text
                    style={{ fontSize: FONT.base, color: on ? theme.colors.foreground : theme.colors.foregroundMuted }}
                  >
                    {option === question.recommend ? `${option} (Recommended)` : option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          editable={!busy}
          placeholder={question.options.length > 0 ? "A note with your answer (optional)" : "Your answer"}
          placeholderTextColor={theme.colors.foregroundMuted}
          multiline
        />
        <View style={styles.actions}>
          <Button
            label="Answer"
            icon="Check"
            tone="accent"
            theme={theme}
            disabled={busy || (choice === "" && note.trim() === "")}
            onPress={answer}
          />
        </View>
        {said && !said.ok ? (
          <Text style={[styles.small, { color: theme.colors.statusWarning }]}>{said.text}</Text>
        ) : null}
      </View>
    </Card>
  );
}
