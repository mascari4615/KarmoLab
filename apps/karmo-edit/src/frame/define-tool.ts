/**
 * 도구 틀. 모든 파일 도구의 흐름 하나
 * 받기 -> 미리보기와 설정 -> 실행 -> 결과와 저장 -> 이어서
 *
 * 파일 전에는 받는 칸만, 저장은 결과가 나온 뒤만. 도구 파일에는 처리와 설정만
 * 이름, 설명, 아이콘의 정본은 src/tool-meta.ts
 */
import { download } from '@lab/widgets/tools/shared/media';
import { statusLine, type SayKind } from '@lab/widgets/tools/shared/say';
import { wireDrop } from '@lab/widgets/tools/shared/drop-well';
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { loadNamespace } from '@lab/lib/i18n';

export type Say = (msg: string, kind?: SayKind) => void;

export interface ToolResult {
  /** 함수면 저장을 누를 때 만듦. 여러 장 ZIP */
  blob: Blob | (() => Promise<Blob>);
  /** 함수면 저장을 누를 때 정함. 설정에 따라 형식이 갈리는 도구 */
  name: string | (() => string);
  /** 저장 뒤 상태 줄 문구 */
  savedMessage?: string;
}

export interface ToolContext {
  root: HTMLElement;
  $: <T extends HTMLElement>(selector: string) => T;
  say: Say;
  /** 받은 것 전부 비우고 받는 칸만 남김 */
  reset: () => void;
  /** 실행 버튼 밖에서 나온 결과. null 이면 결과 칸을 닫음 */
  publish: (result: ToolResult | null) => void;
  /** 파일 없이 설정 칸을 엶. 글 붙여넣기처럼 받는 길이 둘인 도구 */
  open: () => void;
}

export interface ToolHandlers {
  /** 파일 해독. false 면 설정과 실행을 안 보임 */
  load: (files: File[]) => Promise<boolean>;
  /** 실행. 결과가 없으면 저장을 안 보임. live 도구는 생략 */
  run?: () => Promise<ToolResult | null>;
  /** 설정 칸이 보인 직후. 칸 폭을 재는 그리기 자리 */
  shown?: () => void;
  /** 실행 중 취소 */
  stop?: () => void;
}

export interface ExtraTab {
  id: string;
  label: () => string;
  build: (container: HTMLElement) => void;
}

export interface ToolDefinition {
  id: string;
  /** 번역 파일 이름 */
  namespace: string;
  tabLabel: () => string;
  ids: { drop: string; file: string; status: string; run?: string; save: string; stop?: string };
  accept: string;
  multiple?: boolean;
  /** 받을수록 쌓이는 도구. 같은 파일도 다시 받음 */
  accumulate?: boolean;
  /** 실행 버튼 없이 설정을 바꿀 때마다 결과가 나오는 도구 */
  live?: boolean;
  dropLabel: () => string;
  dropHint: () => string;
  runLabel?: () => string;
  saveLabel: () => string;
  stopLabel?: () => string;
  /** 받는 칸 옆 입력. 붙여넣기 글 */
  receive?: () => string;
  /** 미리보기와 설정 */
  body: () => string;
  /** 실행 옆 보조 버튼 */
  actions?: () => string;
  /** 결과 미리보기 */
  result: () => string;
  /** 저장 옆 보조 버튼 */
  resultActions?: () => string;
  /** 같은 도구의 다른 탭 */
  extraTabs?: ExtraTab[];
  setup: (ctx: ToolContext) => ToolHandlers;
}

