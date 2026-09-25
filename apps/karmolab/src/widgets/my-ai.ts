/**
 * 내 AI. 구독 살림 한 화면. TASK-KL-248.
 *
 * 남은 할당량, 개발 환경, 에이전트 운영, 공급자 연결을 한곳에 둔다. 그래서 화면은
 * 벤더 목록을 스스로 들고 있지 않고, 백엔드가 돌려주는 카드를 그대로 그린다 . 
 * 새 구독을 붙일 때 고칠 곳이 두 벌로 갈라지지 않게.
 *
 * 계약 하나: **신선도를 숨기지 않는다.** 라이브로 물어본 값과 로컬에 남은
 * 마지막 관측은 칩과 명도로 구분한다. 스냅샷을 라이브처럼 그리면 20% 남았네
 * 하고 들어갔다 벽 친다 (실제로 Codex 스냅샷 20% 옆에서 라이브는 96% 였다).
 *
 * 두 표면, 그리기는 하나. 데스크톱은 Tauri 백엔드(ai_quota)가 이 컴퓨터의 토큰과 로그를
 * 읽고, 브라우저(폰)는 노트북 laptop-ops `/ai-quota/api` 가 내주는 같은 모양의 카드를
 * 받음. 노트북은 켜져 있는 PC 가 밀어 둔 값을 `live:false` 와 출처 노트로 내줌.
 * 비밀번호 열쇠는 `laptop.pc.key`, 이 브라우저에만 보관.
 * 환경 탭은 로컬 파일 검사라 데스크톱에서만. 정본: memo/changes/ai-quota-phone.md
 */
