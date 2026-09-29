import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSection } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { Button } from "../kit/button.tsx";
import { DisclosureList } from "../kit/disclosure.tsx";
import { PageHeader } from "../kit/header.tsx";
import { FONT } from "../kit/theme.ts";

export type Attached = { readonly id: string; readonly repo: string };
export type Offered = { readonly name: string; readonly root: string };

/** The last part of a path, as a project is named where Paseo shows no name of its own. */
export const nameOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

type Props = {
  readonly projects: readonly Attached[];
  readonly unattached: readonly Offered[];
  readonly attaching: string | null;
  readonly theme: PluginTheme;
  readonly onProject: (id: string) => void;
  readonly onAttach: (root: string) => void;
  readonly onPlugin: () => void;
};

/** Where projects are attached and picked: what a team is doing is on its project's page and in its chats. */
export function Home({ projects, unattached, attaching, theme, onProject, onAttach, onPlugin }: Props) {
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
  return (
    <>
      <PageHeader title="Seatworks" subtitle="Attach a project, then work with its Supervisor." theme={theme} />
      <SettingsSection title="Projects">
        {projects.length > 0 ? (
          <DisclosureList
            theme={theme}
            open={null}
            onOpen={() => undefined}
            items={projects.map((p) => ({
              id: p.id,
              title: nameOf(p.repo),
              hint: p.repo,
              onPress: () => {
                onProject(p.id);
              },
            }))}
          />
        ) : (
          <Text style={muted}>No project is attached yet. Attach one below.</Text>
        )}
      </SettingsSection>
      <SettingsSection title="Attach a project">
        {unattached.length > 0 ? (
          <DisclosureList
            theme={theme}
            open={null}
            onOpen={() => undefined}
            items={unattached.map((p) => ({
              id: p.root,
              title: p.name,
              hint: p.root,
              trailing: (
                <Button
                  label={attaching === p.root ? "Attaching" : "Attach"}
                  theme={theme}
                  disabled={attaching !== null}
                  onPress={() => {
                    onAttach(p.root);
                  }}
                />
              ),
            }))}
          />
        ) : (
          <Text style={muted}>
            Every git project Paseo has is attached. Open another in Paseo to attach it here; attaching starts its
            Supervisor.
          </Text>
        )}
      </SettingsSection>
      <SettingsSection title="This machine">
        <DisclosureList
          theme={theme}
          open={null}
          onOpen={() => undefined}
          items={[{ id: "plugin", title: "Plugin", hint: "Updates and clean up", onPress: onPlugin }]}
        />
      </SettingsSection>
    </>
  );
}
