import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { RPC, type UpdateCheck } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

/** Whether a newer release of the plugin is out. Seatworks only checks: Paseo applies an update. */
export function UpdatesTab({ theme }: { theme: PluginTheme }) {
  const ask = useRpc(RPC.checkUpdate);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setBusy(true);
    try {
      setUpdate(await ask({}));
    } catch (failed) {
      setUpdate({ status: "unknown", current: null, latest: null, links: [], text: problemText(failed) });
    } finally {
      setBusy(false);
    }
  }, [ask]);
  useEffect(() => {
    void check();
  }, [check]);
  const link = update?.links[0];
  return (
    <>
      <Card theme={theme}>
        <Row title={update?.current ? `Seatworks ${update.current}` : "Seatworks"} theme={theme}>
          {update?.status === "available" ? (
            <Tag label={`${update.latest ?? "a newer one"} is out`} tone="warning" theme={theme} />
          ) : null}
          {update?.status === "current" ? <Tag label="up to date" tone="success" theme={theme} /> : null}
          {link ? (
            <Button label="What changed" tone="quiet" theme={theme} onPress={() => void openExternalUrl(link)} />
          ) : null}
          <Button label={busy ? "Checking" : "Check"} theme={theme} disabled={busy} onPress={() => void check()} />
        </Row>
      </Card>
      {update ? (
        <Text
          style={{
            fontSize: FONT.small,
            paddingHorizontal: SPACE.xs,
            color: update.status === "unknown" ? theme.colors.statusWarning : theme.colors.foregroundMuted,
          }}
          selectable
        >
          {update.text}
        </Text>
      ) : null}
    </>
  );
}
