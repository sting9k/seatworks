import type { PluginTheme } from "@getpaseo/plugin";
import type { HumanView, ViewOutput } from "../../shared/contracts/rpc.ts";
import { Tag } from "../kit/tag.tsx";
import { type Seat, type Tone, standingOf } from "../state/team.ts";

/** What cannot wait is coloured, the rest is plain. */
const TONE: Readonly<Record<Tone | "stuck", "neutral" | "warning" | "success" | "danger">> = {
  stuck: "danger",
  you: "warning",
  done: "success",
  work: "neutral",
  wait: "neutral",
  off: "neutral",
};

type Props = {
  readonly view: ViewOutput;
  readonly human: HumanView;
  readonly seats: readonly Seat[];
  readonly theme: PluginTheme;
};

/** Where a project's team stands, as a tag on its line and at the head of its page. */
export function StandingTag({ view, human, seats, theme }: Props) {
  const { tone, says } = standingOf(human, view.stuck.length, seats, view.landed);
  return <Tag label={says} tone={TONE[tone]} theme={theme} />;
}
