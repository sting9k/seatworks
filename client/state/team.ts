import type { HumanView } from "../../shared/contracts/rpc.ts";

/** What a line is doing, by shape and never by colour alone: `you` waits on the Human, `wait` on someone else. */
export type Tone = "you" | "work" | "wait" | "done" | "off";

/** One seat of the team as a line: how deep it sits, what it is for, and one word for what it is doing now. */
export type Seat = {
  readonly scope: string;
  readonly depth: number;
  /** Its goal; none before one is set. */
  readonly title: string | null;
  readonly owner: string | null;
  readonly tone: Tone;
  readonly says: string;
};

type Under = HumanView["scopes"][number];

/** How many things wait on the Human in a project. */
export const waitingOf = (human: HumanView): number =>
  human.questions.length + human.permissions.length + human.attentions.length + human.claims.length;

function standing(scope: Under, asking: boolean, running: boolean): readonly [Tone, string] {
  if (scope.status === "integrated") return ["done", "landed"];
  if (scope.status === "dropped") return ["off", "dropped"];
  if (asking) return ["you", "needs you"];
  if (scope.held) return ["wait", "held"];
  if (scope.status === "handed back") return ["wait", "handed back"];
  if (scope.status === "integrating") return ["work", "landing"];
  if (scope.owner === null) return ["wait", "nobody seated"];
  return running ? ["work", "working"] : ["wait", "idle"];
}

/** The team as lines, the root first; `running` is the actors whose agents Paseo says are in a turn. */
export function seatsOf(human: HumanView, running: ReadonlySet<string>): Seat[] {
  const asking = new Set(
    [...human.questions, ...human.permissions, ...human.attentions, ...human.claims].map((waits) => waits.scope),
  );
  const depths = new Map<string, number>();
  return human.scopes.map((scope) => {
    const depth = scope.parent === null ? 0 : (depths.get(scope.parent) ?? 0) + 1;
    depths.set(scope.scope, depth);
    const [tone, says] = standing(scope, asking.has(scope.scope), scope.owner !== null && running.has(scope.owner));
    return { scope: scope.scope, depth, title: scope.goal, owner: scope.owner, tone, says };
  });
}

/** How many seats are working and how many wait: two of the marks the pill's popover counts. */
export function countsOf(seats: readonly Seat[]): { working: number; waiting: number } {
  const count = (...tones: Tone[]) => seats.filter((seat) => tones.includes(seat.tone)).length;
  return { working: count("work"), waiting: count("wait", "you") };
}

/** What the pill says of a team, the most pressing first: stuck, the Human's turn, held, who works, all landed. */
export function pillOf(
  human: HumanView,
  stuck: number,
  seats: readonly Seat[],
  /** How many scopes the record holds as taken in. */
  landed: number,
): { tone: Tone | "stuck"; label: string } {
  if (stuck > 0) return { tone: "stuck", label: `${stuck} stuck` };
  const waiting = waitingOf(human);
  if (waiting > 0) return { tone: "you", label: `${waiting} need${waiting === 1 ? "s" : ""} you` };
  if (human.scopes.some((scope) => scope.parent === null && scope.held)) return { tone: "wait", label: "Team · held" };
  const { working } = countsOf(seats);
  if (working > 0) return { tone: "work", label: `Team · ${working} working` };
  const ended = (status: string) => status === "integrated" || status === "dropped";
  const toLand = human.scopes.some((scope) => scope.parent !== null && scope.kind === "work" && !ended(scope.status));
  return landed > 0 && !toLand ? { tone: "done", label: "Team · all landed" } : { tone: "wait", label: "Team · idle" };
}
