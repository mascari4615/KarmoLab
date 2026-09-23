/**
 * blog.mascari4615.com/about/ 전용 번들 (2026-09-23 사용자 결정 "About 페이지 블로그로")
 *
 * KarmoLab 셸 없이 소개 한 장. 화면은 셸 위젯과 같은 `renderAbout`
 * 부르는 곳이 정적 생성기 (`gen-post-pages.mjs`) 라 build.mjs 에 손으로 등록
 */
import {renderAbout} from './widgets/about/render';
import {aboutStyles} from './widgets/about/styles';

const style = document.createElement('style');
style.id = 'about-css';
style.textContent = aboutStyles;
document.head.append(style);

const mount = document.getElementById('about-root');
if (mount) void renderAbout(mount, new AbortController().signal);

export {};
