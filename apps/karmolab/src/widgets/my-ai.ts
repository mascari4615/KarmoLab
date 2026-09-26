/**
 * 내 AI. 구독 카드만 남긴 옛 주소.
 *
 * 하네스 표와 구독의 자리는 Dash AI 사용 방 (2026-09-26).
 * 이 도구는 옆줄과 창고에서 내림. 브라우저 할당량 스모크가 이 묶음을 싣는 자리.
 */
import { isDesktop, invoke } from '../tauri-bridge';
import { buildQuota } from '../lib/ai-quota';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
  'use strict';

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
    ]
  });
})();
