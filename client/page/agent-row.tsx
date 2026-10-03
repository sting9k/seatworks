import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ProfileAgents } from "../../shared/contracts/rpc.ts";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE, pressState } from "../kit/theme.ts";
import { effortOn } from "../state/models.ts";
import { useModels } from "../state/provider-models.ts";

type Agent = ProfileAgents["agents"][number];

type Props = {
  readonly agent: Agent;
  /** The agent profiles the Human keeps in Paseo, to run this name on another of them. */
  readonly available: readonly string[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onMatch: (runsOn: string) => void;
  /** Gives the profile this name runs on another model and effort. */
  readonly onShape: (model: string, effort: string | null) => void;
};

/** One name a template gives, on a line: what it runs; opened, the profile it runs on, its model and its effort. */
export function AgentRow({ agent, available, theme, busy, onMatch, onShape }: Props) {
  const [open, setOpen] = useState(!agent.there || agent.model === null);
  const { models, problem } = useModels(open && agent.there ? agent.provider : null);
  const { foreground, foregroundMuted, statusDanger, border } = theme.colors;
  const efforts = models?.find((model) => model.id === agent.model)?.efforts ?? [];
  const runs = [agent.provider, agent.model, agent.effort].filter((part) => part !== null).join(" · ");
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${agent.name}, ${runs || "not in Paseo"}`}
        onPress={() => {
          setOpen(!open);
        }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minHeight: 44,
            paddingVertical: 6,
            paddingHorizontal: SPACE.lg,
          },
          pressState(false, pressed),
        ]}
      >
        <Text style={{ fontSize: FONT.base, color: foreground }} numberOfLines={1}>
          {agent.name}
        </Text>
        <Text style={{ flex: 1, minWidth: 0, fontSize: FONT.small, color: foregroundMuted }} numberOfLines={1}>
          {runs}
        </Text>
        {agent.there ? null : <Tag label="not in Paseo" tone="warning" theme={theme} />}
        {agent.there && agent.model === null ? <Tag label="no model" tone="warning" theme={theme} /> : null}
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={foregroundMuted} />
      </Pressable>
      {open ? (
        <View>
          <SettingsSelect
            label="Runs on"
            error={agent.there ? null : `Paseo has no agent profile named ${agent.runsOn}`}
            value={agent.runsOn}
            options={[...new Set([...available, agent.name, agent.runsOn])].map((name) => ({
              label: name,
              value: name,
            }))}
            disabled={busy}
            onValueChange={onMatch}
          />
          {models ? (
            <SettingsSelect
              label="Model"
              error={agent.model === null ? "Paseo makes no agent of a profile with no model" : null}
              value={agent.model ?? ""}
              options={[
                ...(agent.model === null ? [{ label: "Pick a model", value: "" }] : []),
                ...[...new Set([...models.map((model) => model.id), ...(agent.model ? [agent.model] : [])])].map(
                  (id) => ({ label: models.find((model) => model.id === id)?.label ?? id, value: id }),
                ),
              ]}
              disabled={busy}
              onValueChange={(model) => {
                if (model !== "") onShape(model, effortOn(models, model, agent.effort));
              }}
            />
          ) : null}
          {models && agent.model !== null && efforts.length > 0 ? (
            <SettingsSelect
              label="Effort"
              value={agent.effort ?? ""}
              options={[
                { label: "The model's own", value: "" },
                ...efforts.map((effort) => ({ label: effort.label, value: effort.id })),
              ]}
              disabled={busy}
              onValueChange={(effort) => {
                onShape(agent.model!, effort === "" ? null : effort);
              }}
            />
          ) : null}
          {problem ? (
            <Text style={{ fontSize: FONT.small, color: statusDanger, padding: SPACE.lg }}>{problem}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
