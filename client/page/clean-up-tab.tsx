import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type Leftover, RPC } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Check } from "../kit/check.tsx";
import { Label } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, RADIUS, SPACE } from "../kit/theme.ts";
import { sortLeftovers, tagOf } from "../state/leftovers.ts";
import { problemText } from "../state/problem-text.ts";
import { agoOf, bytesOf, dayOf, nameOf } from "../state/words.ts";

const KIND: Readonly<Record<Leftover["kind"], string>> = {
  copy: "Working copy",
  branch: "Branch",
  agent: "Agent",
  project: "Project folder",
  record: "Record",
};

/** What a set of leftovers takes on disk together; what is no folder takes none. */
const taken = (items: readonly Leftover[]) => items.reduce((sum, left) => sum + (left.bytes ?? 0), 0);

/** How often the tab looks at the clock, to say how long ago it scanned. */
const TICK_MS = 30_000;

type Props = {
  readonly projects: readonly { readonly id: string; readonly repo: string }[];
  readonly theme: PluginTheme;
  /** Hears how many things a scan found, for the tab to say. */
  readonly onCounted: (found: number) => void;
  readonly onChanged: () => void;
};

/** What teams left behind, sorted by what removing it costs; only what is picked is removed, after a second press. */
export function CleanUpTab({ projects, theme, onCounted, onChanged }: Props) {
  const list = useRpc(RPC.leftovers);
  const clean = useRpc(RPC.clean);
  const [found, setFound] = useState<readonly Leftover[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<"scan" | "remove" | null>("scan");
  const [confirming, setConfirming] = useState(false);
  const [kept, setKept] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const attached = new Set(projects.map((project) => project.id));
  const names = new Map(projects.map((project) => [project.id, nameOf(project.repo)]));
  const sorted = sortLeftovers(found ?? [], attached);
  const shown = [...sorted.safe, ...sorted.check, ...sorted.kept, ...sorted.records];
  const total = shown.length;
  const pickedBytes = taken(shown.filter((left) => picked.has(left.id)));
  const thisYear = new Date().getFullYear();
  const { surface1, border, foreground, foregroundMuted, statusDanger, statusSuccess } = theme.colors;
  const muted = { fontSize: FONT.small, color: foregroundMuted };

  const scan = useCallback(async () => {
    setBusy("scan");
    try {
      setFound((await list({})).leftovers);
      setProblem(null);
      setScannedAt(Date.now());
      setNow(Date.now());
    } catch (failed) {
      setProblem(problemText(failed));
    } finally {
      setBusy(null);
    }
  }, [list]);
  useEffect(() => {
    void scan();
  }, [scan]);
  // What costs nothing to remove comes picked after each scan; the rest is the Human's to pick.
  useEffect(() => {
    setPicked(new Set(sortLeftovers(found ?? [], attached).safe.map((left) => left.id)));
    setConfirming(false);
  }, [found]);
  useEffect(() => {
    onCounted(total);
  }, [onCounted, total]);
  useEffect(() => {
    const ticking = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(ticking);
    };
  }, []);

  const remove = async () => {
    setBusy("remove");
    try {
      const { results } = await clean({ ids: [...picked] });
      setKept(results.filter((result) => !result.ok).map((result) => result.text));
    } catch (failed) {
      setKept([`Seatworks did not answer: ${problemText(failed)}. The scan shows what is left.`]);
    }
    // Scanned again either way: a call that failed on its way back may still have removed some.
    await scan();
    onChanged();
  };
  const group = (title: string, items: readonly Leftover[]) =>
    items.length > 0 ? (
      <View key={title} style={{ gap: SPACE.sm }}>
        <Label text={title} theme={theme}>
          <Text style={muted}>{items.length}</Text>
        </Label>
        <Card theme={theme}>
          {items.map((left) => {
            const tag = tagOf(left);
            return (
              <View
                key={left.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.md,
                  minHeight: 40,
                  paddingHorizontal: SPACE.lg,
                  paddingVertical: 6,
                }}
              >
                <Check
                  label={`${KIND[left.kind]} ${left.label}`}
                  checked={picked.has(left.id)}
                  locked={!left.removable || busy !== null}
                  theme={theme}
                  onChange={(on) => {
                    const next = new Set(picked);
                    if (on) next.add(left.id);
                    else next.delete(left.id);
                    setPicked(next);
                    setConfirming(false);
                  }}
                />
                <Text style={[muted, { width: 92 }]} numberOfLines={1}>
                  {KIND[left.kind]}
                </Text>
                <Text
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: FONT.base,
                    color: left.removable ? foreground : foregroundMuted,
                  }}
                  numberOfLines={1}
                >
                  {left.kind === "branch" || left.kind === "agent" ? left.label : nameOf(left.label)}
                </Text>
                {tag ? <Tag label={tag.label} tone={tag.tone} theme={theme} /> : null}
                <Text style={muted} numberOfLines={1}>
                  {left.at ? dayOf(left.at, thisYear) : (names.get(left.project) ?? "")}
                </Text>
                <Text style={[muted, { width: 64, textAlign: "right" }]} numberOfLines={1}>
                  {left.bytes === null ? "" : bytesOf(left.bytes)}
                </Text>
              </View>
            );
          })}
        </Card>
      </View>
    ) : null;
  const strip = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: surface1,
  };

  return (
    <>
      <View style={strip}>
        {found && total === 0 ? <Icon name="CircleCheck" size={16} color={statusSuccess} /> : null}
        <Text style={{ fontSize: FONT.base, fontWeight: "500", color: foreground }}>
          {!found
            ? problem
              ? "Not scanned"
              : "Scanning"
            : total === 0
              ? "Nothing left behind"
              : `${total} left behind`}
        </Text>
        <Text style={[muted, { flex: 1 }]}>{taken(shown) > 0 ? bytesOf(taken(shown)) : ""}</Text>
        {scannedAt !== null && busy !== "scan" ? (
          <Text style={muted}>Scanned {agoOf(Math.max(0, now - scannedAt))}</Text>
        ) : null}
        <Button
          label={busy === "scan" ? "Scanning" : "Scan again"}
          tone="quiet"
          theme={theme}
          disabled={busy !== null}
          onPress={() => void scan()}
        />
      </View>
      {problem ? <Text style={[muted, { color: statusDanger }]}>Seatworks did not answer: {problem}</Text> : null}
      {kept.map((line) => (
        <Text key={line} style={muted}>
          Kept: {line}
        </Text>
      ))}
      {group("Safe to remove", sorted.safe)}
      {group("Check first", sorted.check)}
      {group("Kept", sorted.kept)}
      {group("Records of removed projects", sorted.records)}
      {picked.size > 0 ? (
        <View style={strip}>
          <Text style={{ fontSize: FONT.base, fontWeight: "500", color: foreground }}>{picked.size} picked</Text>
          <Text style={[muted, { flex: 1 }, confirming ? { color: statusDanger } : null]}>
            {confirming ? "cannot be undone" : pickedBytes > 0 ? bytesOf(pickedBytes) : ""}
          </Text>
          {confirming ? (
            <Button
              label="Cancel"
              tone="quiet"
              theme={theme}
              disabled={busy !== null}
              onPress={() => {
                setConfirming(false);
              }}
            />
          ) : null}
          <Button
            label={busy === "remove" ? "Removing" : confirming ? "Remove for good" : `Remove ${picked.size}`}
            tone={confirming ? "danger" : "accent"}
            theme={theme}
            disabled={busy !== null}
            onPress={() => {
              if (confirming) void remove();
              else setConfirming(true);
            }}
          />
        </View>
      ) : null}
    </>
  );
}
