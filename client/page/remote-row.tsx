import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Row } from "../kit/row.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

type Visibility = "private" | "public";
type At = { readonly remotes: readonly string[]; readonly github: string | null; readonly name: string };

type Props = { readonly project: string; readonly theme: PluginTheme; readonly onChanged: () => void };

/** Where a project is published; one that is nowhere yet is put on GitHub from here, private or public, in two presses. */
export function RemoteRow({ project, theme, onChanged }: Props) {
  const read = useRpc(RPC.remoteOf);
  const create = useRpc(RPC.createRemote);
  const toast = useToast();
  const [at, setAt] = useState<At | null>(null);
  const [asking, setAsking] = useState<Visibility | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const answer = await read({ project });
      if (answer.ok) setAt(answer);
    } catch {
      // The row stays as it was read last; the next opening of the project reads it again.
    }
  }, [read, project]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!at) return null;
  if (at.remotes.length > 0) return <Row kind="Remote" title={at.remotes.join(", ")} theme={theme} indent />;
  const { github, name } = at;
  return (
    <View>
      <Row
        kind="Remote"
        title="None yet"
        meta={github === null ? "GitHub's gh is not signed in on this machine" : ""}
        dimmed
        theme={theme}
        indent
      >
        {github !== null && asking === null
          ? (["private", "public"] as const).map((visibility) => (
              <Button
                key={visibility}
                label={visibility === "private" ? "Private on GitHub" : "Public on GitHub"}
                theme={theme}
                disabled={busy}
                onPress={() => {
                  setAsking(visibility);
                }}
              />
            ))
          : null}
      </Row>
      {github !== null && asking !== null ? (
        <View style={{ gap: SPACE.sm, paddingBottom: SPACE.md, paddingRight: SPACE.lg, paddingLeft: SPACE.lg * 2 }}>
          <Text style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted }}>
            Creates {github}/{name} on GitHub, {asking}, and pushes the project&apos;s base there.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACE.sm }}>
            <Button
              label="Cancel"
              tone="quiet"
              theme={theme}
              disabled={busy}
              onPress={() => {
                setAsking(null);
              }}
            />
            <Button
              label={`Create it, ${asking}`}
              tone={asking === "public" ? "danger" : "accent"}
              theme={theme}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void create({ project, visibility: asking })
                  .then((said) => {
                    toast.show(said.text, { variant: said.ok ? "success" : "warning" });
                    if (said.ok) onChanged();
                  })
                  .catch((failed: unknown) => {
                    toast.error(problemText(failed));
                  })
                  .finally(() => {
                    setBusy(false);
                    setAsking(null);
                    void load();
                  });
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
