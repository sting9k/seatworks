import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Field } from "../kit/field.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { Decision, Words } from "./frame.tsx";
import { useHumanCommand } from "./send.ts";

type Props = {
  readonly project: string;
  readonly question: HumanView["questions"][number];
  readonly theme: PluginTheme;
  readonly onAnswered: () => void;
};

/** A question put to the Human, drawn as Paseo draws an agent's own question: options, the one recommended, a note. */
export function QuestionCard({ project, question, theme, onAnswered }: Props) {
  const { options, recommend } = question;
  const offered = recommend !== null && options.includes(recommend);
  // Only a recommended option starts picked, in sight: anything else would answer for the Human in one press.
  const [choice, setChoice] = useState(offered ? recommend : "");
  const [note, setNote] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  const { accent, surface2, foreground, foregroundMuted } = theme.colors;
  const answer = () => {
    const text = [choice, note.trim()].filter(Boolean).join(": ");
    void send("answer_question", { question: question.id, text }).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Decision
      kind="Question"
      from={question.from}
      theme={theme}
      refused={said && !said.ok ? said.text : null}
      actions={
        <Button
          label="Answer"
          icon="Check"
          tone="accent"
          theme={theme}
          disabled={busy || (choice === "" && note.trim() === "")}
          onPress={answer}
        />
      }
    >
      <Words text={question.text} theme={theme} />
      {recommend !== null && !offered ? (
        <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>Recommended: {recommend}</Text>
      ) : null}
      {options.length > 0 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={question.text} style={{ gap: 2 }}>
          {options.map((option) => {
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
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.sm,
                  minHeight: 32,
                  paddingHorizontal: SPACE.sm,
                  borderRadius: RADIUS.control,
                  backgroundColor: on ? surface2 : "transparent",
                }}
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
                <Text style={{ flex: 1, fontSize: FONT.base, color: on ? foreground : foregroundMuted }}>{option}</Text>
                {option === recommend ? (
                  <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>Recommended</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Field
        value={note}
        onChange={setNote}
        disabled={busy}
        placeholder={options.length > 0 ? "A note with your answer (optional)" : "Your answer"}
        theme={theme}
        multiline
      />
    </Decision>
  );
}
