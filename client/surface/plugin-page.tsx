import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { type Leftover, RPC, type UpdateCheck } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { PageHeader } from "../kit/header.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { AgentMatching } from "./agent-matching.tsx";
import { TemplateInstall } from "./template-install.tsx";

const KIND: Record<Leftover["kind"], string> = {
  copy: "Working copy",
  branch: "Branch",
  agent: "Agent",
  project: "Whole project",
  record: "Record kept",
};

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The plugin on this machine: whether a newer release is out, and what teams left behind, removed only as picked. */
export function PluginPage({
  theme,
  onBack,
  onCleaned,
}: {
  theme: PluginTheme;
  onBack: () => void;
  onCleaned: () => void;
}) {
  const check = useRpc(RPC.checkUpdate);
  const list = useRpc(RPC.leftovers);
  const clean = useRpc(RPC.clean);
  const [busy, setBusy] = useState<"check" | "scan" | "remove" | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [found, setFound] = useState<Leftover[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [installs, setInstalls] = useState(0);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };

  const scan = async () => {
    setBusy("scan");
    try {
      setFound((await list({})).leftovers);
      setChosen(new Set());
      setConfirming(false);
      setProblem(null);
    } catch (failed) {
      setProblem(problemText(failed));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("remove");
    try {
      const r = await clean({ ids: [...chosen] });
      setResults(r.results.map((x) => `${x.ok ? "Removed" : "Kept"}: ${x.text}`));
    } catch (failed) {
      setResults([`Seatworks did not answer: ${problemText(failed)}. The scan shows what is left.`]);
    } finally {
      setBusy(null);
    }
    // Scanned again either way: a call that failed on its way back may still have removed some.
    await scan();
    onCleaned();
  };
  const items = found ?? [];
  const picks = items.filter((l) => chosen.has(l.id));
  const wholeProjects = picks.filter((l) => l.kind === "project").length;

  return (
    <>
      <PageHeader title="Plugin" subtitle="Seatworks on this machine" theme={theme} onBack={onBack} />
      <SettingsSection title="Version">
        <SettingsCard>
          <SettingsAction
            label={
              update?.status === "available"
                ? `${update.current ?? "?"} → ${update.latest ?? "?"}`
                : update?.current
                  ? `Seatworks ${update.current}`
                  : "Seatworks"
            }
            hint={update?.text ?? "Check asks Paseo whether a newer release is out. Updating stays Paseo's."}
            error={update?.status === "unknown" ? update.text : null}
            actionLabel={busy === "check" ? "Checking" : "Check"}
            disabled={busy !== null}
            onPress={() => {
              setBusy("check");
              void check({})
                .then(setUpdate)
                .catch((failed: unknown) => {
                  setUpdate({ status: "unknown", current: null, latest: null, links: [], text: problemText(failed) });
                })
                .finally(() => {
                  setBusy(null);
                });
            }}
          />
          {(update?.links ?? []).map((link) => (
            <SettingsAction
              key={link}
              label="What changed"
              hint={link}
              actionLabel="Review"
              onPress={() => void openExternalUrl(link)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      <TemplateInstall
        theme={theme}
        onInstalled={() => {
          setInstalls((count) => count + 1);
        }}
      />
      <AgentMatching theme={theme} stamp={installs} />
      <SettingsSection
        title="Clean up"
        trailing={
          <Button
            label={busy === "scan" ? "Scanning" : found ? "Scan again" : "Scan"}
            theme={theme}
            disabled={busy !== null}
            onPress={() => void scan()}
          />
        }
      >
        <SettingsCard>
          {problem ? <SettingsRow label="Seatworks did not answer" error={problem} /> : null}
          <SettingsRow
            label={
              !found
                ? "What teams left behind"
                : items.length
                  ? `Found ${plural(items.length, "thing")}`
                  : "Nothing left behind"
            }
            hint={
              !found
                ? "Copies and branches no open scope uses, agents whose seat ended, each project whole, and the records of removed ones."
                : "Switched on means it will be removed."
            }
          />
          {items.map((l) => (
            <SettingsSwitch
              key={l.id}
              label={`${KIND[l.kind]} · ${l.label}`}
              hint={l.removable ? l.why : `Kept: ${l.why}`}
              value={chosen.has(l.id)}
              disabled={busy !== null || !l.removable}
              onValueChange={(on) => {
                const next = new Set(chosen);
                if (on) next.add(l.id);
                else next.delete(l.id);
                setChosen(next);
                setConfirming(false);
              }}
            />
          ))}
          {items.length > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg }}>
              <Text style={[muted, { flex: 1 }]}>
                {confirming
                  ? `Removed for good${wholeProjects > 0 ? `, ${plural(wholeProjects, "project")} with its agents; its record is kept until you delete it` : ""}. Press again to remove.`
                  : "A copy holding uncommitted work is never removed."}
              </Text>
              <Button
                label={
                  busy === "remove"
                    ? "Removing"
                    : confirming
                      ? `Remove ${picks.length} for good`
                      : `Remove ${picks.length}`
                }
                tone="accent"
                theme={theme}
                disabled={busy !== null || picks.length === 0}
                onPress={() => {
                  if (confirming) void remove();
                  else setConfirming(true);
                }}
              />
            </View>
          ) : null}
          {results.map((line, i) => (
            <SettingsRow key={`${i}-${line}`} label={line} />
          ))}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
