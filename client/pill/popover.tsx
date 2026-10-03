import type { PluginButtonContentProps, PluginClientContext } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { ROOT } from "../../shared/contracts/ids.ts";
import type { ViewOutput } from "../../shared/contracts/rpc.ts";
import { useHumanCommand } from "../decide/send.ts";
import { Waiting } from "../decide/waiting.tsx";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Field } from "../kit/field.tsx";
import { Mark } from "../kit/mark.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { type Tone, countsOf, seatsOf, waitingOf } from "../state/team.ts";
import { money, titled } from "../state/words.ts";

/** The pill's popover for one project: where its team stands, what waits, the quick things to do; `onRead` hears each read. */
export function popoverOf(
  client: Pick<PluginClientContext, "openPanel">,
  project: string,
  onRead: (view: ViewOutput) => void,
) {
  return function Popover(props: PluginButtonContentProps) {
    const { theme, workspaceId } = props;
    const { view, error, reload } = useProjectView(project);
    const agents = useSeatAgents(project);
    const { busy, said, send } = useHumanCommand(project);
    const [telling, setTelling] = useState(false);
    const [words, setWords] = useState("");
    const human = view?.human ?? null;
    // Each read the popover makes, the one after an answer among them, sets the pill's words at once.
    useEffect(() => {
      if (view) onRead(view);
    }, [view]);
    const { foreground, foregroundMuted, statusWarning } = theme.colors;
    const muted = { fontSize: FONT.small, color: foregroundMuted };
    if (!view || !human)
      return (
        <Text style={muted}>{error ? `Seatworks did not answer: ${error}` : (view?.root ?? "Reading the team.")}</Text>
      );

    const refresh = () => void reload();
    const waiting = waitingOf(human);
    const counts = countsOf(seatsOf(human, agents.running));
    const held = human.scopes.some((scope) => scope.parent === null && scope.held);
    const stuck = view.stuck.length;
    const title =
      stuck > 0
        ? `${stuck} stuck`
        : waiting > 0
          ? `${waiting} need${waiting === 1 ? "s" : ""} you`
          : held
            ? "Held"
            : "Nothing waits on you";
    const { root } = human;
    const here = props.context === "agent" ? props.agentId : null;
    const rootChat = root?.owner ? agents.ids[root.owner] : undefined;
    // In the root's own chat the composer is the way to tell it; anywhere else the popover offers one.
    const elsewhere = rootChat !== undefined && rootChat !== here;
    const count = (tone: Tone, n: number) =>
      n > 0 ? (
        <View key={tone} style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs }}>
          <Mark tone={tone} theme={theme} />
          <Text style={muted}>{n}</Text>
        </View>
      ) : null;
    const act = (type: string, args: Record<string, unknown>, then: () => void) => {
      void send(type, args).then((ok) => {
        if (ok) then();
      });
    };
    return (
      <ScrollView contentContainerStyle={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.xs }}>
          <Text style={{ flex: 1, fontSize: FONT.base, fontWeight: "500", color: foreground }}>{title}</Text>
          {count("work", counts.working)}
          {count("wait", counts.waiting)}
          {count("done", view.landed)}
        </View>
        {view.stuck.map((fact) => (
          <Banner key={fact} tone="danger" text={fact} theme={theme} />
        ))}
        {held ? <Text style={[muted, { paddingHorizontal: SPACE.xs }]}>No new seats. Nothing lands.</Text> : null}
        {waiting > 0 ? <Waiting project={project} human={human} theme={theme} onAnswered={refresh} /> : null}
        {telling && root?.owner ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SPACE.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                value={words}
                onChange={setWords}
                disabled={busy}
                placeholder="What you want, or a question"
                theme={theme}
                multiline
              />
            </View>
            <Button
              label="Send"
              tone="accent"
              theme={theme}
              disabled={busy || words.trim() === ""}
              onPress={() => {
                act("send_message", { to: root.owner, text: words, asks: true }, () => {
                  setWords("");
                  setTelling(false);
                  refresh();
                });
              }}
            />
          </View>
        ) : null}
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm, paddingTop: SPACE.xs }}
        >
          <Button
            label="Show the team"
            icon="Network"
            small
            theme={theme}
            onPress={() => {
              client.openPanel("team", { workspaceId, location: "explorer" });
              props.close();
            }}
          />
          <Button
            label={held ? "Resume" : "Hold"}
            icon={held ? "Play" : "Pause"}
            small
            theme={theme}
            disabled={busy}
            onPress={() => {
              act(
                held ? "resume_scope" : "hold_scope",
                { scope: ROOT, reason: `${held ? "resumed" : "held"} by the Human` },
                refresh,
              );
            }}
          />
          {root && elsewhere && !telling ? (
            <Button
              label={`Tell the ${titled(root.role)}`}
              icon="MessageSquare"
              small
              theme={theme}
              onPress={() => {
                setTelling(true);
              }}
            />
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={muted}>
            {money(human.spent.usd)}
            {human.spent.appetiteUsd !== null ? ` of ${money(human.spent.appetiteUsd)}` : ""}
          </Text>
        </View>
        {said && !said.ok ? <Text style={[muted, { color: statusWarning }]}>{said.text}</Text> : null}
      </ScrollView>
    );
  };
}
