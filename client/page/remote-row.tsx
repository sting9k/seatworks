import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { RPC } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Row, UNDER_KIND } from "../kit/row.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";

type Visibility = "private" | "public";
type At = {
  readonly remotes: readonly { readonly name: string; readonly at: string }[];
  readonly github: string | null;
  readonly name: string;
};

type Props = {
  readonly project: string;
  /** The branch that would be pushed to a new remote. */
  readonly base: string | null;
  readonly height: number;
  readonly theme: PluginTheme;
  readonly onChanged: () => void;
};

/** Where a project is published; one that is nowhere yet is put on GitHub from here, private or public, in two presses. */
export function RemoteRow({ project, base, height, theme, onChanged }: Props) {
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
  const small = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
  if (!at) return <Row kind="Remote" title="Reading" dimmed height={height} theme={theme} />;
  if (at.remotes.length > 0)
    return (
      <Row kind="Remote" title={at.remotes.map((remote) => remote.name).join(", ")} height={height} theme={theme}>
        <Text style={small} numberOfLines={1}>
          {at.remotes[0]!.at}
        </Text>
      </Row>
    );
  const { github, name } = at;
  return (
    <View>
      <Row
        kind="Remote"
        title="None yet"
        meta={github === null ? "GitHub's gh is not signed in on this machine" : ""}
        dimmed
        height={height}
        theme={theme}
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
            paddingBottom: SPACE.md,
            paddingRight: SPACE.lg,
            paddingLeft: UNDER_KIND,
          }}
        >
          <Text style={[small, { flex: 1 }]}>
            Creates {github}/{name} on GitHub, {asking}, and pushes {base ?? "the project's base"} there.
          </Text>
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
      ) : null}
    </View>
  );
}
