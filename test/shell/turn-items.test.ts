import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { turnOf } from "../../server/satellites/agent-host/items.ts";
import { INTO_TURN } from "../../shared/contracts/delivery.ts";

test("mail handed into a turn, which some agents show as their own words, is none of what the agent said", () => {
  const timeline = [
    { type: "user_message", text: "Go on.", clientMessageId: "1:deliver:m1" },
    { type: "assistant_message", text: "I will use the stand-in." },
    {
      type: "assistant_message",
      text: `${INTO_TURN} Nothing in it stops you.\n\nm2 from a2 · it directs\nUse the parser.`,
    },
    { type: "assistant_message", text: "Switching to the parser." },
  ] as unknown as AgentTimelineItem[];

  const turn = turnOf(timeline, 0, () => true);

  assert.deepEqual(
    turn.items.map((item) => item.text),
    ["I will use the stand-in.", "Switching to the parser."],
  );
  assert.equal(turn.seen, 4, "and it is still counted as read, so the next turn starts after it");
});
