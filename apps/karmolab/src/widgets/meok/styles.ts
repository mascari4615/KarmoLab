/**
 * 먹의 생김새. 한 벌뿐이라 문서에 한 번만.
 *
 * 왜 갈랐나: `meok.ts` 1,700 줄 중 100 줄이 CSS 문자열. 배선을 읽을 때마다 지나쳐야 하는
 * 덩이였고, 여기 옮겨도 부르는 쪽은 한 줄.
 */
export function injectStyles(): void {
  if (document.getElementById('meok-style')) return;
  const style = document.createElement('style');
  style.id = 'meok-style';
  style.textContent = [
    /* 높이는 **부모가 준 자리**로만. `height:100%` 금지. 부모 높이가 확정이 아닌 자리에서 auto 로
       떨어지고, 자식이 부모를 다시 정하는 순환에 화면이 굳는다 (2026-08-29 실측: 탭 두 개 응답 상실).
       옛 값 min(78vh,820px) 은 1440p 에서 상한에 걸려 화면 절반만 씀. 안 늘어나는 자리는 min-height 가 받음. */
    '.meok{--meok-gap:8px;display:flex;flex-direction:column;flex:1 1 auto;min-height:min(62vh,420px);background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;font-size:var(--font-size-2xs)}',
    '.meok-host{display:flex;flex-direction:column;flex:1;min-height:0}',
    /* 먹 탭에서만 도는 사슬. 셸에서 그림판까지 세로를 흘려 보낸다. 클래스는 탭을 떠날 때 뗀다. */
    '.tool-page.meok-page{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-width:none}',
    '.meok-page .tab-panel.active{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
    '.meok-page .pf-body{flex:1 1 auto;min-height:0;align-items:stretch}',
    '.meok-page .pf-right{display:flex;flex-direction:column;min-height:0}',
    '.meok-page .pf-mount{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
    /* 묶음 머리말은 그림 그리는 동안 자리만 먹는다 (실측 109px). 도구 사이를 오가는 `pf-head` 는 남긴다. */
    '.meok-page > .tool-page-hero{display:none}',
    /* 데스크톱 앱에서만. 상세 장의 머리(길 28px, 번호 제목 129px)와 아래 상세 글(1568px)을 걷고
       그림판이 창 높이를 다 쓴다. 위 여백 40px 는 상단 막대 자리라 둔다. 상세 글 때문에 칸이 세로로 굴렀다 (2026-09-25 실측 1600x900, 굴림 2437/900).
       웹은 tools.css 의 상세 장 규칙(76vh, 아래 글)을 그대로 둔다. 선택자가 길어진 것은 그 규칙보다 세야 해서 */
    'body.tool-detail .main-content:has(.tool-page.layout-full.meok-app.active) > :is(.tool-crumb,.tool-page-hero,.tool-seo){display:none}',
    'body.tool-detail .main-content:has(.tool-page.layout-full.meok-app.active){overflow:hidden}',
    'body.tool-detail .content-body:has(.tool-page.layout-full.meok-app.active){flex:1 1 auto;min-height:0}',
    'body.tool-detail .tool-page.layout-full.meok-app.active{height:auto;min-height:0;flex:1 1 auto}',
    '.meok-app .meok{border:0;border-radius:0}',
    /* 사진 놓는 자리도 접는다 (실측 106px). 먹에는 열기와 붙이기 버튼이 자기 머리줄에 있다. */
    '.meok-page .pf-drop{display:none}',
    '.meok:fullscreen{width:100vw;height:100vh;min-height:0;border:0;border-radius:0}',
    '.meok *{box-sizing:border-box}',
    '.meok button{border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);border-radius:var(--radius-md);padding:5px 8px;cursor:pointer;font-size:var(--font-size-2xs)}',
    '.meok button:hover{border-color:var(--accent)}',
    '.meok button.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,transparent)}',
    '.meok-bar{display:flex;align-items:center;gap:6px;padding:4px 10px;background:var(--bg-secondary);border-bottom:1px solid var(--border);position:relative;z-index:20}',
    '.meok-logo{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--text-primary);color:var(--bg-primary);font-size:var(--font-size-2xs);font-weight:700;flex:0 0 auto}',
    '.meok-name{margin-left:auto;flex:0 1 180px;min-width:90px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:5px 7px}',
    '.meok-status{color:var(--text-tertiary);font-size:var(--font-size-3xs);min-width:48px}',
    /* 윗메뉴. 제목은 테두리 없는 글자, 펼친 목록은 제목 아래 띄움 */
    '.meok-menubar{display:flex;align-items:center;gap:2px}',
    '.meok-menu{position:relative}',
    '.meok .meok-menu-title{border:0;background:none;padding:6px 10px;min-height:28px;border-radius:var(--radius-sm);font-size:var(--font-size-xs)}',
    '.meok .meok-menu-title:hover,.meok .meok-menu-title[aria-expanded="true"]{background:color-mix(in srgb,var(--accent) 16%,transparent);border:0}',
    '.meok-menu-list{position:absolute;left:0;top:calc(100% + 2px);min-width:220px;padding:4px;display:flex;flex-direction:column;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-float);z-index:30}',
    '.meok-menu-list[hidden]{display:none}',
    '.meok .meok-menu-item{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;min-height:28px;padding:5px 10px;border:0;background:none;text-align:left;border-radius:var(--radius-sm);font-size:var(--font-size-xs)}',
    '.meok .meok-menu-item:hover:not(:disabled),.meok .meok-menu-item:focus-visible{background:color-mix(in srgb,var(--accent) 22%,transparent);border:0;outline:none}',
    '.meok .meok-menu-item:disabled{opacity:.4;cursor:default}',
    '.meok-menu-item kbd{font-family:inherit;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
    '.meok-menu-sep{border:0;border-top:1px solid var(--border);margin:4px 2px}',
    '.meok-menu-head{padding:4px 10px 2px;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
    /* C2 배치 (memo change.meok-app). 도구 | 왼쪽 칸 | 경계 | 굵기 막대 | 캔버스 | 경계 | 오른쪽 칸. 아래 경계와 타임라인은 굵기 막대부터 캔버스까지 */
    '.meok-body{flex:1;display:grid;grid-template-columns:56px var(--meok-dl,0px) 4px 34px minmax(0,1fr) 4px var(--meok-dr,272px);grid-template-rows:minmax(0,1fr) 4px var(--meok-tb,150px);min-height:0}',
    '.meok-tools{grid-column:1;grid-row:1/4}',
    '.meok-dock[data-dock="left"]{grid-column:2;grid-row:1/4;border-right:1px solid var(--border)}',
    '.meok-split[data-split="left"]{grid-column:3;grid-row:1/4}',
    '.meok-body:not(.meok-has-left) .meok-split[data-split="left"]{display:none}',
    '.meok-body:not(.meok-has-left) .meok-dock[data-dock="left"]{border:0}',
    '.meok-sizebar{grid-column:4;grid-row:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;background:var(--bg-secondary);border-right:1px solid var(--border);color:var(--text-tertiary);font-size:var(--font-size-3xs)}',
    '.meok-sizebar b{font-weight:500;color:var(--text-secondary)}',
    '.meok-sizebar input{flex:1;min-height:0;writing-mode:vertical-lr;direction:rtl;width:24px;margin:0}',
    '.meok-stage{grid-column:5;grid-row:1;position:relative}',
    '.meok-zoombar{position:absolute;right:10px;bottom:10px;display:flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;background:color-mix(in srgb,var(--bg-secondary) 88%,transparent);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-tertiary);font-size:var(--font-size-3xs)}',
    '.meok-split[data-split="right"]{grid-column:6;grid-row:1/4}',
    '.meok-dock[data-dock="right"]{grid-column:7;grid-row:1/4;border-left:1px solid var(--border)}',
    '.meok-split-h{grid-column:4/6;grid-row:2}',
    '.meok-timeline{grid-column:4/6;grid-row:3;display:grid;grid-template-columns:minmax(180px,34%) minmax(0,1fr);min-height:0;border-top:1px solid var(--border);background:var(--bg-secondary)}',
    '.meok-split{background:var(--bg-secondary);cursor:col-resize;touch-action:none}',
    '.meok-split-h{cursor:row-resize}',
    '.meok-split:hover,.meok-split:focus-visible{background:color-mix(in srgb,var(--accent) 45%,transparent);outline:none}',
    /* 도킹 칸과 패널. 패널 머리를 끌어 칸 사이로 옮김 (dock.ts) */
    '.meok-dock{display:flex;flex-direction:column;min-width:0;min-height:0;overflow-y:auto;background:var(--bg-secondary)}',
    '.meok-docking .meok-dock{outline:1px dashed color-mix(in srgb,var(--accent) 60%,transparent);outline-offset:-3px}',
    '.meok-panel{border-bottom:1px solid var(--border)}',
    '.meok-panel>summary{display:flex;align-items:center;gap:6px;min-height:28px;padding:4px 10px;cursor:grab;user-select:none;font-size:var(--font-size-3xs);font-weight:700;letter-spacing:.06em;color:var(--text-secondary);background:color-mix(in srgb,var(--bg-tertiary) 55%,transparent)}',
    '.meok-panel>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
    '.meok-panel>summary::-webkit-details-marker{display:none}',
    '.meok-panel>summary::after{content:"";margin-left:auto;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.7}',
    '.meok-panel[open]>summary::after{transform:rotate(45deg) translate(-2px,-2px)}',
    '.meok-panel>:not(summary){padding:8px 10px}',
    '.meok-panel-body{display:flex;flex-direction:column;gap:6px}',
    '.meok-panel-body>label{display:flex;align-items:center;gap:6px;color:var(--text-secondary)}',
    '.meok-panel-body>label input[type=range]{flex:1;min-width:0}',
    '.meok-panel-body>label b{min-width:30px;text-align:right;color:var(--text-tertiary);font-weight:500}',
    '.meok-panel input[type=color]{width:100%;height:44px;padding:0;border:1px solid var(--border);border-radius:var(--radius-md);background:none}',
    '.meok-panel-moving{opacity:.45}',
    '.meok-drop-mark{height:3px;margin:0 6px;border-radius:var(--radius-sm);background:var(--accent)}',
    '.meok-fix label{display:flex;align-items:center;gap:6px;margin:4px 0;color:var(--text-secondary)}',
    '.meok-fix>:not(summary),.meok-emote>:not(summary){margin-left:10px;margin-right:10px;padding-left:0;padding-right:0}',
    '.meok-tools{display:flex;flex-direction:column;gap:5px;padding:8px;background:var(--bg-secondary);border-right:1px solid var(--border);overflow:auto}',
    '.meok-tools button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;line-height:1.1}',
    '.meok-tools small{font-size:var(--font-size-4xs);color:var(--text-tertiary);white-space:nowrap}',
    '.meok-tools svg{width:19px;height:19px}',
    '.meok-tools button.active svg{color:var(--accent)}',
    '.meok-palette{display:grid;grid-template-columns:repeat(8,1fr);gap:3px}',
    '.meok-swatch{aspect-ratio:1;padding:0;border-radius:var(--radius-sm)}',
    /* 누를 곳은 24x24 이상 (WCAG 2.2 2.5.8). 높이가 23px 이었다 */
    '.meok-mini{font-size:var(--font-size-4xs)!important;padding:5px 4px!important;line-height:1.25;white-space:normal;min-height:24px}',
    '.meok-presets{display:grid;grid-template-columns:1fr 1fr;gap:3px}',
    '.meok-presets button{font-size:var(--font-size-4xs);padding:4px 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meok-stage{display:flex;flex-direction:column;min-width:0;min-height:0}',
    '.meok-canvas{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--bg-primary);background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--border) 60%,transparent) 1px,transparent 0);background-size:18px 18px}',
    '.meok-canvas canvas{position:absolute;inset:0;touch-action:none}',
    '.meok-tl-bar{display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid var(--border)}','.meok-tl-bar .meok-onion{margin-right:auto}','.meok-tl-layers{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border)}','.meok-tl-frames{display:flex;flex-direction:column;min-height:0;min-width:0}','.meok-layer-head{display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid var(--border)}','.meok-layer-head b{flex:1;font-size:var(--font-size-3xs);letter-spacing:.06em;color:var(--text-tertiary)}','.meok-layer-list{flex:1;min-height:0;overflow:auto;padding:4px 6px}','.meok-frames{flex:1;display:flex;gap:5px;overflow:auto;padding:6px 8px;align-items:flex-start}','.meok-tl-bar label{display:flex;align-items:center;gap:4px;color:var(--text-secondary)}',
    '.meok-timeline input[type=number]{width:52px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:3px 5px}',
    '.meok-frame{padding:2px;display:flex;flex-direction:column;align-items:center;gap:1px}',
    '.meok-frame canvas{width:34px;height:34px;image-rendering:pixelated;background:#fff;border-radius:var(--radius-sm)}',
    '.meok-frame small{font-size:var(--font-size-4xs);color:var(--text-tertiary)}',
    '.meok-layer-props{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px;border-bottom:1px solid var(--border)}',
    '.meok-layer-props label{display:flex;align-items:center;gap:6px;color:var(--text-secondary)}',
    '.meok-layer-props input[type=range]{flex:1}',
    '.meok-layer-props select{flex:1;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:3px}',
    '.meok-fix label{display:flex;align-items:center;gap:6px;margin:4px 0;color:var(--text-secondary)}',
    '.meok-fix label input{flex:1}',
    '.meok-fix-row{display:flex;gap:4px;margin:5px 0;flex-wrap:wrap}',
    '.meok-fix-row button{flex:1 1 0;min-width:0;font-size:var(--font-size-4xs);padding:5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.meok-fix-row button[disabled]{opacity:.35;cursor:default}',
    '.meok-filters{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px}',
    /* 이모트 판. 미리보기는 올라갈 크기 그대로. 키우거나 줄이면 보는 뜻이 없음.
       `meok-fix` 를 같이 걸지 마라. 실브라우저 검사가 `.meok-fix summary` 하나를 집는데
       둘이 되면 그 자리에서 죽는다 (2026-08-29 실측). 생김새만 여기서 따로 맞춘다. */
    '.meok-emote-picks{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:4px 0 8px}',
    '.meok-emote-picks button{font-size:var(--font-size-4xs);padding:5px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.meok-emote-picks button.active{border-color:var(--accent);color:var(--text-primary)}',
    '.meok-emote-shots{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:6px;background:var(--bg-primary);border-radius:var(--radius-md);min-height:40px}',
    '.meok-emote-shot{display:flex;flex-direction:column;align-items:center;gap:2px}',
    '.meok-emote-shot canvas{background:#fff;border-radius:var(--radius-sm);image-rendering:auto}',
    '.meok-emote-shot small{font-size:var(--font-size-4xs);color:var(--text-tertiary)}',
    '.meok-emote-note{margin:6px 0 0;font-size:var(--font-size-4xs);color:var(--text-tertiary);line-height:1.4}',
    '.meok-filters button{font-size:var(--font-size-3xs);padding:5px 4px}',
    '.meok-layer{display:flex;align-items:center;gap:5px;padding:4px;border:1px solid transparent;border-radius:var(--radius-md);cursor:pointer}',
    '.meok-layer.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}',
    '.meok-layer canvas{width:34px;height:34px;background:#fff;border-radius:var(--radius-sm);image-rendering:pixelated}',
    '.meok-layer-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meok-maskmark{color:var(--accent);font-weight:400}',
    '.meok-eye,.meok-lock{padding:2px 3px!important;border-color:transparent!important;background:none!important;font-size:var(--font-size-4xs);color:var(--text-tertiary);opacity:.8;min-width:24px;min-height:24px}',
    /* 밟았을 때 그림이 달라져야 한다 (2.4.11). 이 셋은 표시가 없었다 */
    '.meok-menu-title:focus-visible,.meok-tools button:focus,.meok-timeline button:focus,.meok-tools button:focus-visible,.meok-timeline button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    '@media(max-width:860px){.meok-body{grid-template-columns:56px 0 0 30px minmax(0,1fr) 0 0;grid-template-rows:minmax(0,1fr) 0 auto auto}.meok-dock{grid-column:1/-1!important;grid-row:4!important;max-height:40vh;border:0;border-top:1px solid var(--border)}.meok-split{display:none}.meok-timeline{grid-column:1/-1}.meok{height:auto}}'
  ].join('');
  document.head.append(style);
}
