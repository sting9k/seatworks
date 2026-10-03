import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { ProviderModel } from "../../shared/contracts/rpc.ts";
import type { Runs } from "../../shared/contracts/runs.ts";
import { Pick } from "../kit/pick.tsx";
import { FONT } from "../kit/theme.ts";
import { effortOn, startOf } from "../state/models.ts";
import type { Wanted } from "../state/runs.ts";

/** How wide each pick's cell is, so a table's header and its lines stand in the same columns. */
export type Columns = { readonly provider: number; readonly model: number; readonly effort: number };

type Props = {
  /** The name the picks are for, said over the choices. */
  readonly name: string;
  readonly runs: Runs;
  /** Which of the three are picked here over a default from elsewhere; left out where there is no such default. */
  readonly own?: { readonly provider: boolean; readonly model: boolean; readonly effort: boolean };
  /** The providers Paseo finds here. */
  readonly providers: readonly string[];
  /** The models of the provider it runs on; none while they are read. */
  readonly models: readonly ProviderModel[] | null;
  /** The models of a provider just picked. */
  readonly read: (provider: string) => Promise<readonly ProviderModel[] | null>;
  /** Left out where the picks stand in no table: each is then as wide as its word. */
  readonly columns?: Columns;
  readonly theme: PluginTheme;
  readonly busy: boolean;
  readonly onWant: (wanted: Wanted) => void;
};

const OWN = "";

/** What a name runs, as three picks on its line: a provider, a model of it, an effort of that model. */
export function AgentPicks({ name, runs, own, providers, models, read, columns, theme, busy, onWant }: Props) {
  const { provider, model, effort } = runs;
  const state = (mine: boolean | undefined) => (mine === true ? "own" : "set");
  const listed = models?.find((one) => one.id === model);
  const efforts = listed?.efforts ?? [];
  const cell = (width: number | undefined) => ({ width, flexDirection: "row" as const, alignItems: "center" as const });
  if (provider === null) return null;
  return (
    <>
      <View style={cell(columns?.provider)}>
        <Pick
          title={`Provider for ${name}`}
          label={provider}
          state={state(own?.provider)}
          value={provider}
          choices={[...new Set([...providers, provider])].map((one) => ({ value: one, label: one }))}
          theme={theme}
          disabled={busy}
          onPick={(next) => {
            // A model is one provider's: a new provider brings its own model, at the effort that model starts on.
            void read(next).then((theirs) => {
              const start = theirs ? startOf(theirs) : null;
              if (start) onWant({ provider: next, ...start });
            });
          }}
        />
      </View>
      <View style={cell(columns?.model)}>
        <Pick
          title={`Model for ${name}`}
          label={model === null ? "Pick a model" : (listed?.label ?? model)}
          state={model === null ? "unset" : state(own?.model)}
          value={model}
          choices={(models ?? []).map((one) => ({
            value: one.id,
            label: one.label,
            ...(one.isDefault ? { note: `${provider}'s own` } : {}),
          }))}
          theme={theme}
          disabled={busy || models === null}
          onPick={(next) => {
            if (models) onWant({ provider, model: next, effort: effortOn(models, next, effort) });
          }}
        />
      </View>
      <View style={cell(columns?.effort)}>
        {model !== null && efforts.length > 0 ? (
          <Pick
            title={`Effort for ${name}`}
            label={effort === null ? "its own" : (efforts.find((one) => one.id === effort)?.label ?? effort)}
            state={state(own?.effort)}
            value={effort ?? OWN}
            choices={[
              { value: OWN, label: "The model's own" },
              ...efforts.map((one) => ({ value: one.id, label: one.label })),
            ]}
            theme={theme}
            disabled={busy}
            onPick={(next) => {
              onWant({ provider, model, effort: next === OWN ? null : next });
            }}
          />
        ) : (
          <Text style={{ fontSize: FONT.small, color: theme.colors.foregroundMuted, paddingHorizontal: 10 }}>
            {effort ?? "—"}
          </Text>
        )}
      </View>
    </>
  );
}
