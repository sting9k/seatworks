import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { type HumanView, RPC } from "../shared/contracts/rpc.ts";

/** How often the open view is read again: the record changes as agents work, and a read is cheap. */
const REFRESH_MS = 5000;

type Project = { id: string; repo: string; open: boolean };

/** The Human's view of their teams: the record's facts and the agents' own words, no summary of its own. */
export function Surface({ theme }: PluginSurfaceProps) {
  const listProjects = useRpc(RPC.projects);
  const readView = useRpc(RPC.view);
  const send = useRpc(RPC.human);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<{ human: HumanView | null; activity: string[]; root: string } | null>(null);
  const [said, setSaid] = useState("");

  const c = theme.colors;
  const s = useMemo(
    () => ({
      root: { padding: 16, gap: 14, backgroundColor: c.surface0 },
      h1: { color: c.foreground, fontSize: 18, fontWeight: "600" as const },
      h2: { color: c.foreground, fontSize: 15, fontWeight: "600" as const, marginTop: 8 },
      text: { color: c.foreground },
      muted: { color: c.foregroundMuted },
      card: {
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        padding: 10,
        gap: 6,
        backgroundColor: c.surface1,
      },
      input: { borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 8, color: c.foreground },
      button: {
        backgroundColor: c.accent,
        borderRadius: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignSelf: "flex-start" as const,
      },
      buttonText: { color: c.accentForeground },
      danger: { color: c.statusDanger },
    }),
    [c],
  );

  const refresh = useCallback(async () => {
    const listed = await listProjects({});
    setProjects(listed.projects);
    const id = selected ?? listed.projects[0]?.id ?? null;
    if (id !== selected) setSelected(id);
    if (id) setView(await readView({ project: id }));
  }, [listProjects, readView, selected]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

  const act = useCallback(
    async (type: string, args: Record<string, unknown>) => {
      if (!selected) return;
      const r = await send({ project: selected, type, args });
      setSaid(r.text);
      await refresh();
    },
    [refresh, selected, send],
  );

  const h = view?.human ?? null;
  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.h1}>Seatworks</Text>
      {projects.length === 0 ? (
        <Text style={s.muted}>
          No team yet. In a workspace, run “Open a Seatworks team here” from the command center.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                setSelected(p.id);
              }}
              style={[s.card, p.id === selected ? { borderColor: c.accent } : null]}
            >
              <Text style={s.text}>{p.repo.split(/[\\/]/).pop()}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {said ? <Text style={s.muted}>{said}</Text> : null}
      {h ? (
        <>
          <Spend s={s} h={h} />
          <Questions s={s} h={h} act={act} />
          <Permissions s={s} h={h} act={act} />
          <Section s={s} title="Disagreements still open" empty="None.">
            {h.disagreements.map((d) => (
              <Text key={d.id} style={s.text}>
                {d.id} · scope {d.scope} · {d.raisedBy} · {d.status}: {d.text}
                {d.reason ? ` — ${d.reason}` : ""}
              </Text>
            ))}
          </Section>
          <Section s={s} title="Decided by agents, not by you" empty="Nothing yet.">
            {h.decisions.map((d) => (
              <Text key={d.line} style={s.text}>
                scope {d.scope} · {d.by}: {d.text}
              </Text>
            ))}
          </Section>
          <Section s={s} title="Your words not yet carried in" empty="All carried in or answered.">
            {h.directions.map((d) => (
              <Text key={d.message} style={s.text}>
                {d.message} to {d.to}, owed by {d.owedBy}
              </Text>
            ))}
          </Section>
          <Section s={s} title="Lanes" empty="No lane is open.">
            {h.lanes.map((l) => (
              <Text key={l.scope} style={s.text}>
                {l.scope} · {l.owner ?? "nobody"} ({l.role}) · {l.status}
                {l.held ? " · held" : ""}: {l.goal ?? ""}
              </Text>
            ))}
          </Section>
          {h.supervisor ? <Message s={s} to={h.supervisor} act={act} /> : null}
          <Section s={s} title="What happened" empty="Nothing yet.">
            {(view?.activity ?? []).map((line, i) => (
              <Text key={`${i}-${line}`} style={s.muted}>
                {line}
              </Text>
            ))}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

type Styles = Record<
  "root" | "h1" | "h2" | "text" | "muted" | "card" | "input" | "button" | "buttonText" | "danger",
  object
>;
type Act = (type: string, args: Record<string, unknown>) => Promise<void>;

function Section({
  s,
  title,
  empty,
  children,
}: {
  s: Styles;
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <View style={s.card}>
      <Text style={s.h2}>{title}</Text>
      {children.length > 0 ? children : <Text style={s.muted}>{empty}</Text>}
    </View>
  );
}

function Spend({ s, h }: { s: Styles; h: HumanView }) {
  const over = h.spent.appetiteUsd !== null && h.spent.usd > h.spent.appetiteUsd;
  return (
    <Text style={over ? s.danger : s.muted}>
      Spent ${h.spent.usd.toFixed(2)}
      {h.spent.appetiteUsd !== null ? ` of an appetite of $${h.spent.appetiteUsd}` : ""} · {h.spent.tokens} tokens
    </Text>
  );
}

function Questions({ s, h, act }: { s: Styles; h: HumanView; act: Act }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <Section s={s} title="Questions for you" empty="None waiting.">
      {h.questions.map((q) => (
        <View key={q.id} style={{ gap: 6 }}>
          <Text style={s.text}>
            {q.from} asks: {q.text}
          </Text>
          {q.options.length > 0 ? <Text style={s.muted}>Options: {q.options.join(" · ")}</Text> : null}
          {q.recommend ? <Text style={s.muted}>Recommends: {q.recommend}</Text> : null}
          <TextInput
            style={s.input}
            value={answers[q.id] ?? ""}
            onChangeText={(t) => {
              setAnswers({ ...answers, [q.id]: t });
            }}
            placeholder="Your answer"
          />
          <Pressable
            style={s.button}
            onPress={() => void act("answer_question", { question: q.id, text: answers[q.id] ?? "" })}
          >
            <Text style={s.buttonText}>Answer</Text>
          </Pressable>
        </View>
      ))}
    </Section>
  );
}

function Permissions({ s, h, act }: { s: Styles; h: HumanView; act: Act }) {
  return (
    <Section s={s} title="Asking your leave" empty="Nothing.">
      {h.permissions.map((p) => (
        <View key={p.id} style={{ gap: 6 }}>
          <Text style={s.text}>
            {p.actor}: {p.text}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={s.button}
              onPress={() =>
                void act("answer_permission", { permission: p.id, allow: true, reason: "allowed by the Human" })
              }
            >
              <Text style={s.buttonText}>Allow</Text>
            </Pressable>
            <Pressable
              style={s.button}
              onPress={() =>
                void act("answer_permission", { permission: p.id, allow: false, reason: "refused by the Human" })
              }
            >
              <Text style={s.buttonText}>Refuse</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </Section>
  );
}

function Message({ s, to, act }: { s: Styles; to: string; act: Act }) {
  const [text, setText] = useState("");
  return (
    <View style={s.card}>
      <Text style={s.h2}>To the Supervisor</Text>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder="What you want, or a question"
        multiline
      />
      <Pressable
        style={s.button}
        onPress={() => {
          void act("send_message", { to, text, asks: true }).then(() => {
            setText("");
          });
        }}
      >
        <Text style={s.buttonText}>Send</Text>
      </Pressable>
    </View>
  );
}
