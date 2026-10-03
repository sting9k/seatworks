import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Text } from "react-native";
import type { HumanView } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Field } from "../kit/field.tsx";
import { FONT } from "../kit/theme.ts";
import { Decision, Words } from "./frame.tsx";
import { useHumanCommand } from "./send.ts";

type Props = {
  readonly project: string;
  readonly claim: HumanView["claims"][number];
  readonly remote: string | null;
  readonly theme: PluginTheme;
  readonly onAnswered: () => void;
};

/** The root's claim that the work is ready: the Human publishes it, or sends it back with a reason. */
export function ClaimCard({ project, claim, remote, theme, onAnswered }: Props) {
  const [why, setWhy] = useState("");
  const { busy, said, send } = useHumanCommand(project);
  const settle = (type: "publish" | "send_back", args: Record<string, unknown>) => {
    void send(type, args).then((ok) => {
      if (ok) onAnswered();
    });
  };
  return (
    <Decision
      kind="Ready for you"
      from={claim.by}
      theme={theme}
      refused={said && !said.ok ? said.text : null}
      actions={
        <>
          {remote !== null ? (
            <Button
              label={`Publish to ${remote}`}
              icon="Check"
              tone="accent"
              theme={theme}
              disabled={busy}
              onPress={() => {
                settle("publish", { remote });
              }}
            />
          ) : null}
          <Button
            label="Send back"
            theme={theme}
            disabled={busy || why.trim() === ""}
            onPress={() => {
              settle("send_back", { scope: claim.scope, reason: why.trim() });
            }}
          />
        </>
      }
    >
      <Words text={claim.text} theme={theme} />
      <Text style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted }} selectable>
        {claim.commit}
      </Text>
      <Field value={why} onChange={setWhy} disabled={busy} placeholder="Why it goes back" theme={theme} />
    </Decision>
  );
}
