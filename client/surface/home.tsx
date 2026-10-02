import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text } from "react-native";
import { Button } from "../kit/button.tsx";
import { DisclosureList } from "../kit/disclosure.tsx";
import { PageHeader } from "../kit/header.tsx";
import { FONT } from "../kit/theme.ts";

export type Listed = {
  readonly projects: readonly { readonly id: string; readonly repo: string }[];
  readonly unattached: readonly { readonly name: string; readonly root: string }[];
  readonly profiles: readonly { readonly name: string; readonly title: string; readonly description: string }[];
};

/** The last part of a path, as a project is named where Paseo shows no name of its own. */
export const nameOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

type Props = {
  readonly listed: Listed | null;
  readonly problem: string | null;
  readonly attaching: string | null;
  readonly theme: PluginTheme;
  readonly onProject: (id: string) => void;
  /** Attaches a project with the profile named, or with the only one there is. */
  readonly onAttach: (root: string, profile?: string) => void;
  readonly onPlugin: () => void;
  readonly onRetry: () => void;
};

/** Where projects are attached and picked: what a team is doing is on its project's page and in its chats. */
export function Home({ listed, problem, attaching, theme, onProject, onAttach, onPlugin, onRetry }: Props) {
  const muted = { fontSize: FONT.small, color: theme.colors.foregroundMuted };
  const projects = listed?.projects ?? [];
  const unattached = listed?.unattached ?? [];
  const profiles = listed?.profiles ?? [];
  const [choosing, setChoosing] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Seatworks" subtitle="Attach a project, then work with its team." theme={theme} />
      {problem ? (
        <SettingsCard>
          <SettingsAction label="Seatworks did not answer" error={problem} actionLabel="Try again" onPress={onRetry} />
        </SettingsCard>
      ) : null}
      <SettingsSection title="Projects">
        {!listed ? (
          <Text style={muted}>{problem ? "Not read yet." : "Reading the projects."}</Text>
        ) : projects.length > 0 ? (
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
        {!listed ? null : unattached.length > 0 ? (
          <DisclosureList
            theme={theme}
            open={choosing}
            onOpen={setChoosing}
            items={unattached.map((p) =>
              // With one profile there is nothing to choose: the project is attached at once.
              profiles.length > 1
                ? {
                    id: p.root,
                    title: p.name,
                    hint: attaching === p.root ? "Attaching" : p.root,
                    body: profiles.map((profile) => (
                      <Button
                        key={profile.name}
                        label={`Attach with ${profile.title}`}
                        theme={theme}
                        disabled={attaching !== null}
                        onPress={() => {
                          onAttach(p.root, profile.name);
                        }}
                      />
                    )),
                  }
                : {
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
                  },
            )}
          />
        ) : (
          <Text style={muted}>
            Every git project Paseo has is attached. Open another in Paseo to attach it here; attaching starts its team.
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
