import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { INFO, type InfoTab, LANGS, type Lang } from "../state/info.ts";
import { Tabs } from "./tabs.tsx";
import { FONT, SPACE } from "./theme.ts";

type Props = {
  /** The tab whose fields are described, and the name it goes by. */
  readonly tab: InfoTab;
  readonly title: string;
  readonly lang: Lang;
  readonly theme: PluginTheme;
  readonly onLang: (lang: Lang) => void;
};

/** A tab's fields described on demand, in the reader's language: an "i" beside the tabs that opens them. */
export function Info({ tab, title, lang, theme, onLang }: Props) {
  const [open, setOpen] = useState(false);
  const { foreground, foregroundMuted } = theme.colors;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What is on ${title}`}
        hitSlop={8}
        onPress={() => {
          setOpen(true);
        }}
      >
        <Icon name="Info" size={16} color={foregroundMuted} />
      </Pressable>
      {open ? (
        <Modal
          title={title}
          open
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
        >
          <Modal.Content contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.lg }}>
            <Tabs tabs={LANGS} active={lang} theme={theme} onPick={onLang} />
            {INFO[tab].map((entry) => (
              <View key={entry.field} style={{ gap: SPACE.xs }}>
                <Text style={{ fontSize: FONT.base, fontWeight: "500", color: foreground }}>{entry.field}</Text>
                <Text style={{ fontSize: FONT.base, lineHeight: 20, color: foregroundMuted }}>{entry[lang]}</Text>
              </View>
            ))}
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  );
}
