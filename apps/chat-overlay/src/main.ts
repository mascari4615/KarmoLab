import { listen } from "@tauri-apps/api/event";
import { chatFeedKindFromEnv, createChatFeed } from "./chat/createChatFeed";
import type { ChatLine } from "./chat/types";
import { initThemeEditor } from "./themeEditor";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { historyLines, readingDuration } from "./advisorChat";

const advisorMode = import.meta.env.VITE_ADVISOR_MODE === "1";
const MAX_LINES = advisorMode ? 500 : 40;
const advisorLines = new Map<string, ChatLine>();
document.body.classList.toggle("advisor-mode", advisorMode);
document.body.classList.toggle("chat-idle", advisorMode);
let advisorHideTimer: ReturnType<typeof setTimeout> | undefined;
let advisorVisibleMs = 12_000;

function revealAdvisorChat(): void {
  if (!advisorMode) return;
  clearTimeout(advisorHideTimer);
  document.body.classList.remove("chat-idle");
  if (document.body.classList.contains("layout-edit") || document.body.classList.contains("question-open")) return;
  advisorHideTimer = setTimeout(() => {
    document.body.classList.add("chat-idle");
  }, advisorVisibleMs);
}

function authorHue(author: string): number {
  let h = 0;
  for (let i = 0; i < author.length; i += 1) {
    h = (h * 31 + author.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function appendLine(container: HTMLElement, line: ChatLine, announce = true): void {
  if (advisorMode) {
    if (advisorLines.has(line.id)) return;
    advisorLines.set(line.id, line);
  }
  const readingOlder = advisorMode && document.body.classList.contains("question-open") &&
    container.scrollHeight - container.scrollTop - container.clientHeight > 24;
  if (announce) {
    advisorVisibleMs = readingDuration(line.text);
    revealAdvisorChat();
  }
  const row = el("div", "line line--enter");
  row.dataset.id = line.id;
  row.style.setProperty("--author-hue", String(authorHue(line.author)));
  const author = el("span", "author", line.author);
  const text = el("span", "text", line.text);
  if (advisorMode) {
    const clock = new Date(line.ts).toLocaleTimeString("en-GB", { hour12: false });
    author.textContent = line.author === "나" ? `나 ${clock}` : clock;
  }
  row.appendChild(author);
  row.appendChild(text);
  container.appendChild(row);
  while (container.children.length > MAX_LINES) {
    const first = container.firstElementChild as HTMLElement;
    advisorLines.delete(first.dataset.id ?? "");
    container.removeChild(container.firstChild!);
  }
  if (!announce) {
    row.classList.add("line--visible");
    return;
  }
  requestAnimationFrame(() => {
    row.classList.add("line--visible");
    if (advisorMode && !readingOlder) container.scrollTop = row.offsetTop - container.offsetTop - 12;
  });
}

const log = document.getElementById("log");
if (!log) {
  throw new Error("#log not found");
}

initThemeEditor();

async function reloadHistory(scrollToLatest: boolean): Promise<void> {
  if (!advisorMode) return;
  try {
    const records = await invoke<Parameters<typeof historyLines>[0]>("load_advisor_history");
    const merged = new Map(historyLines(records).map((line) => [line.id, line]));
    for (const line of advisorLines.values()) merged.set(line.id, line);
    const lines = [...merged.values()].sort((a, b) => a.ts - b.ts).slice(-MAX_LINES);
    advisorLines.clear();
    log!.replaceChildren();
    for (const line of lines) appendLine(log!, line, false);
    if (lines.length) advisorVisibleMs = readingDuration(lines[lines.length - 1].text);
    if (scrollToLatest) requestAnimationFrame(() => { log!.scrollTop = log!.scrollHeight; });
  } catch (error) {
    console.error("[chat-overlay] history:", error);
  }
}
void reloadHistory(false);

/** 짧은 시간에 같은 닉+본문이 연달아 오면 한 줄만 (확장 중복 전송 완화) */
let lastIngestDup: { key: string; at: number } | null = null;
const INGEST_DEDUP_MS = 120;

/** KarmoDevExtension 등 → Tauri `POST /ingest` → `extension-ingest` */
void listen<{ id?: string; author: string; text: string; ts: number }>("extension-ingest", (event) => {
  const p = event.payload;
  const key = `${p.author}\u0000${p.text}`;
  const now = Date.now();
  if (
    lastIngestDup &&
    lastIngestDup.key === key &&
    now - lastIngestDup.at < INGEST_DEDUP_MS
  ) {
    return;
  }
  lastIngestDup = { key, at: now };
  appendLine(log, {
    id: p.id || `ext-${p.ts}-${Math.random().toString(36).slice(2, 10)}`,
    author: p.author,
    text: p.text,
    ts: p.ts
  });
}).catch(() => {
  /* Vite 미리보기 등 Tauri 없음 */
});

const moveHandle = document.querySelector<HTMLButtonElement>(".move-handle");
const resizeHandle = document.querySelector<HTMLButtonElement>(".resize-handle");

const appWindow = getCurrentWindow();
if (advisorMode) {
  void appWindow.onFocusChanged((event) => {
    if (event.payload) revealAdvisorChat();
  }).catch((error) => console.error("[chat-overlay] focus listener:", error));
}

void listen<{ visible: boolean }>("layout-edit", (e) => {
  document.body.classList.toggle("layout-edit", e.payload.visible);
  revealAdvisorChat();
  if (e.payload.visible) void reloadHistory(true);
}).catch(() => {
  /* Tauri 밖 미리보기 */
});

if (moveHandle) {
  moveHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    void appWindow.startDragging().catch((err) => {
      console.error("[chat-overlay] startDragging 실패:", err);
    });
  });
}

if (resizeHandle) {
  resizeHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    void appWindow.startResizeDragging("SouthEast").catch((err) => {
      console.error("[chat-overlay] startResizeDragging 실패:", err);
    });
  });
}

