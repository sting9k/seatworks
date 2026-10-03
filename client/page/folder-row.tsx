import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { type Folder, RPC } from "../../shared/contracts/rpc.ts";
import { Button } from "../kit/button.tsx";
import { Row } from "../kit/row.tsx";
import { Tag } from "../kit/tag.tsx";
import { FONT, SPACE } from "../kit/theme.ts";
import { problemText } from "../state/problem-text.ts";
import { nameOf } from "../state/words.ts";

type Props = {
  readonly folder: Folder;
  /** The templates installed: a team is attached with one, named on the button that attaches it. */
  readonly templates: readonly { readonly name: string; readonly title: string }[];
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onAttach: (template: string) => void;
  /** Hears that the folder was made a repository, so how it stands is read again. */
  readonly onSetUp: () => void;
};

/** A folder with no team yet, on a line: attached with a template where it has git, set up with git where it has none. */
export function FolderRow({ folder, templates, theme, busy, onAttach, onSetUp }: Props) {
  const offer = useRpc(RPC.gitOffer);
  const setUp = useRpc(RPC.setUpGit);
  const toast = useToast();
  const [first, setFirst] = useState<{ files: number; ignores: boolean } | null>(null);
  const [working, setWorking] = useState(false);
  const { foregroundMuted } = theme.colors;
  /** Runs one press to its end: what was refused is said, and what it changed is handed on. */
  const act = <T extends { ok: boolean; text: string }>(work: () => Promise<T>, then: (answer: T) => void) => {
    setWorking(true);
    void work()
      .then((answer) => {
        if (!answer.ok) toast.show(answer.text, { variant: "warning" });
        else then(answer);
      })
      .catch((failed: unknown) => {
        toast.error(problemText(failed));
      })
      .finally(() => {
        setWorking(false);
      });
  };
  const locked = busy || working;
  return (
    <View>
      <Row title={folder.name} meta={folder.root} height={52} theme={theme}>
        {folder.within !== null ? <Tag label={`part of ${nameOf(folder.within)}`} theme={theme} /> : null}
        {folder.git === "none" ? <Tag label="no git yet" tone="warning" theme={theme} /> : null}
        {folder.git === "none" && first === null ? (
          <Button
            label="Set up git"
            theme={theme}
            disabled={locked}
            onPress={() => {
              act(
                () => offer({ dir: folder.root }),
                ({ files, ignores }) => {
                  setFirst({ files, ignores });
                },
              );
            }}
          />
        ) : null}
        {folder.git === "ready"
          ? templates.map((template) => (
              <Button
                key={template.name}
                label={`Attach with ${template.title}`}
                theme={theme}
                disabled={locked}
                onPress={() => {
                  onAttach(template.name);
                }}
              />
            ))
          : null}
      </Row>
      {folder.git === "none" && first !== null ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
            paddingBottom: SPACE.md,
            paddingHorizontal: SPACE.lg,
          }}
        >
          <Text style={{ flex: 1, fontSize: FONT.small, color: foregroundMuted }}>
            A first commit would hold {first.files} file{first.files === 1 ? "" : "s"}
            {first.ignores ? "." : ", everything in the folder: it has no .gitignore."}
          </Text>
          <Button
            label="Cancel"
            tone="quiet"
            theme={theme}
            disabled={locked}
            onPress={() => {
              setFirst(null);
            }}
          />
          <Button
            label={`Commit ${first.files} file${first.files === 1 ? "" : "s"}`}
            tone="accent"
            theme={theme}
            disabled={locked}
            onPress={() => {
              act(
                () => setUp({ dir: folder.root }),
                (made) => {
                  toast.show(made.text, { variant: "success" });
                  setFirst(null);
                  onSetUp();
                },
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
