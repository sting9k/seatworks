import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ROOT } from "../../shared/contracts/ids.ts";
import { type Folder, type Leftover, RPC } from "../../shared/contracts/rpc.ts";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Field } from "../kit/field.tsx";
import { Label, Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useRepoWorkspace } from "../state/repo-workspace.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { countsOf, seatsOf, waitingOf } from "../state/team.ts";
import { nameOf, titled } from "../state/words.ts";
import { ChecksEditor } from "./checks-editor.tsx";
import { FolderRow } from "./folder-row.tsx";

type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

export type Listed = {
  readonly projects: readonly { readonly id: string; readonly repo: string; readonly profile: string | null }[];
  readonly unattached: readonly Folder[];
  readonly profiles: readonly { readonly name: string; readonly title: string }[];
};

type AttachedProps = {
  readonly project: string;
  readonly repo: string;
  readonly theme: Theme;
  readonly navigation: Navigation;
  /** Opens the Team tab of a workspace. */
  readonly onTeam: (workspaceId: string) => void;
  readonly onChanged: () => void;
};

/** One attached project on a line: its template, where its team stands, the way into its chat; opened, its settings. */
function Attached({ project, repo, theme, navigation, onTeam, onChanged }: AttachedProps) {
  const { view, reload } = useProjectView(project);
  const agents = useSeatAgents(project);
  const workspace = useRepoWorkspace(repo);
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
  const stuck = view?.stuck ?? [];
  const chat = human?.root?.owner ? agents.ids[human.root.owner] : undefined;
  const seats = human ? seatsOf(human, agents.running) : [];
  const { foregroundMuted, surface0, border, statusDanger } = theme.colors;

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
        {stuck.length > 0 ? <Tag label={`${stuck.length} stuck`} tone="danger" theme={theme} /> : null}
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
          {stuck.length > 0 ? (
            <View
              style={{ gap: SPACE.xs, paddingVertical: SPACE.md, paddingRight: SPACE.lg, paddingLeft: SPACE.lg * 2 }}
            >
              {stuck.map((fact) => (
                <Text key={fact} style={{ fontSize: FONT.small, color: statusDanger }}>
                  {fact}
                </Text>
              ))}
            </View>
          ) : null}
          {human?.root ? (
            <Row
              kind="Team"
              title={
                human.root.owner === null
                  ? `Nobody is seated as ${titled(human.root.role)}`
                  : `${seats.length} seat${seats.length === 1 ? "" : "s"}`
              }
              dimmed={human.root.owner === null}
              theme={theme}
              indent
            >
              {human.root.owner === null ? (
                <Button
                  label="Seat it again"
                  tone="accent"
                  theme={theme}
                  disabled={busy}
                  onPress={() => {
                    act(
                      async () => {
                        const said = await command({
                          project,
                          type: "reseat",
                          args: { scope: ROOT, reason: "seated again by the Human" },
                        });
                        return said.ok ? { ok: true, text: `${titled(human.root!.role)} is seated again.` } : said;
                      },
                      () => void reload(),
                    );
                  }}
                />
              ) : null}
              {workspace ? (
                <Button
                  label="Show the team"
                  theme={theme}
                  onPress={() => {
                    onTeam(workspace);
                  }}
                />
              ) : null}
            </Row>
          ) : null}
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
  /** Opens the Team tab of a workspace. */
  readonly onTeam: (workspaceId: string) => void;
  readonly onChanged: () => void;
  /** Leads to where a template is installed, which attaching needs. */
  readonly onTemplates: () => void;
};

/** The projects a team works in, and the folders one can be attached to: Paseo's projects, and any given by its path. */
export function ProjectsTab({ listed, theme, navigation, onTeam, onChanged, onTemplates }: Props) {
  const attach = useRpc(RPC.openProject);
  const find = useRpc(RPC.folderAt);
  const toast = useToast();
  const [attaching, setAttaching] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [added, setAdded] = useState<readonly Folder[]>([]);
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: SPACE.xs };
  if (!listed) return <Text style={muted}>Reading the projects.</Text>;
  const { projects, unattached, profiles } = listed;
  const taken = new Set([...projects.map((project) => project.repo), ...unattached.map((folder) => folder.root)]);
  const folders = [...unattached, ...added.filter((folder) => !taken.has(folder.root))];
  /** Reads a folder given by its path, to offer it among the rest; what is no folder, or has a team, is said. */
  const read = (dir: string) => {
    setAttaching(dir);
    void find({ dir })
      .then((found) => {
        const { folder } = found;
        if (!folder) toast.show(found.text, { variant: "warning" });
        else setAdded((all) => [...all.filter((other) => other.root !== folder.root), folder]);
        if (folder) setPath("");
      })
      .catch((failed: unknown) => {
        toast.error(problemText(failed));
      })
      .finally(() => {
        setAttaching(null);
      });
  };
  const attachWith = (root: string, profile: string) => {
    setAttaching(root);
    void attach({ cwd: root, profile })
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
              onTeam={onTeam}
              onChanged={onChanged}
            />
          ))}
        </Card>
      ) : null}
      {folders.length > 0 && profiles.length === 0 ? (
        <Banner
          tone="warning"
          text="Install a template before attaching a project"
          theme={theme}
          onPress={onTemplates}
        />
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        <Label text="Attach a team to" theme={theme} />
        <Card theme={theme}>
          {folders.map((folder) => (
            <FolderRow
              key={folder.root}
              folder={folder}
              templates={profiles}
              theme={theme}
              busy={attaching !== null}
              onAttach={(template) => {
                attachWith(folder.root, template);
              }}
              onSetUp={() => {
                read(folder.root);
                onChanged();
              }}
            />
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm, padding: SPACE.md }}>
            <Field
              value={path}
              onChange={setPath}
              disabled={attaching !== null}
              placeholder="Path of a folder on this machine"
              theme={theme}
            />
            <Button
              label="Add"
              theme={theme}
              disabled={attaching !== null || path.trim() === ""}
              onPress={() => {
                read(path.trim());
              }}
            />
          </View>
        </Card>
        {folders.length === 0 ? (
          <Text style={muted}>
            Projects you add in Paseo show here: Add project, at the foot of its sidebar. Or give a folder&apos;s path.
          </Text>
        ) : null}
      </View>
    </>
  );
}
