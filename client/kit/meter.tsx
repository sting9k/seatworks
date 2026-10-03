import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import { money } from "../state/words.ts";
import { FONT, SPACE } from "./theme.ts";

type Props = { readonly usd: number; readonly of: number | null; readonly theme: PluginTheme };

/** What a team has spent beside what was set aside for it; over, it turns to the danger colour and says by how much. */
export function Meter({ usd, of, theme }: Props) {
  const { foreground, foregroundMuted, accent, statusDanger, surface2 } = theme.colors;
  const over = of !== null && usd > of;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: SPACE.sm }}>
        <Text style={{ fontSize: FONT.small, fontWeight: "500", color: over ? statusDanger : foreground }}>
          {money(usd)}
        </Text>
        {of !== null ? (
          <Text style={{ fontSize: FONT.small, color: foregroundMuted }}>
            {over ? `${money(usd - of)} over ${money(of)}` : `of ${money(of)}`}
          </Text>
        ) : null}
      </View>
      {of !== null && of > 0 ? (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: surface2, overflow: "hidden" }}>
          <View
            style={{
              height: 3,
              width: `${Math.min(100, Math.round((usd / of) * 100))}%`,
              backgroundColor: over ? statusDanger : accent,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
