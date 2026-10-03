import { describe, expect, it } from "vitest";
import { historyLines, readingDuration } from "./advisorChat";

describe("advisor reading and history", () => {
  it("gives a long answer more reading time, within a fixed upper bound", () => {
    expect(readingDuration("짧은 조언")).toBe(12_000);
    expect(readingDuration("가".repeat(250))).toBeGreaterThan(20_000);
    expect(readingDuration("가".repeat(2000))).toBe(45_000);
  });
  it("restores the conversation in time order without automatic silent observations or tests", () => {
    const result = historyLines([
      { source: "answer", record: { request_id: "q", at: 3, answer: "답", display_text: "화면 12:00:00\n답" } },
      { source: "question", record: { id: "q", ts: 2000, text: "질문", kind: "question" } },
      { source: "answer", record: { request_id: "auto-1", at: 4, answer: "", displayed: false } },
      { source: "answer", record: { request_id: "verify-continuity-1", at: 1, answer: "준비됨" } },
      { source: "advice", record: { at: "2026-10-03T12:00:00+09:00", text: "수동 조언" } },
    ]);
    expect(result.map((line) => line.text)).toEqual(["질문", "화면 12:00:00\n답", "수동 조언"]);
    expect(result[0].author).toBe("나");
  });
});
