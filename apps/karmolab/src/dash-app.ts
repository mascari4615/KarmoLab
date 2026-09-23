/**
 * dash.mascari4615.com 전용 front (memo change.site-split, 2026-09-22).
 *
 * KarmoLab 셸 (`toolbox.js`) 을 안 싣는다. 이 번들 하나에 대시보드 패널과 셸
 * 패널은 import 만으로 명부 (`window.KarmoDash`) 에 붙고, 마지막에 shell 이 그림
 * 로그인 전에는 shell 이 로그인 버튼 하나만 (다른 화면으로 갈 길 없음)
 */
import './widgets/mydash/home';
import './widgets/mydash/me';
import './widgets/mydash/ai-usage';
import './widgets/mydash/bookmarks';
import './widgets/mydash/pc-vitals';
import './widgets/mydash/career';
/* 플래너 (캘린더, 일기, 칸반, 연속일). 2026-09-23 lab 도구에서 옮겨 옴 */
import './widgets/planner/planner';
import './widgets/mydash/shell';
/* 메뉴 버튼이 여는 판. lab 과 같은 ESC 메뉴에 칸만 대시보드 방으로 (shell.ts setMenuCells) */
import './esc-menu';

const mount = document.getElementById('dash');
const api = (window as unknown as { KarmoDashShell?: { render: (el: HTMLElement) => void } }).KarmoDashShell;
if (mount && api) api.render(mount);
else if (mount) mount.textContent = '대시보드를 불러오지 못했습니다.';

export {};
