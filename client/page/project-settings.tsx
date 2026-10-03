import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type HumanView, type Leftover, RPC, type ViewOutput } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Row, UNDER_KIND } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { leftBy } from "../state/leftovers.ts";
import { problemText } from "../state/problem-text.ts";
import { bytesOf } from "../state/words.ts";
import { ChecksEditor } from "./checks-editor.tsx";
import { RemoteRow } from "./remote-row.tsx";

const ROW = 48;

/** A project's checks on its line: their names while they are few, their number once a line cannot hold them. */
const checksSaid = (names: readonly string[]): string =>
  names.length === 0 ? "None set" : names.length > 3 ? `${names.length} checks` : names.join(" · ");

type Props = {
  readonly project: string;
  readonly view: ViewOutput;
  readonly human: HumanView;
  /** The template it runs, by its title where it is still installed. */
  readonly template: string | null;
  readonly theme: PluginTheme;
  readonly onReload: () => void;
  /** Leads to where what a team left behind is removed. */
  readonly onCleanUp: () => void;
  /** Hears that the project is gone. */
  readonly onRemoved: () => void;
};

/** What a project is set up with, a line each: its template, its base, where it is published, its checks, what it left behind. */
export function ProjectSettings({ project, view, human, template, theme, onReload, onCleanUp, onRemoved }: Props) {
  const sync = useRpc(RPC.syncTemplate);
  const command = useRpc(RPC.human);
  const list = useRpc(RPC.leftovers);
  const clean = useRpc(RPC.clean);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<readonly Leftover[] | null>(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    let current = true;
    void list({}).then(
      ({ leftovers }) => {
        if (current) setFound(leftovers);
      },
      // The line stays unread; the Clean up tab reads the same and says why where it cannot.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [list, project]);
  const { foregroundMuted } = theme.colors;
  const small = { fontSize: FONT.small, color: foregroundMuted };
  const drift = view.template;
  const left = found ? leftBy(found, project) : null;
  const whole = found?.find((one) => one.kind === "project" && one.project === project) ?? null;

  /** Runs one press to its end, saying what came of it. */
  const act = (work: () => Promise<{ ok: boolean; text: string }>, then: () => void) => {
    setBusy(true);
    void work()
      .then((said) => {
        if (said.text) toast.show(said.text, { variant: said.ok ? "success" : "warning" });
        if (said.ok) then();
      })
      .catch((failed: unknown) => {
        toast.error(problemText(failed));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <>
      <Card theme={theme}>
        <Row kind="Template" title={template ?? drift?.name ?? "None"} height={ROW} theme={theme}>
          {drift?.state === "uninstalled" ? <Tag label="not installed" tone="warning" theme={theme} /> : null}
          {drift && (drift.state === "behind" || drift.edited) ? (
            <>
              <Tag label={drift.edited ? "changed by hand" : "changed"} tone="warning" theme={theme} />
              {drift.state === "uninstalled" ? null : (
                <Button
                  label="Sync"
                  theme={theme}
                  disabled={busy}
                  onPress={() => {
                    act(() => sync({ project }), onReload);
                  }}
                />
              )}
            </>
          ) : null}
        </Row>
        <Row kind="Base" title={view.base ?? "None yet"} dimmed={view.base === null} height={ROW} theme={theme} />
        <RemoteRow project={project} base={view.base} height={ROW} theme={theme} onChanged={onReload} />
        <View>
          <Row
            kind="Checks"
            title={checksSaid(human.checks.map((check) => check.name))}
            dimmed={human.checks.length === 0}
            height={ROW}
            theme={theme}
          >
            {checking ? null : (
              <Button
                label="Edit"
                tone="quiet"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  setChecking(true);
                }}
              />
            )}
          </Row>
          {checking ? (
            <Modal
              title="Checks"
              open
              onOpenChange={(next) => {
                if (!next) setChecking(false);
              }}
            >
              <Modal.Content contentContainerStyle={{ padding: SPACE.lg }}>
                <ChecksEditor
                  checks={human.checks}
                  theme={theme}
                  busy={busy}
                  onCancel={() => {
                    setChecking(false);
                  }}
                  onSave={(checks) => {
                    act(
                      async () => {
                        const said = await command({ project, type: "set_checks", args: { checks } });
                        return said.ok ? { ok: true, text: "The checks are set." } : said;
                      },
                      () => {
                        setChecking(false);
                        onReload();
                      },
                    );
                  }}
                />
              </Modal.Content>
            </Modal>
          ) : null}
        </View>
        <Row
          kind="Left behind"
          title={left === null ? "Reading" : (left.says ?? "Nothing")}
          dimmed={!left?.says}
          height={ROW}
          theme={theme}
        >
          {left?.says ? (
            <>
              {left.bytes > 0 ? <Text style={small}>{bytesOf(left.bytes)}</Text> : null}
              <Button label="Clean up" tone="quiet" theme={theme} onPress={onCleanUp} />
            </>
          ) : null}
        </Row>
      </Card>
      <Card theme={theme}>
        <View>
          <Row kind="Remove" title="Its agents, copies and branches" dimmed height={ROW} theme={theme}>
            {removing ? null : (
              <Button
                label="Remove"
                tone="quiet"
                theme={theme}
                disabled={busy || whole === null}
                onPress={() => {
                  setRemoving(true);
                }}
              />
            )}
          </Row>
          {removing && whole ? (
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
              <Text style={[small, { flex: 1 }]}>{whole.why}</Text>
              <Button
                label="Cancel"
                tone="quiet"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  setRemoving(false);
                }}
              />
              <Button
                label="Remove for good"
                tone="danger"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  act(
                    async () =>
                      (await clean({ ids: [whole.id] })).results[0] ?? { ok: false, text: "Nothing was removed." },
                    onRemoved,
                  );
                }}
              />
            </View>
          ) : null}
        </View>
      </Card>
    </>
  );
}
