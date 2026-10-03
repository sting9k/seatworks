import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  type Preset,
  type ProfileAgents,
  RPC,
  type TemplateOffer,
  type TemplateSource,
} from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Field } from "../kit/field.tsx";
import { Label, Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { oneOn, restOn } from "../state/matching.ts";
import { problemText } from "../state/problem-text.ts";

/** Where templates are made and shared: the gallery's page, which carries the editor. */
const EDITOR = "https://sting9k.github.io/seatworks-gallery/";

export type Matching = { readonly profiles: readonly ProfileAgents[]; readonly available: readonly string[] };

type InstalledProps = {
  readonly profile: ProfileAgents;
  readonly available: readonly string[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onMatch: (matching: Record<string, string>) => void;
  readonly onRemove: () => void;
};

/** One installed template on a line; opened, each agent profile its roles name and the one of the Human's it runs on. */
function Installed({ profile, available, theme, busy, onMatch, onRemove }: InstalledProps) {
  const unmatched = profile.agents.filter((agent) => !agent.there).length;
  const [open, setOpen] = useState(unmatched > 0);
  const [removing, setRemoving] = useState(false);
  const { foregroundMuted, statusDanger, border } = theme.colors;
  return (
    <View>
      <Row title={profile.title} meta={`${profile.agents.length} agent profiles`} theme={theme}>
        {unmatched > 0 ? <Tag label={`${unmatched} to match`} tone="warning" theme={theme} /> : null}
        <Button
          label={removing ? "Press again to remove" : "Remove"}
          tone="quiet"
          theme={theme}
          disabled={busy}
          onPress={() => {
            if (removing) onRemove();
            setRemoving(!removing);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Agents for ${profile.title}`}
          hitSlop={8}
          onPress={() => {
            setOpen(!open);
          }}
        >
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={foregroundMuted} />
        </Pressable>
      </Row>
      {profile.problem ? (
        <Text
          style={{ fontSize: FONT.small, color: statusDanger, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md }}
        >
          {profile.problem}
        </Text>
      ) : null}
      {open && unmatched > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {available.length > 0 ? (
            <SettingsSelect
              label={unmatched === 1 ? "Run the one not matched on" : `Run all ${unmatched} not matched on`}
              value=""
              options={[
                { label: "Pick one of yours", value: "" },
                ...available.map((name) => ({ label: name, value: name })),
              ]}
              disabled={busy}
              onValueChange={(runsOn) => {
                if (runsOn !== "") onMatch(restOn(profile.agents, runsOn));
              }}
            />
          ) : (
            <Text style={{ fontSize: FONT.small, color: foregroundMuted, padding: SPACE.lg }}>
              Paseo has no agent profile yet. Make one in its settings, then match these to it.
            </Text>
          )}
        </View>
      ) : null}
      {open
        ? profile.agents.map((agent) => (
            <View key={agent.name} style={{ borderTopWidth: 1, borderTopColor: border }}>
              <SettingsSelect
                label={agent.name}
                error={agent.there ? null : `Paseo has no agent profile named ${agent.runsOn}`}
                value={agent.runsOn}
                options={[...new Set([...available, agent.name, agent.runsOn])].map((name) => ({
                  label: name,
                  value: name,
                }))}
                disabled={busy}
                onValueChange={(runsOn) => {
                  onMatch(oneOn(profile.agents, agent.name, runsOn));
                }}
              />
            </View>
          ))
        : null}
    </View>
  );
}

/** What installing a template would bring, as rows of a short table to read before agreeing. */
function offerRows(offer: TemplateOffer, theme: PluginTheme) {
  const missing = offer.agentProfiles.filter((profile) => !profile.there);
  const unset = offer.variables.filter((variable) => !variable.there);
  return [
    <Row key="title" title={offer.title} meta={offer.description} theme={theme}>
      {offer.replaces ? <Tag label="takes the place of one installed" tone="warning" theme={theme} /> : null}
    </Row>,
    <Row key="name" kind="Installed as" title={offer.name} theme={theme} />,
    <Row key="roles" kind="Roles" title={offer.roles.join(", ")} theme={theme} />,
    <Row
      key="agents"
      kind="Agents"
      title={offer.agentProfiles.map((profile) => profile.name).join(", ") || "None"}
      theme={theme}
    >
      {missing.length > 0 ? <Tag label={`${missing.length} not in Paseo`} tone="warning" theme={theme} /> : null}
    </Row>,
    <Row
      key="servers"
      kind="Tool servers"
      title={offer.servers.map((server) => server.name).join(", ") || "None"}
      theme={theme}
    >
      {unset.length > 0 ? (
        <Tag label={`needs ${unset.map((variable) => `$${variable.name}`).join(", ")}`} tone="warning" theme={theme} />
      ) : null}
    </Row>,
    <Row
      key="classifier"
      kind="Classifier"
      title={offer.classifier.map((route) => route.host).join(", ") || "None"}
      theme={theme}
    />,
  ];
}

type Props = { readonly matching: Matching | null; readonly theme: PluginTheme; readonly onChanged: () => void };

/** The templates on this machine, the agents their roles run as, and the way to bring in another. */
export function TemplatesTab({ matching, theme, onChanged }: Props) {
  const listPresets = useRpc(RPC.presets);
  const read = useRpc(RPC.templateOffer);
  const install = useRpc(RPC.installTemplate);
  const remove = useRpc(RPC.removeTemplate);
  const ask = useRpc(RPC.agents);
  const [presets, setPresets] = useState<readonly Preset[]>([]);
  const [path, setPath] = useState("");
  const [offered, setOffered] = useState<{ from: TemplateSource; offer: TemplateOffer } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: SPACE.xs };

  const loadPresets = useCallback(async () => {
    try {
      setPresets((await listPresets({})).presets);
    } catch {
      // Read again on the next visit; a plugin that does not answer says so where a template is read.
    }
  }, [listPresets]);
  useEffect(() => {
    void loadPresets();
  }, [loadPresets, matching]);

  /** Runs one press to its end: what was refused is said, and what changed is read again. */
  const act = (work: () => Promise<{ ok: boolean; text: string }>, then?: () => void) => {
    setBusy(true);
    void work()
      .then((answer) => {
        setSaid(answer.ok ? null : answer.text);
        if (answer.ok) then?.();
      })
      .catch((failed: unknown) => {
        setSaid(problemText(failed));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const offer = (from: TemplateSource) => {
    act(async () => {
      const answer = await read({ from });
      setOffered(answer.offer ? { from, offer: answer.offer } : null);
      return answer;
    });
  };
  const toAdd = presets.filter((preset) => preset.installed !== "same");

  return (
    <>
      {said ? <Text style={[muted, { color: theme.colors.statusDanger }]}>{said}</Text> : null}
      {matching && matching.profiles.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Label text="Installed" theme={theme} />
          <Card theme={theme}>
            {matching.profiles.map((profile) => (
              <Installed
                key={profile.name}
                profile={profile}
                available={matching.available}
                theme={theme}
                busy={busy}
                onMatch={(match) => {
                  act(() => ask({ match: { profile: profile.name, matching: match } }), onChanged);
                }}
                onRemove={() => {
                  act(() => remove({ name: profile.name }), onChanged);
                }}
              />
            ))}
          </Card>
        </View>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        <Label text="Add a template" theme={theme} />
        <Card theme={theme}>
          {toAdd.map((preset) => (
            <Row
              key={preset.name}
              title={preset.title}
              meta={preset.installed === "no" ? "Comes with Seatworks" : "This release brings a newer one"}
              theme={theme}
            >
              <Button
                label="Read"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  offer({ preset: preset.name });
                }}
              />
            </Row>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm, padding: SPACE.md }}>
            <Field
              value={path}
              onChange={(text) => {
                setPath(text);
                setOffered(null);
              }}
              disabled={busy}
              placeholder="Path of a template file"
              theme={theme}
            />
            <Button
              label="Read"
              theme={theme}
              disabled={busy || path.trim() === ""}
              onPress={() => {
                offer({ path: path.trim() });
              }}
            />
          </View>
          {offered ? offerRows(offered.offer, theme) : null}
          {offered ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: SPACE.md }}>
              <Button
                label={offered.offer.replaces ? "Install in its place" : "Install"}
                tone="accent"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  act(
                    () => install({ from: offered.from, hash: offered.offer.hash }),
                    () => {
                      setOffered(null);
                      setPath("");
                      onChanged();
                    },
                  );
                }}
              />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Make one in the editor"
            onPress={() => void openExternalUrl(EDITOR)}
          >
            <Row title="Make one in the editor" theme={theme}>
              <Icon name="ExternalLink" size={14} color={theme.colors.foregroundMuted} />
            </Row>
          </Pressable>
        </Card>
      </View>
    </>
  );
}
