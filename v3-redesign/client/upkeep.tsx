import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Leftover, RPC, type UpdateCheck } from "../shared/contracts/rpc.ts";
import type { Styles } from "./surface.tsx";

/** Paseo's projects with no team yet, each attached with one press: the plugin serves only projects attached to it. */
export function Attach({
  s,
  unattached,
  attached,
}: {
  s: Styles;
  unattached: readonly { name: string; root: string }[];
  attached: (text: string) => Promise<void>;
}) {
  const open = useRpc(RPC.openProject);
  if (unattached.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.h2}>Attach a project</Text>
      <Text style={s.muted}>Attaching starts its Supervisor.</Text>
      {unattached.map((p) => (
        <View key={p.root} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pressable style={s.button} onPress={() => void open({ cwd: p.root }).then((r) => attached(r.text))}>
            <Text style={s.buttonText}>Attach</Text>
          </Pressable>
          <Text style={s.text}>
            {p.name} · {p.root}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** What teams left behind, listed on demand; only what the Human picks and confirms is removed. */
export function Leftovers({ s, cleaned }: { s: Styles; cleaned: () => Promise<void> }) {
  const list = useRpc(RPC.leftovers);
  const clean = useRpc(RPC.clean);
  const [found, setFound] = useState<Leftover[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const look = async () => {
    setFound((await list({})).leftovers);
    setPicked(new Set());
    setConfirming(false);
  };
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
    setConfirming(false);
  };
  const remove = async () => {
    const r = await clean({ ids: [...picked] });
    setResults(r.results.map((x) => `${x.ok ? "Removed" : "Kept"}: ${x.text}`));
    await look();
    await cleaned();
  };

  return (
    <View style={s.card}>
      <Text style={s.h2}>Clean up</Text>
      <Pressable style={s.button} onPress={() => void look()}>
        <Text style={s.buttonText}>{found ? "Look again" : "Find what teams left behind"}</Text>
      </Pressable>
      {found?.length === 0 ? <Text style={s.muted}>Nothing is left behind.</Text> : null}
      {(found ?? []).map((l) => (
        <Pressable
          key={l.id}
          disabled={!l.removable}
          onPress={() => {
            toggle(l.id);
          }}
          style={{ gap: 2 }}
        >
          <Text style={l.removable ? s.text : s.muted}>
            {l.removable ? (picked.has(l.id) ? "[x] " : "[ ] ") : "— "}
            {l.kind} · {l.label}
          </Text>
          <Text style={l.kind === "project" ? s.danger : s.muted}>{l.why}</Text>
        </Pressable>
      ))}
      {picked.size > 0 && !confirming ? (
        <Pressable
          style={s.button}
          onPress={() => {
            setConfirming(true);
          }}
        >
          <Text style={s.buttonText}>Remove {picked.size} picked</Text>
        </Pressable>
      ) : null}
      {confirming ? (
        <View style={{ gap: 6 }}>
          <Text style={s.danger}>This cannot be undone. Remove them?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={s.button} onPress={() => void remove()}>
              <Text style={s.buttonText}>Remove</Text>
            </Pressable>
            <Pressable
              style={s.button}
              onPress={() => {
                setConfirming(false);
              }}
            >
              <Text style={s.buttonText}>Keep them</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {results.map((line, i) => (
        <Text key={`${i}-${line}`} style={s.muted}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Whether a newer release of the plugin is out, checked when the Human asks; updating stays Paseo's. */
export function Updates({ s }: { s: Styles }) {
  const check = useRpc(RPC.checkUpdate);
  const [answer, setAnswer] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const run = async () => {
    setChecking(true);
    try {
      setAnswer(await check({}));
    } finally {
      setChecking(false);
    }
  };
  return (
    <View style={s.card}>
      <Text style={s.h2}>Plugin</Text>
      <Pressable style={s.button} disabled={checking} onPress={() => void run()}>
        <Text style={s.buttonText}>{checking ? "Checking…" : "Check for updates"}</Text>
      </Pressable>
      {answer ? <Text style={answer.status === "available" ? s.text : s.muted}>{answer.text}</Text> : null}
      {(answer?.links ?? []).map((link) => (
        <Pressable key={link} onPress={() => void openExternalUrl(link)}>
          <Text style={s.muted}>Review: {link}</Text>
        </Pressable>
      ))}
    </View>
  );
}
