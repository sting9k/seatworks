import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

/** One piece of an agent's turn, in words that name nothing of Paseo (WATCH.md, The eye). */
export type TurnItem = {
  readonly kind: "thought" | "said" | "ran" | "edit";
  readonly text: string;
  /** What a failed call said, first line; null when it did not fail. */
  readonly failed: string | null;
  /** The call and its failure with numbers and paths blurred, so one loop repeated reads as one signature. */
  readonly signature: string | null;
  readonly path: string | null;
};

export function turnItems(timeline: readonly AgentTimelineItem[]): TurnItem[] {
  const out: TurnItem[] = [];
  for (const item of timeline) {
    if (item.type === "reasoning")
      out.push({ kind: "thought", text: item.text, failed: null, signature: null, path: null });
    else if (item.type === "assistant_message")
      out.push({ kind: "said", text: item.text, failed: null, signature: null, path: null });
    else if (item.type === "tool_call") {
      const d = item.detail;
      if (d.type === "edit" || d.type === "write") {
        const text = d.type === "edit" ? (d.unifiedDiff ?? d.newString ?? "") : (d.content ?? "");
        out.push({ kind: "edit", text, failed: null, signature: null, path: d.filePath });
        continue;
      }
      const call = d.type === "shell" ? d.command : `${item.name} ${JSON.stringify(d).slice(0, 300)}`;
      const exit = d.type === "shell" ? (d.exitCode ?? 0) : 0;
      const failed =
        item.status === "failed"
          ? firstLine(typeof item.error === "string" ? item.error : JSON.stringify(item.error))
          : exit !== 0
            ? firstLine(lastLines(d.type === "shell" ? (d.output ?? "") : "") || `exit ${exit}`)
            : null;
      out.push({
        kind: "ran",
        text: call,
        failed,
        signature: failed === null ? null : blur(`${call} => ${failed}`),
        path: null,
      });
    }
  }
  return out;
}

function firstLine(text: string): string {
  return (text.split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 300);
}

function lastLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .slice(-3)
    .reverse()
    .join("\n");
}

/** Numbers, hex ids and temp paths vary between tries of one loop; blurring them lets the tries match. */
function blur(text: string): string {
  return text
    .replace(/\/tmp\/[^\s'"]+/g, "<tmp>")
    .replace(/\b[0-9a-f]{7,40}\b/g, "<id>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}