const STYLE_ID = 'ke-frame-style';
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
.ke-frame{display:flex;flex-direction:column;gap:var(--space-lg)}
.ke-frame [hidden]{display:none!important}
.ke-drop-hint{display:block;margin-top:var(--space-xs);font-size:var(--font-size-3xs);color:var(--text-tertiary)}
.ke-frame .tool-status:empty{display:none}
.ke-section{display:flex;flex-direction:column;gap:var(--space-md)}
.ke-received>.tool-drop{padding:var(--space-sm) var(--space-md);font-size:var(--font-size-xs)}
.ke-received>.tool-drop .ke-drop-hint{display:none}
.ke-section>.tool-actions{position:sticky;bottom:0;z-index:2;padding:var(--space-sm) 0;background:var(--bg-primary)}
`;
  document.head.appendChild(el);
}

/** 등록과 흐름 배선. 도구 파일은 이 함수 하나만 호출 */
export function defineTool(def: ToolDefinition): void {
  Toolbox.register({
    id: def.id,
    tabs: [
      {
        id: 'app',
        label: def.tabLabel(),
        build(container: HTMLElement): void {
          void loadNamespace(def.namespace).then(() => mount(def, container));
        },
      },
      ...(def.extraTabs || []).map((tab) => ({
        id: tab.id,
        label: tab.label(),
        build(container: HTMLElement): void {
          void loadNamespace(def.namespace).then(() => {
            injectStyle();
            tab.build(container);
          });
        },
      })),
    ],
  } as unknown as Parameters<typeof Toolbox.register>[0]);
}

function mount(def: ToolDefinition, container: HTMLElement): void {
  injectStyle();
  const { ids } = def;
  const runRow = def.live
    ? ''
    : `<div class="tool-actions">
          <button class="btn btn-primary" id="${ids.run}" disabled>${esc(def.runLabel ? def.runLabel() : '')}</button>
          ${ids.stop ? `<button class="btn btn-ghost" id="${ids.stop}" hidden>${esc(def.stopLabel ? def.stopLabel() : '')}</button>` : ''}
          ${def.actions ? def.actions() : ''}
        </div>`;
  container.innerHTML = `
    <div class="ke-frame">
      <div class="tool-drop" id="${ids.drop}">
        <input type="file" id="${ids.file}" accept="${esc(def.accept)}"${def.multiple ? ' multiple' : ''} hidden>
        <span>${esc(def.dropLabel())}</span>
        <small class="ke-drop-hint">${esc(def.dropHint())}</small>
      </div>
      ${def.receive ? def.receive() : ''}
      <div class="tool-status" id="${ids.status}"></div>
      <div class="ke-section" data-ke="work" hidden>
        ${def.body()}
        ${runRow}
      </div>
      <div class="ke-section" data-ke="result" hidden>
        ${def.result()}
        <div class="tool-actions">
          <button class="btn btn-secondary" id="${ids.save}">${esc(def.saveLabel())}</button>
          ${def.resultActions ? def.resultActions() : ''}
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(selector: string): T => container.querySelector(selector) as T;
  const statusEl = $<HTMLElement>('#' + ids.status);
  const say = statusLine(statusEl);
  const work = $<HTMLElement>('[data-ke="work"]');
  const resultBox = $<HTMLElement>('[data-ke="result"]');
  const runBtn = ids.run ? $<HTMLButtonElement>('#' + ids.run) : null;
  const stopBtn = ids.stop ? $<HTMLButtonElement>('#' + ids.stop) : null;
  const saveBtn = $<HTMLButtonElement>('#' + ids.save);
  let current: ToolResult | null = null;
  const frame = $<HTMLElement>('.ke-frame');
  let held = '';
  let latest = 0;
  let loading: Promise<unknown> = Promise.resolve();

  const publish = (result: ToolResult | null): void => {
    current = result;
    resultBox.hidden = !result;
  };
  let handlers: ToolHandlers = { load: async () => false };
  const open = (): void => {
    if (!work.hidden) return;
    work.hidden = false;
    handlers.shown?.();
  };
  handlers = def.setup({
    root: container,
    $,
    say,
    publish,
    open,
    reset() {
      held = '';
      latest++;
      publish(null);
      work.hidden = true;
      if (runBtn) runBtn.disabled = true;
    },
  });

  // 묶음 전달과 결과 이어받기가 같은 파일을 두 번 보냄. 같은 파일은 한 번만 해독
  const receive = async (files: File[]): Promise<void> => {
    const key = files.map((f) => `${f.name}:${f.size}`).join('|');
    if (!def.accumulate && key === held) return;
    held = key;
    const ticket = ++latest;
    publish(null);
    if (runBtn) runBtn.disabled = true;
    // 해독은 한 번에 하나. 늦게 끝난 앞 파일이 뒤 파일과 조작값을 덮으면 안 됨
    const step = loading.then(async () => (ticket === latest || def.accumulate ? handlers.load(files) : false));
    loading = step.catch(() => false);
    const ok = await step;
    if (ticket !== latest) return;
    if (!ok) held = '';
    const wasHidden = work.hidden;
    work.hidden = !ok;
    frame.classList.toggle('ke-received', ok);
    if (runBtn) runBtn.disabled = !ok;
    if (ok && wasHidden) handlers.shown?.();
  };

  if (runBtn) {
    runBtn.onclick = async (): Promise<void> => {
      const ticket = latest;
      runBtn.disabled = true;
      publish(null);
      if (stopBtn) stopBtn.hidden = false;
      try {
        const result = (await handlers.run?.()) ?? null;
        if (ticket === latest) publish(result);
      } finally {
        if (stopBtn) stopBtn.hidden = true;
        if (ticket === latest) runBtn.disabled = false;
      }
    };
  }
  if (stopBtn) stopBtn.onclick = () => handlers.stop?.();

  saveBtn.onclick = async (): Promise<void> => {
    const item = current;
    if (!item) return;
    try {
      const blob = typeof item.blob === 'function' ? await item.blob() : item.blob;
      const name = typeof item.name === 'function' ? item.name() : item.name;
      download(blob, name);
      Toolbox.offerNext?.(statusEl, { blob, name, from: def.id });
      if (item.savedMessage) say(item.savedMessage, 'ok');
    } catch (err) {
      say((err as Error).message, 'error');
    }
  };

  // 입구 안에서는 입구가 든 파일을 넘김. 앞 작업 결과까지 받으면 파일이 중간에 바뀜
  if (!container.closest('#pfHost')) Toolbox.onHandoff?.(def.id, (file: File) => void receive([file]));
  wireDrop({
    drop: $<HTMLElement>('#' + ids.drop),
    input: $<HTMLInputElement>('#' + ids.file),
    scope: container,
    onFiles: (files) => void receive(files),
  });
}
