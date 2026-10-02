import type { QuestionSpec, Route } from "../../../shared/contracts/reflex.ts";

/** A question in the System One body, as TypeSafe's SDK sends it. */
type Asked =
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };
export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
export type Asking =
  | { ok: true; model: string; answers: Record<string, Answer>; tokens: number }
  | { ok: false; why: "too large" | "broken" | "refused" | "unavailable"; says: string };

const TIMEOUT_MS = 15_000;
/** The longest wait a 429 may name before the one retry; past it the event goes unread. */
const MAX_WAIT_MS = 30_000;

/**
 * Asks Jev typed questions about one state, in one call (REFLEX.md, Running it). What looks like a secret is masked
 * before the text leaves; a state past the route's budget is not cut but refused; failures follow REFLEX.md's table.
 */
export class Jev {
  private readonly route: Route;
  private readonly key: string;
  private readonly mask: readonly RegExp[];
  private readonly fetcher: typeof fetch;

  constructor(route: Route, key: string, mask: readonly RegExp[], fetcher: typeof fetch = fetch) {
    this.route = route;
    this.key = key;
    this.mask = mask;
    this.fetcher = fetcher;
  }

  async ask(state: Record<string, string>, questions: Record<string, QuestionSpec>): Promise<Asking> {
    const masked = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, this.masked(v)]));
    const asked: Record<string, Asked> = {};
    for (const [name, q] of Object.entries(questions)) {
      if (q.noul)
        asked[name] = { type: "noul", instructions: q.noul, criteria: { true: q.yes ?? "yes", false: q.no ?? "no" } };
      else if (q.choice && q.labels) asked[name] = { type: "choice", instructions: q.choice, criteria: q.labels };
    }
    if (Object.keys(asked).length === 0) return { ok: false, why: "broken", says: "no question the reflex can ask" };
    const body = JSON.stringify({ ...this.route.body, model: this.route.model, state: masked, questions: asked });
    // About four characters a token: close enough to refuse a state that cannot fit, never to cut one that can.
    if (body.length / 4 > this.route.budget)
      return { ok: false, why: "too large", says: `about ${Math.round(body.length / 4)} tokens` };
    const first = await this.post(body);
    const answer =
      first.retryAfterMs === null ? first : await this.wait(first.retryAfterMs).then(() => this.post(body));
    if (!answer.ok) return answer.result;
    const parsed = answer.json as {
      model?: string;
      answers?: Record<string, Answer>;
      usage?: { input_tokens?: number };
    };
    const answers = parsed.answers ?? {};
    for (const name of Object.keys(asked))
      if (!answers[name]) return { ok: false, why: "broken", says: `no answer for ${name}` };
    return { ok: true, model: parsed.model ?? this.route.model, answers, tokens: parsed.usage?.input_tokens ?? 0 };
  }

  private masked(text: string): string {
    let out = text;
    for (const p of this.mask) out = out.replace(p, "[masked]");
    return out;
  }

  private async post(
    body: string,
  ): Promise<
    | { ok: true; json: unknown; retryAfterMs: null }
    | { ok: false; result: Asking & { ok: false }; retryAfterMs: number | null }
  > {
    let response: Response;
    try {
      response = await this.fetcher(this.route.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return {
        ok: false,
        result: { ok: false, why: "unavailable", says: error instanceof Error ? error.message : String(error) },
        retryAfterMs: 1000,
      };
    }
    if (response.ok) return { ok: true, json: await response.json(), retryAfterMs: null };
    const text = (await response.text()).slice(0, 500);
    if (response.status === 401 || response.status === 403)
      return {
        ok: false,
        result: { ok: false, why: "refused", says: `the key was refused (${response.status})` },
        retryAfterMs: null,
      };
    if (response.status === 400 && text.includes("max_tokens_exceeded"))
      return { ok: false, result: { ok: false, why: "too large", says: text }, retryAfterMs: null };
    if (response.status === 400 || response.status === 422)
      return { ok: false, result: { ok: false, why: "broken", says: text }, retryAfterMs: null };
    const named = Number(response.headers.get("retry-after"));
    return {
      ok: false,
      result: { ok: false, why: "unavailable", says: `${response.status} ${text}` },
      retryAfterMs: Number.isFinite(named) && named > 0 ? Math.min(named * 1000, MAX_WAIT_MS) : 1000,
    };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
