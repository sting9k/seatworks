import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Leftover, RPC } from "../../shared/contracts/rpc.ts";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Label, Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { countsOf, seatsOf, waitingOf } from "../state/team.ts";
import { nameOf } from "../state/words.ts";
import { ChecksEditor } from "./checks-editor.tsx";

type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

export type Listed = {
  readonly projects: readonly { readonly id: string; readonly repo: string }[];
  readonly unattached: readonly { readonly name: string; readonly root: string }[];
  readonly profiles: readonly { readonly name: string; readonly title: string }[];
};

type AttachedProps = {
  readonly project: string;
  readonly repo: string;
  readonly theme: Theme;
  readonly navigation: Navigation;
  readonly onChanged: () => void;
};

/** One attached project on a line: its template, where its team stands, the way into its chat; opened, its settings. */
function Attached({ project, repo, theme, navigation, onChanged }: AttachedProps) {
  const { view, reload } = useProjectView(project);
  const agents = useSeatAgents(project);
  const sync = useRpc(RPC.syncTemplate);
  const command = useRpc(RPC.human);
  const list = useRpc(RPC.leftovers);
  const clean = useRpc(RPC.clean);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [whole, setWhole] = useState<Leftover | null>(null);
  const [checking, setChecking] = useState(false);
  const human = view?.human ?? null;
  const template = view?.template ?? null;
  const waiting = human ? waitingOf(human) : 0;
  const working = human ? countsOf(seatsOf(human, agents.running)).working : 0;
  const chat = human?.root?.owner ? agents.ids[human.root.owner] : undefined;
  const { foregroundMuted, surface0, border } = theme.colors;

  /** Runs one press to its end, saying what came of it and reading the project again. */
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
  const askToRemove = () => {
    setBusy(true);
    void list({})
      .then(({ leftovers }) => {
        const found = leftovers.find((left) => left.kind === "project" && left.project === project);
        if (found) setWhole(found);
        else toast.error("Seatworks no longer keeps this project.");
      })
      .catch((failed: unknown) => {
        toast.error(problemText(failed));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View>
      <Row title={nameOf(repo)} meta={repo} theme={theme}>
        {template ? <Tag label={template.name} theme={theme} /> : null}
        {view && view.stuck.length > 0 ? (
          <Tag label={`${view.stuck.length} stuck`} tone="danger" theme={theme} />
        ) : null}
        {waiting > 0 ? (
          <Tag label={`${waiting} need${waiting === 1 ? "s" : ""} you`} tone="warning" theme={theme} />
        ) : working > 0 ? (
          <Tag label={`${working} working`} theme={theme} />
        ) : null}
        {chat && navigation ? (
          <Button
            label="Open"
            theme={theme}
            onPress={() => {
              navigation.openAgent({ agentId: chat });
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Settings of ${nameOf(repo)}`}
          hitSlop={8}
          onPress={() => {
            setOpen(!open);
          }}
        >
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={foregroundMuted} />
        </Pressable>
      </Row>
      {view?.alarm ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md }}>
          <Banner tone="danger" text={view.alarm} theme={theme} />
        </View>
      ) : null}
      {open ? (
        <View style={{ backgroundColor: surface0, borderTopWidth: 1, borderTopColor: border }}>
          {template ? (
            <Row kind="Template" title={template.name} theme={theme} indent>
              {template.state === "uninstalled" ? <Tag label="not installed" tone="warning" theme={theme} /> : null}
              {template.state === "behind" || template.edited ? (
                <>
                  <Tag label={template.edited ? "changed by hand" : "changed"} tone="warning" theme={theme} />
                  {template.state === "uninstalled" ? null : (
                    <Button
                      label="Sync"
                      theme={theme}
                      disabled={busy}
                      onPress={() => {
                        act(
                          () => sync({ project }),
                          () => void reload(),
                        );
                      }}
                    />
                  )}
                </>
              ) : null}
            </Row>
          ) : null}
          <Row
            kind="Checks"
            title={human && human.checks.length > 0 ? human.checks.map((check) => check.name).join(" · ") : "None set"}
            dimmed={!human || human.checks.length === 0}
            theme={theme}
            indent
          >
            {human && !checking ? (
              <Button
                label="Edit"
                tone="quiet"
                theme={theme}
                disabled={busy}
                onPress={() => {
                  setChecking(true);
                }}
              />
            ) : null}
          </Row>
          {human && checking ? (
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
                    void reload();
                  },
                );
              }}
            />
          ) : null}
          <Row kind="Remove" title="Its agents, copies and branches" dimmed theme={theme} indent>
            {whole ? null : <Button label="Remove" tone="quiet" theme={theme} disabled={busy} onPress={askToRemove} />}
          </Row>
          {whole ? (
            <View
              style={{ gap: SPACE.sm, paddingVertical: SPACE.md, paddingRight: SPACE.lg, paddingLeft: SPACE.lg * 2 }}
            >
              <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>{whole.why}</Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACE.sm }}>
                <Button
                  label="Cancel"
                  tone="quiet"
                  theme={theme}
                  disabled={busy}
                  onPress={() => {
                    setWhole(null);
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
                      onChanged,
                    );
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  readonly listed: Listed | null;
  readonly theme: Theme;
  readonly navigation: Navigation;
  readonly onChanged: () => void;
  /** Leads to where a template is installed, which attaching needs. */
  readonly onTemplates: () => void;
};

/** The projects a team works in, and Paseo's projects a team can be attached to. */
export function ProjectsTab({ listed, theme, navigation, onChanged, onTemplates }: Props) {
  const attach = useRpc(RPC.openProject);
  const toast = useToast();
  const [attaching, setAttaching] = useState<string | null>(null);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: SPACE.xs };
  if (!listed) return <Text style={muted}>Reading the projects.</Text>;
  const { projects, unattached, profiles } = listed;
  const attachWith = (root: string, profile?: string) => {
    setAttaching(root);
    void attach(profile === undefined ? { cwd: root } : { cwd: root, profile })
      .then((said) => {
        toast.show(said.text, { variant: said.ok ? "success" : "warning" });
      })
      .catch((failed: unknown) => {
        toast.error(problemText(failed));
      })
      .finally(() => {
        setAttaching(null);
        onChanged();
      });
  };
  return (
    <>
      {projects.length > 0 ? (
        <Card theme={theme}>
          {projects.map((project) => (
            <Attached
              key={project.id}
              project={project.id}
              repo={project.repo}
              theme={theme}
              navigation={navigation}
              onChanged={onChanged}
            />
          ))}
        </Card>
      ) : null}
      {unattached.length > 0 && profiles.length === 0 ? (
        <Banner
          tone="warning"
          text="Install a template before attaching a project"
          theme={theme}
          onPress={onTemplates}
        />
      ) : null}
      {unattached.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Label text="Not attached" theme={theme} />
          <Card theme={theme}>
            {unattached.map((project) => (
              <Row key={project.root} title={project.name} meta={project.root} theme={theme}>
                {profiles.map((profile) => (
                  <Button
                    key={profile.name}
                    label={profiles.length > 1 ? `Attach with ${profile.title}` : "Attach"}
                    theme={theme}
                    disabled={attaching !== null}
                    onPress={() => {
                      attachWith(project.root, profiles.length > 1 ? profile.name : undefined);
                    }}
                  />
                ))}
              </Row>
            ))}
          </Card>
        </View>
      ) : null}
      {projects.length === 0 && unattached.length === 0 ? (
        <Text style={muted}>Paseo has no git project yet. Add one in Paseo and it shows here.</Text>
      ) : null}
    </>
  );
}
