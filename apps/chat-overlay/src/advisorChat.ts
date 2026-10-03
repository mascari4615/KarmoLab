import type { ChatLine } from "./chat/types";

export function readingDuration(text: string): number {
  return Math.min(45_000, Math.max(12_000, 4_000 + Array.from(text).length * 90));
}

export function historyLines(records: Array<{ source: string; record: Record<string, unknown> }>): ChatLine[] {
  const lines: ChatLine[] = [];
  for (const { source, record: r } of records) {
    let text: unknown;
    let ts: number;
    let id: string;
    let author = "보좌관";
    if (source === "question") {
      if (r.kind === "verification") continue;
      text = r.text || (r.kind === "screen" ? "화면 전달" : "");
      ts = Number(r.ts);
      id = `question-${r.id ?? r.ts}`;
      author = "나";
    } else if (source === "answer") {
      if (r.kind === "verification" || r.displayed === false || String(r.request_id).startsWith("verify-")) continue;
      text = r.display_text || r.answer;
      ts = Number(r.at) * 1000;
      id = `answer-${r.request_id}`;
    } else {
      text = r.display_text || r.text;
      ts = Date.parse(String(r.at));
      id = `advice-${r.at}`;
    }
    if (typeof text === "string" && text.trim() && Number.isFinite(ts)) {
      lines.push({ id, author, text, ts });
    }
  }
  return [...new Map(lines.map((line) => [line.id, line])).values()].sort((a, b) => a.ts - b.ts).slice(-500);
}