import { isDesktop, invoke } from '../tauri-bridge';
import { buildQuota, ago } from '../lib/ai-quota';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  'use strict';

  type MyAiPanels = {
    claudeEnvironment?: (container: HTMLElement) => void;
  };

  type EnvironmentVendorState = {
    vendor: 'claude' | 'codex' | 'grok';
    status: 'applied' | 'partial' | 'missing' | 'unknown';
    reason: string;
    evidence: string[];
  };

  type EnvironmentFeature = {
    id: string;
    label: string;
    description: string;
    vendors: EnvironmentVendorState[];
  };

  type EnvironmentAudit = { checked_at: number; features: EnvironmentFeature[] };

  const panels = (): MyAiPanels =>
    (window as unknown as { MyAiPanels?: MyAiPanels }).MyAiPanels ?? {};

  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


  function buildEnvironment(container: HTMLElement): void {
    // 로컬 파일(지침, 훅, MCP) 검사라 이 컴퓨터의 데스크톱 앱에서만 유효
    if (!isDesktop()) {
      const note = document.createElement('p');
      note.className = 'myai-note';
      /* 이 탭이 먼저 열리면 (도구 장 `/t/my-ai/`) 번역 파일이 아직 없다. 기본 글로 먼저 그리고 오면 갈아 끼움.
         없는 열쇠로 터지면 셸이 도구를 통째로 죽은 것으로 그린다 (2026-09-22 `test:widgets-alive` 실측) */
      const fallback = '환경 검사는 이 컴퓨터의 파일을 읽는 일이라 데스크톱 앱에서만 된다.';
      note.textContent = t('my-ai.env.desktop_only', undefined, fallback);
      void loadNamespace('my-ai').then(() => { note.textContent = t('my-ai.env.desktop_only', undefined, fallback); });
      container.appendChild(note);
      return;
    }
    Mdd.injectCSS('my-ai-environment', `
      .myai-environment-audit { margin-bottom: 28px; }
      .myai-env-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:12px; }
      .myai-env-head h3, .myai-connections h3 { margin:0 0 5px; }
      .myai-env-head p { margin:0; color:var(--text-secondary); font-size:var(--font-size-sm); }
      .myai-env-head > span { color:var(--text-tertiary); font-size:var(--font-size-xs); white-space:nowrap; }
      .myai-env-scroll { overflow-x:auto; }
      .myai-env-table { width:100%; border-collapse:collapse; min-width:680px; }
      .myai-env-table th, .myai-env-table td { padding:11px 12px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      .myai-env-table thead th { color:var(--text-secondary); font-size:var(--font-size-xs); }
      .myai-env-table tbody th { width:24%; }
      .myai-env-table strong, .myai-env-table small { display:block; }
      .myai-env-table small { margin-top:4px; color:var(--text-tertiary); font-size:var(--font-size-2xs); line-height:1.35; }
      .myai-env-state { display:inline-block; border:1px solid var(--border); border-radius:var(--radius-pill); padding:2px 7px; font-size:var(--font-size-2xs); }
      .myai-env-state--applied { color:var(--success); border-color:var(--success); }
      .myai-env-state--partial { color:var(--warning); border-color:var(--warning); }
      .myai-env-state--missing { color:var(--error); border-color:var(--error); }
      .myai-environment-controls { border-top:1px solid var(--border); padding-top:24px; }
      .myai-connection-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin:16px 0; }
      .myai-connection-card { border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; background:var(--bg-tertiary); }
      .myai-connection-card strong, .myai-connection-card small { display:block; }
      .myai-connection-card small { color:var(--text-tertiary); margin-top:5px; }
    `);
    const audit = document.createElement('section');
    audit.className = 'myai-environment-audit';
    audit.textContent = t('my-ai.environment_loading', undefined, '환경을 검사하는 중...');
    const controls = document.createElement('section');
    controls.className = 'myai-environment-controls';
    container.append(audit, controls);

    void invoke<EnvironmentAudit>('ai_environment_audit')
      .then((result) => {
        const vendors = ['claude', 'codex', 'grok'] as const;
        const statusLabel = (status: EnvironmentVendorState['status']): string => {
          if (status === 'applied') return t('my-ai.status.applied', undefined, '적용');
          if (status === 'partial') return t('my-ai.status.partial', undefined, '일부');
          if (status === 'missing') return t('my-ai.status.missing', undefined, '미적용');
          return t('my-ai.status.unknown', undefined, '확인 필요');
        };
        const rows = result.features.map((feature) => {
          const cells = vendors.map((vendor) => {
            const found = feature.vendors.find((item) => item.vendor === vendor);
            if (!found) return '<td>. </td>';
            const evidence = found.evidence.map(esc).join('\n');
            return `<td>
              <span class="myai-env-state myai-env-state--${found.status}">${esc(statusLabel(found.status))}</span>
              <small title="${evidence}">${esc(found.reason)}</small>
            </td>`;
          }).join('');
          return `<tr><th scope="row"><strong>${esc(feature.label)}</strong><small>${esc(feature.description)}</small></th>${cells}</tr>`;
        }).join('');
        audit.innerHTML = `
          <div class="myai-env-head">
            <div><h3>${esc(t('my-ai.environment_title', undefined, 'AI 개발환경'))}</h3>
            <p>${esc(t('my-ai.environment_desc', undefined, '제품 지원과 로컬 배선을 구분해 검사한 결과다. 계정, 클라우드에서만 알 수 있는 값은 확인 필요로 남긴다. 상태에 마우스를 올리면 근거 경로를 볼 수 있다.'))}</p></div>
            <span>${esc(ago(result.checked_at))}</span>
          </div>
          <div class="myai-env-scroll"><table class="myai-env-table">
            <thead><tr><th>${esc(t('my-ai.environment_feature', undefined, '기능'))}</th><th>Claude</th><th>Codex</th><th>Grok</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      })
      .catch((error: unknown) => {
        audit.textContent = error instanceof Error ? error.message : String(error);
      });

    void loadNamespace('claude-env').then(() => {
      const render = panels().claudeEnvironment;
      if (!render) {
        controls.textContent = t('my-ai.panel_missing', undefined, '환경 설정 패널을 불러오지 못했다.');
        return;
      }
      render(controls);
    });
  }

  function buildConnections(container: HTMLElement): void {
    container.textContent = t('my-ai.loading_connections', undefined, '공급자 연결을 읽는 중...');
    void Promise.all([
      Toolbox.ensureScript?.('root/gemini') ?? Promise.resolve(),
      loadNamespace('gemini')
    ]).then(() => {
      if (typeof Gemini === 'undefined') {
        container.textContent = t('my-ai.connections_unavailable', undefined, '공급자 연결 설정을 불러오지 못했다.');
        return;
      }
      const geminiReady = Boolean(Gemini.getApiKey());
      const vertexReady = Boolean(Gemini.getVertexApiKey());
      const state = (ready: boolean): string => ready
        ? t('my-ai.connection.ready', undefined, '연결됨')
        : t('my-ai.connection.missing', undefined, '설정 필요');
      container.innerHTML = `
        <section class="myai-connections">
          <h3>${esc(t('my-ai.connections_title', undefined, '공유 AI 연결 상태'))}</h3>
          <p class="myai-note">${esc(t('my-ai.connections_desc', undefined, '여러 위젯이 함께 쓰는 API 키는 환경 설정에서 관리한다. 여기서는 연결 여부만 보여준다.'))}</p>
          <div class="myai-connection-grid">
            <div class="myai-connection-card"><strong>Gemini AI Studio</strong><span class="myai-env-state myai-env-state--${geminiReady ? 'applied' : 'missing'}">${esc(state(geminiReady))}</span><small>${esc(t('my-ai.connection.gemini_consumers', undefined, '채팅, 텍스트, 이미지 기능에서 공유'))}</small></div>
            <div class="myai-connection-card"><strong>Google Vertex AI</strong><span class="myai-env-state myai-env-state--${vertexReady ? 'applied' : 'missing'}">${esc(state(vertexReady))}</span><small>${esc(t('my-ai.connection.vertex_consumers', undefined, 'Vertex 텍스트, 이미지 기능에서 공유'))}</small></div>
          </div>
          <button type="button" class="btn btn-primary" data-open-api-settings>${esc(t('my-ai.connection.manage', undefined, '환경 설정에서 API 관리'))}</button>
        </section>`;
      container.querySelector<HTMLButtonElement>('[data-open-api-settings]')?.addEventListener('click', () => {
        Toolbox.switchPage('settings');
        window.setTimeout(() => { Toolbox.switchTab?.('settings-display'); }, 150);
      });
    }).catch((error: unknown) => {
      container.textContent = error instanceof Error ? error.message : String(error);
    });
  }

  Toolbox.register({
    id: 'my-ai',
    title: t('widgets.my-ai.title', undefined, '내 AI'),
    category: 'ai',
    desc: t('widgets-desc.my-ai.desc', undefined, '내가 쓰는 AI의 구독, 환경, 연결 상태를 한곳에서'),
    layout: 'form',
    icon: '<path d="M4 19a8 8 0 1116 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 19l4.5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    tabs: [
      {
        id: 'quota-main',
        label: t('my-ai.tab.panel', undefined, '현황'),
        build: function (container: HTMLElement): void {
          void loadNamespace('my-ai').then(function () {
            buildQuota(container, (fn) => Toolbox.onDispose?.(fn), isDesktop() ? { invoke } : undefined);
          });
        }
      },
      {
        id: 'my-ai-environment',
        label: t('my-ai.tab.environment', undefined, '환경'),
        build: buildEnvironment
      },
      {
        id: 'my-ai-connections',
        label: t('my-ai.tab.connections', undefined, '연결'),
        build: buildConnections
      }
    ]
  });
})();
