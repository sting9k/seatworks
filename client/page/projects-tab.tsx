import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Attached, type Folder, RPC } from "../../shared/contracts/rpc.ts";
import { Banner } from "../kit/banner.tsx";
import { Button } from "../kit/button.tsx";
import { Card } from "../kit/card.tsx";
import { Field } from "../kit/field.tsx";
import { Label, Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE, pressState } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { useProjectView } from "../state/project-view.ts";
import { useSeatAgents } from "../state/seat-agents.ts";
import { seatsOf } from "../state/team.ts";
import { nameOf } from "../state/words.ts";
import { FolderRow } from "./folder-row.tsx";
import { StandingTag } from "./standing-tag.tsx";

type Theme = PluginSurfaceProps["theme"];

export type Listed = {
  readonly projects: readonly Attached[];
  readonly unattached: readonly Folder[];
  readonly profiles: readonly { readonly name: string; readonly title: string }[];
};

type LineProps = {
  readonly project: Attached;
  /** The template it runs, by its title where it is still installed. */
  readonly template: string | null;
  readonly theme: Theme;
  readonly onOpen: () => void;
};

/** One attached project on a line: its folder, its template, where its team stands. A press opens its own page. */
function ProjectLine({ project, template, theme, onOpen }: LineProps) {
  const { view } = useProjectView(project.id);
  const agents = useSeatAgents(project.id);
  const human = view?.human ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${nameOf(project.repo)}`}
      onPress={onOpen}
      style={({ pressed }) => pressState(false, pressed)}
    >
      <Row title={nameOf(project.repo)} meta={project.repo} height={52} theme={theme}>
        {template ? <Tag label={template} theme={theme} /> : null}
        {view && human ? (
          <StandingTag view={view} human={human} seats={seatsOf(human, agents.running)} theme={theme} />
        ) : null}
        <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
      </Row>
    </Pressable>
  );
}

type Props = {
  readonly listed: Listed | null;
  readonly theme: Theme;
  /** Opens a project's own page. */
  readonly onOpen: (project: string) => void;
  readonly onChanged: () => void;
  /** Leads to where a template is installed, which attaching needs. */
  readonly onTemplates: () => void;
};

/** The projects a team works in, a line each, and the folders one can be attached to: Paseo's projects, and any given by its path. */
export function ProjectsTab({ listed, theme, onOpen, onChanged, onTemplates }: Props) {
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
            <ProjectLine
              key={project.id}
              project={project}
              template={profiles.find((profile) => profile.name === project.profile)?.title ?? project.profile}
              theme={theme}
              onOpen={() => {
                onOpen(project.id);
              }}
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