const feed = createChatFeed(chatFeedKindFromEnv());
const unsub = feed.subscribe((line) => {
  appendLine(log, line);
});

window.addEventListener("beforeunload", () => {
  unsub();
  feed.destroy?.();
});

if (advisorMode) {
  const form = document.querySelector<HTMLFormElement>("#question-form")!;
  const input = document.querySelector<HTMLInputElement>("#question-input")!;
  const status = document.querySelector<HTMLElement>("#question-status")!;
  const button = form.querySelector<HTMLButtonElement>("button")!;
  try { input.value = localStorage.getItem("advisor-question-draft") ?? ""; } catch { /* Storage unavailable */ }
  input.addEventListener("input", () => {
    try { localStorage.setItem("advisor-question-draft", input.value); } catch { /* Storage unavailable */ }
  });
  const hideQuestion = () => {
    form.hidden = true;
    document.body.classList.remove("question-open");
    revealAdvisorChat();
    input.blur();
    void invoke("close_question").catch((error) => {
      console.error("[chat-overlay] restore mouse pass-through:", error);
    });
  };
  void listen("question-focus", () => {
    form.hidden = false;
    document.body.classList.add("question-open");
    revealAdvisorChat();
    void reloadHistory(true);
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideQuestion();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value.trim() || button.disabled) return;
    button.disabled = true;
    button.textContent = "캡처 중";
    const text = input.value.trim();
    try {
      const saved = await invoke<{ id: string; ts: number }>("submit_question", { text });
      appendLine(log, { id: `question-${saved.id}`, author: "나", text, ts: saved.ts });
      input.value = "";
      try { localStorage.removeItem("advisor-question-draft"); } catch { /* Storage unavailable */ }
      status.textContent = "전송됨. 보좌관 답변 대기 중";
      hideQuestion();
    } catch (error) {
      status.hidden = false;
      status.textContent = `전송 실패: ${String(error)}`;
    } finally {
      button.disabled = false;
      button.textContent = "보내기";
    }
  });
}
