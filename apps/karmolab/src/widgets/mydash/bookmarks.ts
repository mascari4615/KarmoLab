/**
 * 패널: 북마크 (2단계, 읽고 쓰기).
 *
 * 읽는 것은 셋. `data/bookmarks/summary.json` 항목 전부, `data/bookmarks/axes.json` 축
 * 정의, 그리고 이벤트 브랜치의 `bookmarks/events/<YYYY-MM>/*.json`.
 * **축 이름과 축 값 라벨은 코드에 안 박음.** 의도, 영역, 우선순위, 생애주기의 값 목록은 계속
 * 변경 대상이라 박아 두면 값 하나 늘 때마다 배포 필요. 화면은 axes.json 을 읽어 칩만
 * 만들고, 거기 없는 값이 항목에 있으면 그 값 자체를 라벨로 표시 (미아 은닉 금지).
 *
 * `axes.json` 은 **선택.** 못 받으면 빈 정의로 대체, 값 자체가 라벨.
 * 화면을 못 그리게 하는 것은 `summary.json` 실패 하나뿐.
 *
 * 링크는 킷의 `safeLinkUrl` 로 판정. http 도 통과 (실측 2026-09-10: 1,097건 중 22건 http).
 * 거부된 주소는 링크 대신 글자 옆에 "주소 열 수 없음" 표식.
 *
 * ## 쓰기 (2단계)
 *
 * 쓰기는 **append 전용 이벤트 파일**. summary.json 은 생성기 소관이라 화면이 안 건드림.
 * 파일 하나에 이벤트 하나, 경로는
 * `bookmarks/events/<YYYY-MM>/<epoch-ms>-<device6>-<nonce4>.json`, 수정과 삭제 없음.
 * `nonce4` 는 탭마다 다른 4자 hex (셸이 만들고 탭 수명 동안 고정). 같은 기기에서 탭 둘이
 * 같은 ms 에 저장해도 경로 안 겹침. 옛 꼴 `<epoch-ms>-<device6>.json` 도 읽음.
 * 화면이 보는 값은 summary 의 `foldedThrough` 이후 이벤트를 항목 위에 덮은 결과. 같은 대상에 대해 `at` 이 늦은 이벤트가 이기고, 덮는 범위는 그 이벤트의 type 이
 * 가진 축뿐 (tag 는 intent 와 domain, priority 는 priority, status 는 status, note 는 note).
 * `bundle:<묶음 열쇠>` 대상은 그 묶음 전체에 걸리되 항목 개별 이벤트가 더 늦으면 개별이 승.
 *
 * 파일이 한 벌인 이유는 손이 하나라서. 시트, 선택 모드, 한 장 모드가 모두 같은 `states`
 * 지도와 같은 `sendEvent` 를 씀. 갈라 두면 낙관적 갱신이 세 벌로 갈라져 화면이 어긋남
 * (`memo/rules/quality.md` 의 500줄 상한은 판단 절).
 *
 * 출처 라벨(X, 브라우저, 카톡)만 i18n 소관. `src` 는 축이 아니라 데이터 갈래라
 * axes.json 에 정의 없음. 모르는 갈래는 값 그대로 표시.
 */
import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx, DashRepoWrite } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type AxisValue = { key: string; label?: string; hint?: string; retired?: boolean };
  type Axis = {
    key: string;
    label?: string;
    multi?: boolean;
    /** 값별 상한. 우선순위 축의 `now` 만 씀 */
    cap?: Record<string, number>;
    values?: AxisValue[];
  };
  type AxesFile = { schema?: string; axes?: Axis[]; data?: { axes?: Axis[] } };

  type Item = {
    id: string;
    src?: string;
    url?: string | null;
    label?: string | null;
    author?: string | null;
    recordedAt?: string | null;
    note?: string | null;
    /** 원본 줄의 작은 제목. label 이 비었을 때 표시 문자열의 첫 조각이 된다 */
    subhead?: string | null;
    /** 사람 판정 대기 표식. 값이 있으면 의도가 비어 있는 것이 정상이다 */
    pending?: string | null;
    /** 묶음 열쇠. 생성기가 항목에 직접 달거나 `data.bundles` 로 따로 낸다. 둘 다 받는다 */
    bundle?: string | null;
    bundleKey?: string | null;
    axes?: Record<string, unknown>;
    /**
     * 같은 주소가 다른 출처에서 또 나온 기록. 생성기가 배열로 낸다 (`shares` 라는 이름의
     * 숫자 필드는 스키마에 없음). 재발굴 점수에서 이 배열 길이를 나눗수로 사용.
     */
    shared?: unknown[];
    /**
     * 원문 미리보기 (MVP 5). 생성기가 접어 넣는다. 트윗은 본문과 그림 주소, 페이지는 Open Graph.
     * 없으면 못 받은 것. 그때는 지금처럼 라벨만
     */
    media?: Media | null;
  };
  type MediaPhoto = { url: string; w?: number; h?: number };
  type Media = {
    kind?: 'tweet' | 'page';
    text?: string | null;
    who?: { name?: string; handle?: string } | null;
    photos?: MediaPhoto[] | null;
    video?: { poster?: string } | null;
    deleted?: boolean;
    sensitive?: boolean;
    title?: string | null;
    description?: string | null;
    image?: string | null;
    site?: string | null;
  };
  type BundleDef = { key?: string; id?: string; items?: string[] };
  type Summary = {
    schema?: string;
    generatedAt?: string;
    /** 생성기가 여기까지의 이벤트를 이미 접어 넣음. 화면은 이 뒤만 읽음 */
    foldedThrough?: string;
    counts?: { items?: number; parseFailed?: number };
    data?: { items?: Item[]; bundles?: BundleDef[] };
    items?: Item[];
  };

  /** 이벤트가 건드리는 축 갈래. 갈래 하나가 파일 하나 */
  type EvType = 'tag' | 'status' | 'priority' | 'note';
  type DashEvent = {
    v: number;
    at: string;
    device: string;
    type: EvType;
    /** 항목 id 또는 `bundle:<묶음 열쇠>` */
    target: string;
    intent?: string[];
    /** 주제 (성인 등). tag 이벤트에 실린다. 사용자 2026-09-19: 화면에서 분류를 못 하잖아 */
    topic?: string[];
    domain?: string | null;
    priority?: string | null;
    status?: string;
    note?: string;
  };

  /** 이벤트를 다 덮은 뒤의 한 항목. 화면과 필터가 보는 값은 전부 여기서 나옴 */
  type ItemState = {
    intent: string[];
    topic: string[];
    domain: string | null;
    priority: string | null;
    status: string;
    note: string;
    /** tag 이벤트가 한 번이라도 걸렸나. 판정 대기 해제 판정에 씀 */
    tagged: boolean;
  };

  const DATA_DIR = 'data/bookmarks';
  const SUMMARY_PATH = DATA_DIR + '/summary.json';
  const AXES_PATH = DATA_DIR + '/axes.json';
  /** 이벤트 뿌리. 이 아래가 `<YYYY-MM>/<epoch-ms>-<device6>-<nonce4>.json` */
  const EVENTS_DIR = 'bookmarks/events';

  /** 이 패널이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적는다 */
  const SCHEMA_MAJOR = 1;
  /** 이벤트 봉투 판 */
  const EVENT_V = 1;
  /** 한 번에 보이는 줄 수. 묶음은 접힌 채로 한 줄이다 */
  const PAGE = 100;
  /** 재발굴 후보 크기. 여기서 날짜 씨앗으로 하나 뽑는다 */
  const REVISIT_POOL = 40;
  /** 이 기기에서 이미 보여 준 재발굴 id. 순수 보기 편의라 기기마다 따로 둔다 */
  const SEEN_KEY = 'karmolab.mydash.bm.seen';
  /** 기억할 id 수. 넘치면 오래된 것부터 버린다 */
  const SEEN_MAX = 200;
  /** note 로 제목을 대신할 때 잘라 쓰는 길이 */
  const NOTE_HEAD = 40;
  /** 항목 축으로 거르는 칸. 값 목록은 실제 데이터에서 나옴 */
  const FILTER_AXES = ['intent', 'domain', 'form', 'topic'];
  /** 이벤트로 바뀌는 축. 값 목록은 axes.json 정의 전부 (0건이어도 칩을 세움) */
  const STATE_AXES = ['status', 'priority'];
  /** 시트에서 고를 수 있는 생애주기. unsorted 와 tagged 는 사람이 직접 고르는 값 아님 */
  const PICKABLE_STATUS = ['opened', 'promoted', 'dropped'];
  /** 기본 목록에서 뺄 생애주기. 아카이브 무한 증식 방지, 필터로 켜야 보임 */
  const HIDDEN_STATUS = ['dropped', 'promoted'];
  /** axes.json 에 상한이 없을 때 쓰는 `now` 상한 */
  const NOW_CAP_FALLBACK = 8;
  /** 한 달 폴더 안에서 동시에 읽을 이벤트 파일 수. 수백 건이 한 번에 나가는 것 방지 */
  const EVENT_READ_LIMIT = 8;
  /** 일괄 적용에서 쓰기 요청 사이 간격 ms. 한 건씩 순차라 왕복 시간이 여기 더해진다 */
  const BULK_GAP_MS = 150;
  /** 출처 칸 차례. 나머지는 뒤에 이름순으로 붙는다 */
  const SRC_ORDER = ['x', 'edge', 'kakao'];
  const KST_OFFSET_MS = 9 * 3600000;
  /** 보기 셋. 목록 (묶음 접힘, 옆판), 피드 (한 장씩 세로, 카드 아래 판정), 격자 (그림 타일) */
  type View = 'list' | 'feed' | 'grid';
  const VIEWS: View[] = ['list', 'feed', 'grid'];
  const VIEW_KEY = 'karmolab.mydash.bm.view';
  /** 피드 카드에 보이는 의도 칩 수. 나머지는 옆판에서 */
  const FEED_TAGS = 6;

  function gap(): Promise<void> {
    return new Promise<void>((done) => window.setTimeout(done, BULK_GAP_MS));
  }

  /** 출처 차례 재는 자. 칩 줄과 재발굴 후보가 같은 차례를 쓴다 */
  function bySrcOrder(a: string, b: string): number {
    const ai = SRC_ORDER.indexOf(a);
    const bi = SRC_ORDER.indexOf(b);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a < b ? -1 : 1;
  }

  const STYLE_ID = 'mydash-bookmarks-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색, 둥글기, 글자 크기는 전부 스킨 토큰이다. 여기 직접 적는 것은 손가락 표적 하나뿐이고
       그 값도 이름을 붙여 한 곳에서만 쓴다. */
    el.textContent = [
      /* 크기는 레퍼런스 실측 (2026-09-19, notes/mydash/mvp5-design-2026-09-19.md). 본문 15, 메타 13, 캡션 14,
         그림 모서리 16, 격자 열 236 간격 16. 스킨 토큰에 없는 값은 이 패널 변수로 한 곳에만 */
      '.bm{--bm-tap:44px;--bm-body:15px;--bm-body-lh:22px;--bm-meta:13px;--bm-cap:14px;--bm-pic-radius:16px;',
      '--bm-col:236px;--bm-gap:16px;display:flex;flex-direction:column;gap:var(--space-md)}',
      '.bm-head-acts{flex-wrap:nowrap}',
      '.bm-q{flex:1;min-width:0;min-height:var(--bm-tap);padding:0 var(--space-md);border:1px solid var(--border);',
      'border-radius:var(--radius-pill);background:var(--bg-secondary);color:var(--text-primary);font:inherit;font-size:var(--bm-body)}',
      '.bm-q:focus{outline:2px solid var(--accent);outline-offset:-1px}',
      '.bm-filters-acts{display:flex;flex-wrap:wrap;gap:var(--space-sm)}',
      '.bm-filters-acts .btn[aria-pressed="true"]{background:var(--bg-tertiary);color:var(--text-primary)}',
      /* 폰이 기본. 두 칸이면 숫자가 안 줄어든다. 넓어지면 다섯. */
      '.bm-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-sm)}',
      '@media(min-width:560px){.bm-nums{grid-template-columns:repeat(5,1fr)}}',
      '.bm-num{padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.bm-num b{display:block;font-size:var(--font-size-title);line-height:1.3;font-variant-numeric:tabular-nums}',
      '.bm-num span{display:block;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-groups{display:flex;flex-direction:column;gap:var(--space-sm)}',
      /* 이 패널의 칩과 버튼은 전부 44px. 필터 줄만 벌려 두니 시트, 선택 띠, 한 장 모드의
         칩이 폰에서 작았다. 아래 한 줄이 셋을 같이 덮는다. */
      '.bm .tool-chip{min-height:var(--bm-tap);display:inline-flex;align-items:center}',
      '.bm .btn{min-height:var(--bm-tap)}',
      /* 줄 안의 의도 칩과 판정 대기 칩은 누르는 것이 아니라 표식. 킷 크기 그대로 */
      '.bm .bm-meta .tool-chip{min-height:0}',
      /* 검색칸은 킷 기본이 38px 언저리다. 폰에서 누르는 것은 전부 같은 표적 크기로 벌린다. */
      '.bm .field-group input{min-height:var(--bm-tap)}',
      /* 킷 목록의 기본 높이 제한은 목록 안에 또 스크롤을 만든다. 이 패널은 목록이 본문이라
         판 전체가 스크롤이어야 한다. */
      '.bm-list{max-height:none}',
      '.bm-list .tool-list-row{align-items:flex-start}',
      /* 킷의 열쇠 칸은 키, 값 표를 위한 폭이다. 여기 열쇠는 출처 표식 한 낱말이라 폭을 안 잡는다. */
      '.bm-list .tool-list-key{min-width:0;padding-top:var(--space-xs)}',
      '.bm-body{display:flex;flex-direction:column;gap:var(--space-xs);min-width:0;flex:1}',
      '.bm-title{display:flex;align-items:center;min-height:var(--bm-tap);',
      'color:var(--text-primary);word-break:break-word}',
      /* 열 수 없는 주소 표식. 글자 옆에 붙어 왜 링크가 아닌지 말한다. */
      '.bm-badurl{margin-left:var(--space-sm);font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-meta{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;',
      'font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-row .bm-meta .tool-chip{pointer-events:none}',
      '.bm-kid .tool-list-key{padding-left:var(--space-md)}',
      /* 원문 미리보기 (MVP 5). 줄 썸네일 96x72, 둘째 줄 두 줄 자름, 옆판 세 층 */
      '.bm-thumb{width:120px;height:90px;object-fit:cover;border-radius:calc(var(--bm-pic-radius) / 2);flex:none;',
      'background:var(--bg-tertiary);margin-top:var(--space-xs)}',
      '.bm-sub{color:var(--text-secondary);font-size:var(--bm-cap);line-height:1.45;overflow:hidden;display:-webkit-box;',
      '-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.bm-row .bm-title{min-height:0;padding-top:var(--space-xs);font-size:var(--bm-body);line-height:var(--bm-body-lh);font-weight:600;',
      'overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.bm-view-list{border:0;background:transparent;font-family:var(--font-sans)}',
      '.bm-view-list .tool-list-key{font-family:var(--font-sans);font-size:var(--bm-meta);color:var(--text-tertiary)}',
      '.bm-view-list a.bm-title{text-decoration:none}',
      '.bm-view-list a.bm-title:hover{text-decoration:underline}',
      '.bm-view-list .tool-actions.tight .btn{min-height:32px;font-size:var(--bm-meta);padding:0 var(--space-sm)}',
      '.bm-sheet,.bm-card,.bm-tile{font-family:var(--font-sans)}',
      '.bm-view-list .tool-list-row{padding:var(--space-md) var(--space-sm);border-bottom:1px solid var(--border)}',
      '.bm-row .bm-meta{font-size:var(--bm-meta)}',
      '.bm-layer{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.bm-said{padding:var(--space-sm) var(--space-md);background:var(--bg-tertiary);',
      'border-left:3px solid var(--accent);border-radius:0 var(--radius-md) var(--radius-md) 0;color:var(--text-primary)}',
      '.bm-said-memo{color:var(--text-secondary)}',
      '.bm-who{color:var(--text-secondary);font-size:var(--font-size-2xs)}',
      '.bm-ptitle{color:var(--text-primary);font-weight:600}',
      '.bm-tw{white-space:pre-wrap;word-break:break-word;color:var(--text-primary);font-size:var(--bm-body);line-height:var(--bm-body-lh)}',
      '.bm-pic{width:100%;max-width:100%;border-radius:var(--bm-pic-radius);display:block}',
      '.bm-sheet-title{font-size:var(--font-size-title);font-weight:600;line-height:1.3}',
      '.bm-who{font-size:var(--bm-meta)}',
      '.bm-link{font-size:var(--font-size-2xs)}',
      '.bm-ai summary{cursor:pointer;list-style:none;display:flex;gap:var(--space-sm);align-items:baseline}',
      '.bm-ai summary::-webkit-details-marker{display:none}',
      '.bm-ai-peek{color:var(--text-tertiary);font-size:var(--font-size-3xs)}',
      /* 보기 전환. 눌린 것만 채움 */
      '.bm-views{display:inline-flex;gap:0;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}',
      '.bm-views .btn{border-radius:0;border:0}',
      '.bm-views .btn[aria-pressed="true"]{background:var(--bg-tertiary);color:var(--text-primary)}',
      '.bm-views{flex:none}',
      /* 피드 (트위터 식). 카드 한 줄, 폭 600 가운데 */
      '.bm-view-feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:var(--space-md);border:0;background:transparent;align-items:start}',
      '.bm-card{display:flex;flex-direction:column;gap:var(--space-sm);padding:var(--space-md);border:1px solid var(--border);',
      'border-radius:calc(var(--bm-pic-radius) - 4px);background:var(--bg-secondary);cursor:pointer}',
      '.bm-card.is-cur{border-color:var(--accent)}',
      '.bm-card.is-done,.bm-tile.is-done{opacity:.45}',
      '.bm-card-head{display:flex;justify-content:space-between;gap:var(--space-sm);align-items:baseline}',
      '.bm-card-who{font-weight:600;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bm-card-src{color:var(--text-tertiary);font-size:var(--bm-meta);flex:none}',
      '.bm-card-who{font-size:var(--bm-body)}',
      '.bm-card-pic{position:relative}',
      '.bm-card-more{position:absolute;right:var(--space-sm);bottom:var(--space-sm);background:var(--modal-scrim);color:var(--text-primary);',
      'font-size:var(--font-size-3xs);padding:2px var(--space-sm);border-radius:var(--radius-pill)}',
      '.bm-card-acts{display:flex;gap:var(--space-sm)}',
      '.bm-card-acts .bm-act{flex:1;min-height:var(--bm-tap);font-weight:600;border:1px solid var(--border);font-size:var(--bm-cap)}',
      '.bm-act-drop{color:var(--error)}.bm-act-keep{color:var(--success)}.bm-act-now{color:var(--warning)}',
      '.bm-card-tags{display:flex;gap:var(--space-xs);overflow-x:auto;scrollbar-width:none;padding-bottom:2px}',
      '.bm-card-tags .tool-chip{flex:none;min-height:36px}',
      /* 격자 (핀터레스트 식). 열 240, 폰은 2열 */
      '.bm-view-grid{display:block;columns:var(--bm-col);column-gap:var(--bm-gap);border:0;background:transparent}',
      '@media(max-width:559px){.bm-view-grid{columns:2}}',
      '.bm-tile{break-inside:avoid;margin:0 0 var(--bm-gap);position:relative;cursor:pointer}',
      '.bm-tile img{width:100%;display:block;border-radius:var(--bm-pic-radius);background:var(--bg-tertiary)}',
      '.bm-tile.is-cur img,.bm-tile.is-cur .bm-tile-text{outline:2px solid var(--accent);outline-offset:2px}',
      '.bm-tile-text{padding:var(--space-md);border-radius:var(--bm-pic-radius);background:var(--bg-secondary);font-size:var(--bm-body);',
      'line-height:var(--bm-body-lh);font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;color:var(--text-primary)}',
      '.bm-tile figcaption{padding:var(--space-sm) var(--space-xs) 0;display:flex;flex-direction:column;gap:2px}',
      '.bm-tile-cap{font-size:var(--bm-cap);line-height:1.45;font-weight:500;color:var(--text-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.bm-tile-meta{font-size:var(--bm-meta);color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bm-tile-meta b{color:var(--warning);font-weight:500}',
      '.bm-tile-acts{position:absolute;top:var(--space-sm);right:var(--space-sm);display:flex;gap:var(--space-xs);opacity:0;transition:opacity .15s}',
      '.bm-tile:hover .bm-tile-acts,.bm-tile:focus-within .bm-tile-acts,.bm-tile.is-cur .bm-tile-acts{opacity:1}',
      '@media(hover:none){.bm-tile-acts{opacity:1}}',
      '@media(prefers-reduced-motion:reduce){.bm-tile-acts{transition:none}}',
      '.bm-tile-btn{min-height:36px;padding:0 var(--space-md);border-radius:var(--radius-pill);border:0;background:var(--modal-scrim);color:var(--text-primary);font:inherit;font-size:var(--bm-meta);font-weight:600;cursor:pointer}',
      /* 목록이 주인공 (MVP 3, 사용자 2026-09-17 "칩 벽"). 수 타일과 칩 34개는 접힌 필터 안 */
      '.bm-filters{display:flex;flex-direction:column;gap:var(--space-md)}',
      '.bm-filters[hidden]{display:none}',
      '.bm-head-acts .btn[aria-expanded="true"]{background:var(--bg-tertiary);color:var(--text-primary)}',
      '.bm-main{display:flex;flex-direction:column;gap:var(--space-md);min-width:0}',
      '.bm-row.is-cur{background:var(--bg-tertiary)}',
      '.bm-keys{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-keys kbd{font-family:inherit;padding:0 var(--space-xs);border:1px solid var(--border);border-radius:var(--radius-sm)}',
      /* 옆판이 비었을 때. 줄을 누르라는 한 줄 */
      '.bm-sheet-empty{color:var(--text-tertiary);padding:var(--space-md)}',
      '.bm-revisit{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.bm-revisit[hidden]{display:none}',
      /* 머리 버튼 줄. 선택 모드와 한 장 모드로 드는 문 */
      '.bm-head-acts{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center}',
      /* 고르기 칸. 손가락 표적이라 칸 전체가 44px */
      '.bm-check{width:var(--bm-tap);height:var(--bm-tap);flex:none;margin:0}',
      '.bm-row.is-pick{cursor:pointer}',
      /* 아래에서 올라오는 시트. 폰은 바닥에 붙고 넓은 화면은 가운데 */
      '.bm-sheet{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;justify-content:flex-end}',
      /* 닫힌 시트가 화면 전체를 덮어 마우스를 먹던 결함 (2026-09-13 실측 1440x900 전부 차단). UA 의 [hidden] 을 이 규칙이 이겼음 */
      '.bm-sheet[hidden]{display:none!important}',
      /* PC 는 두 열. 목록과 옆판 420px 이 나란히, 옆판은 늘 떠 있고 위에 붙어 따라온다 (MVP 3).
         전에는 fixed 서랍이라 목록 오른쪽을 덮었다 */
      /* PC 옆판은 화면에 고정 (2026-09-19 사용자: 스크롤이 제대로 안 됨). sticky 는 내용 스크롤과 옆판 스크롤이
         겹쳐 아래가 잘렸다. 화면 오른쪽에 고정하고 자기만 스크롤. 본문은 그만큼 오른쪽을 비운다 */
      '@media(min-width:900px){.bm:not(.no-panel){padding-right:436px}',
      '.bm-sheet{position:fixed;inset:auto;top:var(--header-h,0px);right:0;bottom:0;width:420px;z-index:200;display:block;',
      'overflow:auto;overscroll-behavior:contain;border-left:1px solid var(--border);padding:var(--space-md);background:var(--bg-primary)}',
      '.bm-sheet .bm-scrim{display:none}',
      '.bm-sheet .bm-sheet-card{max-height:none;max-width:none;width:100%;border-radius:0;border-top:0;padding:0;background:transparent}',
      '.bm-row .bm-open{display:none}',
      '.bm-row{cursor:pointer}}',
      '.bm-scrim{position:absolute;inset:0;background:var(--modal-scrim)}',
      '.bm-sheet-card{position:relative;max-height:85vh;overflow:auto;background:var(--bg-secondary);',
      'border-top:1px solid var(--border);border-radius:var(--radius-lg) var(--radius-lg) 0 0;',
      'padding:var(--space-md);display:flex;flex-direction:column;gap:var(--space-md)}',
      '@media(min-width:560px){.bm-sheet{justify-content:center;align-items:center}',
      '.bm-sheet-card{width:100%;max-width:34rem;border-radius:var(--radius-lg);border-top:0}}',
      '.bm-sheet-head{display:flex;gap:var(--space-sm);align-items:flex-start;justify-content:space-between}',
      '.bm-sheet-title{color:var(--text-primary);word-break:break-word;flex:1}',
      '.bm-sheet-foot{display:flex;gap:var(--space-sm);align-items:center;',
      'justify-content:space-between;flex-wrap:wrap}',
      '.bm-sheet-sec{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.bm-nowlist{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-sm);border-radius:var(--radius-md);background:var(--bg-tertiary)}',
      '.bm-nowrow{display:flex;gap:var(--space-sm);align-items:center;justify-content:space-between}',
      /* 선택 모드 아래 띠. 목록 끝이 가리지 않게 판에 바닥 여백을 준다 */
      '.bm-bar{position:fixed;left:0;right:0;bottom:0;z-index:2900;background:var(--bg-secondary);',
      'border-top:1px solid var(--border);padding:var(--space-sm);display:flex;',
      'flex-direction:column;gap:var(--space-sm)}',
      '.bm.has-bar{padding-bottom:calc(var(--bm-tap) * 4)}',
      '.bm-judge{display:flex;flex-direction:column;gap:var(--space-md)}',
      '.bm-judge-title{color:var(--text-primary);word-break:break-word}',
    ].join('');
    document.head.appendChild(el);
  }

  /* ── 데이터 읽기. 생성기가 아직 굳지 않아 **둘 다 받는다** ─────────── */

  function itemsOf(raw: Summary): Item[] {
    const list = (raw && raw.data && raw.data.items) || (raw && raw.items) || [];
    return Array.isArray(list) ? list.filter((it) => !!it && typeof it === 'object') : [];
  }

  function axesOf(raw: AxesFile): Axis[] {
    const list = (raw && raw.axes) || (raw && raw.data && raw.data.axes) || [];
    return Array.isArray(list) ? list : [];
  }

  function schemaMajor(schema: unknown): number | null {
    if (typeof schema !== 'string') return null;
    const at = schema.lastIndexOf('/');
    const n = parseInt(at < 0 ? schema : schema.slice(at + 1), 10);
    return isFinite(n) ? n : null;
  }

  /** 항목이 그 축에 가진 값들. 하나만 담는 축은 글자, 여럿은 배열로 온다 */
  function axisValues(it: Item, key: string): string[] {
    const v = it.axes ? (it.axes as Record<string, unknown>)[key] : undefined;
    if (typeof v === 'string') return v ? [v] : [];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
    return [];
  }

  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  /** 주소의 집 이름. 표시 문자열의 마지막 조각으로 쓴다 */
  function hostOf(url: unknown): string {
    const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(text(url).trim());
    return m ? m[1].replace(/^www\./i, '').toLowerCase() : '';
  }

  /**
   * 화면에 보일 제목. 원본에 제목이 없는 항목이 193건이라 그대로 두면 원시 id 노출.
   * 차례는 셋. label, 없으면 메모 앞 40자, 그래도 없으면 작은 제목과 작성자와 집 이름.
   * 메모는 사람이 note 이벤트로 덮을 수 있어 **덮은 뒤 값**을 받는다 (안 주면 원본 note).
   * 검색도 이 문자열 대상 (보이는 글자로 못 찾는 것 방지).
   */
  /** 트위터 그림 주소에 크기 표식. 목록은 small, 옆판은 medium. 다른 곳 그림은 그대로 */
  function picUrl(url: string, size: 'small' | 'medium'): string {
    const clean = text(url).trim();
    if (!clean) return '';
    if (/^https:\/\/pbs\.twimg\.com\//.test(clean)) return clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'name=' + size;
    return clean;
  }

  function mediaOf(it: Item): Media | null {
    return it.media && typeof it.media === 'object' ? it.media : null;
  }

  /** 목록 줄 썸네일 주소. 트윗 첫 장, 영상 포스터, 페이지 대표 그림 순 */
  function thumbOf(it: Item): string {
    const m = mediaOf(it);
    if (!m) return '';
    const first = m.photos && m.photos.length ? m.photos[0] : null;
    if (first && first.url) return picUrl(first.url, 'small');
    if (m.video && m.video.poster) return picUrl(m.video.poster, 'small');
    if (m.image) return safeLinkUrl(m.image) || '';
    return '';
  }

  /**
   * 원문 첫 줄. 사용자 2026-09-19: AI 해석보다 원문 그대로가 먼저.
   * 카톡은 라벨이 곧 내가 쓴 말이라 라벨. 트윗은 본문 첫 줄, 페이지는 라벨 (Edge 는 페이지 제목).
   * 트윗 본문이 없는 그림 트윗은 라벨 (없으면 기존 대체 문자열)
   */
  function headOf(it: Item, note?: string): string {
    const m = mediaOf(it);
    if (m && m.kind === 'tweet' && text(m.text).trim() && text(it.src) === 'x') {
      return text(m.text).trim().split('\n')[0];
    }
    return displayLabel(it, note);
  }

  /** 목록 줄 둘째 줄. 트윗은 누가, 페이지는 설명 한두 문장 (없으면 없음) */
  function subOf(it: Item): string {
    const m = mediaOf(it);
    if (!m) return '';
    if (m.kind === 'tweet') {
      const who = m.who ? [text(m.who.name), m.who.handle ? '@' + text(m.who.handle) : ''].filter(Boolean).join(' ') : '';
      return who;
    }
    /* 페이지는 제목이 라벨과 다르면 제목 (카톡은 라벨이 내 말이라 제목이 새 정보), 같으면 설명 */
    const title = text(m.title).trim();
    if (title && title !== text(it.label).trim()) return title;
    return text(m.description).trim();
  }

  function displayLabel(it: Item, note?: string): string {
    const label = text(it.label).trim();
    if (label) return label;
    const memo = (typeof note === 'string' ? note : text(it.note)).trim();
    if (memo) return memo.length > NOTE_HEAD ? memo.slice(0, NOTE_HEAD) + '...' : memo;
    const bits: string[] = [text(it.subhead).trim() || t('mydash.bm.noTitle', undefined, '제목 없음')];
    const author = text(it.author).trim();
    if (author) bits.push(author);
    const host = hostOf(it.url);
    if (host) bits.push(host);
    return bits.join(', ');
  }

  /* ── 이 기기에서 이미 보여 준 재발굴 ──────────────────
     쓰기는 저장소가 아니라 이 브라우저다. 사생활 보호 창처럼 저장이 막힌 판에서는
     읽기도 쓰기도 조용히 실패하고, 재발굴은 미룸 없이 그냥 돈다. */

  function seenIds(): string[] {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  function markSeen(id: string): void {
    if (!id) return;
    try {
      const next = seenIds().filter((x) => x !== id);
      next.push(id);
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(next.slice(-SEEN_MAX)));
    } catch {
      /* 저장이 막힌 브라우저. 다음에도 같은 것이 나올 뿐 화면은 안 죽는다 */
    }
  }

  /* ── 날짜 ─────────────────────────────────────────── */

  function kstDayKey(ms: number): string {
    const d = new Date(ms + KST_OFFSET_MS);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + m + '-' + day;
  }

  /** 기록일이 며칠 전인가. 못 읽으면 -1 */
  function idleDays(recordedAt: unknown): number {
    const s = text(recordedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return -1;
    const at = Date.parse(s + 'T00:00:00+09:00');
    if (!isFinite(at)) return -1;
    return Math.max(0, Math.floor((Date.now() - at) / 86400000));
  }

  function bakedAgo(iso: unknown): string {
    const at = Date.parse(text(iso));
    if (!isFinite(at)) return '';
    const d = Math.floor((Date.now() - at) / 86400000);
    if (d <= 0) return t('mydash.bm.baked.today', undefined, '오늘 구움');
    if (d === 1) return t('mydash.bm.baked.yesterday', undefined, '어제 구움');
    return t('mydash.bm.baked.days', { n: d }, '{n}일 전에 구움');
  }

  /* ── 이벤트 ────────────────────────────────────────
     **자르는 자는 파일 이름이 아니라 달 폴더다.** 이름 앞머리의 epoch 로 자르면, 이름을 저
     꼴로 안 지은 파일이나 시계가 어긋난 기기가 낸 파일이 통째로 안 읽힌다. 게다가 nonce 가
     붙어 이름이 한 꼴이 아니다.
     이번 달과 지난 달은 무조건 전부 읽고, 그보다 오래된 달만 `foldedThrough` 로 건너뛴다.
     달이 통째로 접힌 것이 확실할 때만 건너뛰므로 (그 달의 마지막 ms 까지 접혔을 때),
     생성기가 접다 만 달은 다시 읽힌다. 받은 뒤 `at` 으로 한 번 더 잰다. */

  const EV_TYPES: EvType[] = ['tag', 'priority', 'status', 'note'];

  function evAt(ev: DashEvent): number {
    const n = Date.parse(text(ev.at));
    return isFinite(n) ? n : 0;
  }

  /** 기기 이름 꼴. 셸의 `deviceId` 가 6자 hex 를 만든다 */
  const DEVICE_RE = /^[0-9a-f]{6}$/i;

  /**
   * 봉투가 이 화면이 아는 판이고 필수 칸이 찼나. 아니면 조용히 버림
   * (미아 은닉 아님, 로그로 셈). 생성기 `eventProblem` 과 같은 잣대.
   * `at` 은 글자만으로 부족하다. 못 읽는 날짜는 evAt 이 0 이 되어 어떤 이벤트보다도
   * 이르게 취급되어 사람이 마지막에 정한 값이 안 이기는 결과로 이어짐.
   */
  function isEvent(v: unknown): v is DashEvent {
    if (!v || typeof v !== 'object') return false;
    const e = v as Record<string, unknown>;
    if (e.v !== EVENT_V) return false;
    if (typeof e.at !== 'string' || !isFinite(Date.parse(e.at))) return false;
    if (typeof e.device !== 'string' || !DEVICE_RE.test(e.device)) return false;
    if (typeof e.target !== 'string' || !e.target) return false;
    return EV_TYPES.indexOf(e.type as EvType) >= 0;
  }

  /** 동시 실행 수를 묶어 도는 map. 한 달에 수백 건이 한 번에 나가는 것 방지 */
  async function mapLimit<A, B>(list: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
    const out: B[] = [];
    for (let i = 0; i < list.length; i += limit) {
      const part = await Promise.all(list.slice(i, i + limit).map(fn));
      for (const r of part) out.push(r);
    }
    return out;
  }

  function monthKey(ms: number): string {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  /** 이번 달과 지난 달. 이 둘은 `foldedThrough` 와 무관하게 전부 읽는다 */
  function recentMonthKeys(now: number): string[] {
    const d = new Date(now);
    return [monthKey(now), monthKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))];
  }

  /**
   * `YYYY-MM` 폴더가 담을 수 있는 마지막 ms. 이름이 저 꼴이 아니면 무한대라
   * 어떤 `foldedThrough` 로도 안 건너뛴다 (모르는 폴더는 읽어 본다).
   */
  function monthEndMs(name: string): number {
    const m = /^(\d{4})-(\d{2})$/.exec(name);
    if (!m) return Number.POSITIVE_INFINITY;
    return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10), 1) - 1;
  }

  /* ── 화면 ─────────────────────────────────────────── */

  type Group = { key: string; label: string; values: Array<{ key: string; label: string }> };
  type Unit = { key: string; items: Item[] };
  /** 시트가 지금 무엇을 고치고 있나. 묶음이면 items 가 그 묶음 전부 */
  type SheetTarget = { target: string; items: Item[]; bundle: boolean };

  function viewLabel(v: string): string {
    if (v === 'feed') return t('mydash.bm.view.feed', undefined, '피드');
    if (v === 'grid') return t('mydash.bm.view.grid', undefined, '격자');
    return t('mydash.bm.view.list', undefined, '목록');
  }

  function srcLabel(key: string): string {
    /* 아는 갈래 셋만 옮긴 말이 있다. 새 갈래는 값 그대로 보인다. */
    return t('mydash.bm.src.' + key, undefined, key);
  }

  function sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    for (const v of b) if (!s.has(v)) return false;
    return true;
  }

  /** 셸이 던지는 오류의 갈래. 셸의 `DashError.kind` 와 같은 말 */
  function errKind(e: unknown): string {
    const k = e && typeof e === 'object' ? (e as Record<string, unknown>).kind : undefined;
    return typeof k === 'string' ? k : '';
  }

  /**
   * 쓰기 권한 없음인가. 큐에 안 남기고 사람에게 설정을 고치라고 알림.
   *
   * **갈래를 먼저 본다.** 셸은 `DashError` 를 던지는데 거기 `status` 가 없고 글월도
   * 한국어라, 숫자만 재던 옛 판정은 403 을 net 실패로 보고 큐에 쌓았다. 권한이 없는 동안은
   * 몇 번을 다시 보내도 같은 자리에서 막혀 큐만 늚.
   * `auth` 도 여기로 옴. 토큰이 죽은 것이라 재전송으로 안 풀림.
   */
  function isPermError(e: unknown): boolean {
    const kind = errKind(e);
    if (kind === 'perm' || kind === 'auth') return true;
    const st = e && typeof e === 'object' ? (e as Record<string, unknown>).status : undefined;
    if (st === 403 || st === 401) return true;
    const msg = e instanceof Error ? e.message : String(e || '');
    return /\b(403|401)\b/.test(msg);
  }

  /**
   * 같은 경로가 이미 있나 (GitHub 422). 큐에 넣으면 안 된다. 재전송해도 같은 422 라
   * 큐에서 안 빠지거나, 빠져도 이벤트가 두 벌이 됨.
   */
  function isExistsError(e: unknown): boolean {
    if (errKind(e) === 'exists') return true;
    const st = e && typeof e === 'object' ? (e as Record<string, unknown>).status : undefined;
    if (st === 422) return true;
    const msg = e instanceof Error ? e.message : String(e || '');
    return /\b422\b/.test(msg);
  }

  async function render(ctx: DashPanelCtx<DashRepoWrite>): Promise<void> {
    ensureStyle();
    /* 옮긴 말이 안 와도 그린다. 아래 모든 t 호출에 한국어 원본이 딸려 있다 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    root.innerHTML =
      '<div class="bm"><div class="tool-status">' +
      esc(t('mydash.bm.loading', undefined, '저장소에서 받는 중...')) +
      '</div></div>';

    /* 필수는 summary 하나. axes 는 칩 라벨과 차례만 정하는 파일이라, 못 받으면 빈 정의로
       가고 값 자체를 라벨로 보인다 (미아 은닉 금지와 같은 손). summary 실패만 오류다. */
    const [rawSummary, rawAxes] = await Promise.all([
      repo.readJson<Summary>(SUMMARY_PATH),
      repo.readJson<AxesFile>(AXES_PATH).catch((): AxesFile => ({})),
    ]);

    const major = schemaMajor(rawSummary.schema);
    if (major !== null && major !== SCHEMA_MAJOR) {
      root.innerHTML =
        '<div class="bm"><div class="tool-status error">' +
        esc(
          t(
            'mydash.bm.schemaBad',
            { schema: text(rawSummary.schema) },
            '모르는 판입니다 ({schema}). 대시보드를 다시 배포하세요'
          )
        ) +
        '</div></div>';
      return;
    }

    const items = itemsOf(rawSummary);
    const axes = axesOf(rawAxes);
    const foldedMs = Date.parse(text(rawSummary.foldedThrough));
    const foldedThrough = isFinite(foldedMs) ? foldedMs : -1;
    status(
      t('mydash.bm.status', { n: items.length, when: bakedAgo(rawSummary.generatedAt) }, '{n}건, {when}')
    );

    /* 묶음 열쇠. 항목에 달려 오면 그대로, `data.bundles` 로 오면 표로 뒤집어 붙인다. */
    const bundleOf = new Map<string, string>();
    const defs = (rawSummary.data && rawSummary.data.bundles) || [];
    if (Array.isArray(defs)) {
      for (const d of defs) {
        const key = text(d && (d.key || d.id));
        const ids = d && Array.isArray(d.items) ? d.items : [];
        if (!key) continue;
        for (const id of ids) if (typeof id === 'string') bundleOf.set(id, key);
      }
    }
    const bundleKey = (it: Item): string => {
      const own = text(it.bundle || it.bundleKey);
      return own || bundleOf.get(text(it.id)) || '';
    };

    const itemById = new Map<string, Item>();
    for (const it of items) itemById.set(text(it.id), it);
    const bundleMembers = new Map<string, Item[]>();
    for (const it of items) {
      const k = bundleKey(it);
      if (!k) continue;
      const list = bundleMembers.get(k);
      if (list) list.push(it);
      else bundleMembers.set(k, [it]);
    }

    /* ── 축 정의 ── */
    const axisByKey = new Map<string, Axis>();
    for (const a of axes) if (a && typeof a.key === 'string') axisByKey.set(a.key, a);

    function axisLabel(key: string): string {
      const a = axisByKey.get(key);
      return (a && text(a.label)) || key;
    }
    /** 그 축에서 고를 수 있는 값. retired 는 새로 못 고름 (이미 달린 항목에는 그대로 보임) */
    function axisPicks(key: string): Array<{ key: string; label: string }> {
      const a = axisByKey.get(key);
      const out: Array<{ key: string; label: string }> = [];
      for (const v of (a && a.values) || []) {
        if (!v || typeof v.key !== 'string' || v.retired) continue;
        out.push({ key: v.key, label: text(v.label) || v.key });
      }
      return out;
    }
    function valueLabel(axisKey: string, value: string): string {
      const a = axisByKey.get(axisKey);
      for (const v of (a && a.values) || []) {
        if (v && v.key === value) return text(v.label) || v.key;
      }
      return value;
    }
    /** `now` 상한. axes.json 의 값이 있으면 그것, 없으면 8 */
    function nowCap(): number {
      const a = axisByKey.get('priority');
      const n = a && a.cap ? a.cap.now : undefined;
      return typeof n === 'number' && n > 0 ? n : NOW_CAP_FALLBACK;
    }

    /* ── 이벤트를 덮은 상태 ──
       `latest` 는 대상별, 갈래별로 가장 늦은 이벤트 하나. 항목 상태는 여기서 계산한다.
       낙관적 갱신도 같은 지도에 이벤트를 하나 넣고 다시 계산하는 것이라 화면이 안 갈라진다. */
    const latest = new Map<string, Map<EvType, DashEvent>>();
    const states = new Map<string, ItemState>();

    function noteEvent(ev: DashEvent): void {
      let m = latest.get(ev.target);
      if (!m) {
        m = new Map<EvType, DashEvent>();
        latest.set(ev.target, m);
      }
      const cur = m.get(ev.type);
      if (!cur || evAt(ev) >= evAt(cur)) m.set(ev.type, ev);
    }

    function baseState(it: Item): ItemState {
      const domain = axisValues(it, 'domain')[0];
      return {
        intent: axisValues(it, 'intent'),
        topic: axisValues(it, 'topic'),
        domain: domain || null,
        priority: axisValues(it, 'priority')[0] || null,
        status: axisValues(it, 'status')[0] || 'unsorted',
        note: text(it.note),
        tagged: false,
      };
    }

    function applyEvent(s: ItemState, ev: DashEvent): void {
      if (ev.type === 'tag') {
        if (Array.isArray(ev.intent)) s.intent = ev.intent.filter((x) => typeof x === 'string');
        if (Array.isArray(ev.topic)) s.topic = ev.topic.filter((x) => typeof x === 'string');
        if (ev.domain !== undefined) s.domain = typeof ev.domain === 'string' ? ev.domain : null;
        s.tagged = true;
        /* tag 가 오면 unsorted 를 tagged 로 올린다. 생성기 applyEvent 와 같은 규칙 */
        if (s.status === 'unsorted') s.status = 'tagged';
      } else if (ev.type === 'priority') {
        s.priority = typeof ev.priority === 'string' ? ev.priority : null;
      } else if (ev.type === 'status') {
        if (typeof ev.status === 'string' && ev.status) s.status = ev.status;
      } else if (ev.type === 'note') {
        s.note = typeof ev.note === 'string' ? ev.note : '';
      }
    }

    function computeState(it: Item): ItemState {
      const s = baseState(it);
      const mine = latest.get(text(it.id));
      const key = bundleKey(it);
      const theirs = key ? latest.get('bundle:' + key) : undefined;
      for (const type of EV_TYPES) {
        const a = mine ? mine.get(type) : undefined;
        const b = theirs ? theirs.get(type) : undefined;
        /* 같은 갈래에 둘 다 있으면 늦은 쪽. 시각이 같으면 개별이 이긴다 */
        const win = !a ? b : !b ? a : evAt(a) >= evAt(b) ? a : b;
        if (win) applyEvent(s, win);
      }
      return s;
    }

    function rebuildStates(only?: Item[]): void {
      for (const it of only || items) states.set(text(it.id), computeState(it));
    }

    /** 이벤트가 닿는 항목들. 낙관적 갱신에서 다시 계산할 범위 */
    function touched(target: string): Item[] {
      if (target.indexOf('bundle:') === 0) return bundleMembers.get(target.slice(7)) || [];
      const it = itemById.get(target);
      return it ? [it] : [];
    }

    function stateOf(it: Item): ItemState {
      return states.get(text(it.id)) || baseState(it);
    }

    /* ── 이벤트 받아오기 ── */
    const skippedMonths: string[] = [];
    let eventCount = 0;

    async function loadEvents(): Promise<void> {
      skippedMonths.length = 0;
      eventCount = 0;
      latest.clear();
      const ref = repo.eventsBranch;
      /* 브랜치 트리 한 번. 빈 폴더를 contents API 로 물으면 404 가 콘솔에 찍히던 소음 제거 (2026-09-13).
         브랜치 자체가 없을 때만 빈 배열 */
      const entries = await repo.tree(ref).catch(() => []);
      type Entry = (typeof entries)[number];
      const prefix = EVENTS_DIR + '/';
      const byMonth = new Map<string, Entry[]>();
      for (const e of entries) {
        if (e.type !== 'file' || e.path.indexOf(prefix) !== 0 || !/\.json$/i.test(e.name)) continue;
        const month = e.path.slice(prefix.length).split('/')[0];
        if (!month) continue;
        const bag = byMonth.get(month);
        if (bag) bag.push(e);
        else byMonth.set(month, [e]);
      }
      const keep = recentMonthKeys(Date.now());
      const dirs = Array.from(byMonth.keys()).filter(
        (name) => keep.indexOf(name) >= 0 || foldedThrough < 0 || monthEndMs(name) > foldedThrough
      );
      /* 달 단위로 병렬. 한 달이 실패해도 나머지는 그린다 (침묵 금지, 아래에서 한 줄로 알림) */
      const perMonth = await Promise.all(
        dirs.map(async (name) => {
          try {
            /* 이름으로는 안 자른다. 자르는 자는 위의 달 폴더뿐 */
            const want = byMonth.get(name) || [];
            const read = await mapLimit(want, EVENT_READ_LIMIT, (f) =>
              repo.readJson<unknown>(f.path, { ref }).catch(() => null)
            );
            return read;
          } catch {
            skippedMonths.push(name);
            return [] as unknown[];
          }
        })
      );
      for (const bag of perMonth) {
        for (const raw of bag) {
          if (!isEvent(raw)) continue;
          if (foldedThrough >= 0 && evAt(raw) <= foldedThrough) continue;
          noteEvent(raw);
          eventCount++;
        }
      }
      rebuildStates();
    }

    await loadEvents();

    /* ── 뼈대 ── */
    const wrap = document.createElement('div');
    wrap.className = 'bm';
    root.textContent = '';
    root.appendChild(wrap);

    /**
     * 지금 판정 대기인가.
     *
     * **재는 것은 결과지 이벤트가 아니다.** 전에는 tag 이벤트가 왔나(`tagged`)로 쟀는데,
     * 그러면 생성기가 이미 의도를 채워 둔 항목이 대기로 남고 (이벤트가 없으니), 반대로
     * 의도를 비운 tag 이벤트는 대기가 아닌 것이 됐다. 지금은 의도가 하나라도 있으면 해제.
     * 버린 것과 승격한 것도 다시 물을 이유 없음.
     */
    function isPending(it: Item): boolean {
      if (!text(it.pending)) return false;
      const s = stateOf(it);
      if (s.intent.length) return false;
      return s.status !== 'dropped' && s.status !== 'promoted';
    }

    const groups: Group[] = [];
    {
      const seen = new Set<string>();
      for (const it of items) if (text(it.src)) seen.add(text(it.src));
      const keys = Array.from(seen).sort(bySrcOrder);
      if (keys.length) {
        groups.push({
          key: 'src',
          label: t('mydash.bm.filter.src', undefined, '출처'),
          values: keys.map((k) => ({ key: k, label: srcLabel(k) })),
        });
      }
    }
    for (const key of FILTER_AXES) {
      const seen = new Set<string>();
      for (const it of items) for (const v of valuesFor(it, key)) seen.add(v);
      if (!seen.size) continue;
      /* axes.json 차례를 먼저 따르고, 정의에 없는 값은 뒤에 붙인다. 미아를 숨기지 않는다. */
      const ordered: string[] = [];
      for (const v of axisPicks(key)) if (seen.has(v.key)) ordered.push(v.key);
      for (const k of Array.from(seen).sort()) if (ordered.indexOf(k) < 0) ordered.push(k);
      groups.push({
        key,
        label: axisLabel(key),
        values: ordered.map((k) => ({ key: k, label: valueLabel(key, k) })),
      });
    }
    for (const key of STATE_AXES) {
      /* 이 두 축은 0건이어도 칩을 세운다. 버림과 승격은 기본 목록에서 빠져 있어
         칩이 없으면 그 항목을 다시 꺼낼 길이 화면에 없다. */
      const picks = axisPicks(key);
      const seen = new Set<string>();
      for (const it of items) for (const v of valuesFor(it, key)) seen.add(v);
      const ordered = picks.map((p) => p.key);
      for (const k of Array.from(seen).sort()) if (ordered.indexOf(k) < 0) ordered.push(k);
      if (!ordered.length) continue;
      groups.push({
        key,
        label: axisLabel(key),
        values: ordered.map((k) => ({ key: k, label: valueLabel(key, k) })),
      });
    }

    /** 그 항목이 그 축에서 가진 값. 이벤트로 바뀌는 축은 덮은 뒤 값 */
    function valuesFor(it: Item, key: string): string[] {
      if (key === 'src') return text(it.src) ? [text(it.src)] : [];
      const s = stateOf(it);
      if (key === 'intent') return s.intent;
      if (key === 'topic') return s.topic;
      if (key === 'domain') return s.domain ? [s.domain] : [];
      if (key === 'status') return [s.status];
      if (key === 'priority') return s.priority ? [s.priority] : [];
      return axisValues(it, key);
    }

    const numHtml: string[] = [
      '<div class="bm-num"><b>' + esc(String(items.length)) + '</b><span>' +
        esc(t('mydash.bm.num.total', undefined, '전체')) + '</span></div>',
    ];
    {
      const bySrc = new Map<string, number>();
      for (const it of items) bySrc.set(text(it.src), (bySrc.get(text(it.src)) || 0) + 1);
      const srcGroup = groups.filter((g) => g.key === 'src')[0];
      for (const v of (srcGroup && srcGroup.values) || []) {
        numHtml.push(
          '<div class="bm-num"><b>' + esc(String(bySrc.get(v.key) || 0)) + '</b><span>' +
            esc(v.label) + '</span></div>'
        );
      }
    }
    numHtml.push(
      '<div class="bm-num" data-pending-num="1"><b>0</b><span>' +
        esc(t('mydash.bm.num.pending', undefined, '판정 대기')) + '</span></div>'
    );

    const parseFailed = (rawSummary.counts && rawSummary.counts.parseFailed) || 0;
    const notes: string[] = [];
    if (parseFailed > 0) {
      notes.push(
        '<div class="tool-status error">' +
          esc(t('mydash.bm.parseFailed', { n: parseFailed }, '못 읽은 줄 {n}건. 생성기 확인')) +
          '</div>'
      );
    }
    if (skippedMonths.length) {
      notes.push(
        '<div class="tool-status error">' +
          esc(
            t(
              'mydash.bm.events.skipped',
              { n: skippedMonths.length, months: skippedMonths.join(', ') },
              '이벤트 {n}달을 못 읽었습니다 ({months}). 그만큼 옛 값으로 보입니다'
            )
          ) +
          '</div>'
      );
    }

    const groupHtml = groups
      .map(
        (g) =>
          '<div><div class="tool-sublabel">' + esc(g.label) + '</div><div class="tool-chips">' +
          g.values
            .map(
              (v) =>
                '<button type="button" class="tool-chip" data-axis="' + esc(g.key) + '" data-value="' +
                esc(v.key) + '">' + esc(v.label) + ' <span data-n="' + esc(g.key) + ':' +
                esc(v.key) + '">0</span></button>'
            )
            .join('') +
          '</div>' +
          (g.key === 'status'
            ? '<div class="tool-hint">' +
              esc(
                t(
                  'mydash.bm.filter.hiddenNote',
                  undefined,
                  '버림과 승격은 기본 목록에서 빠집니다. 칩을 켜야 보입니다'
                )
              ) +
              '</div>'
            : '') +
          '</div>'
      )
      .join('');

    wrap.innerHTML =
      '<div class="bm-main">' +
      notes.join('') +
      '<div class="tool-status" data-evline="1"></div>' +
      /* 머리 줄 하나 (2026-09-19 실측: 핀터레스트 첫 화면 버튼 19, 블루스카이 23, 우리 34). 보기 셋, 검색, 필터.
         대기만과 선택과 한 장 모드는 필터 안. 판정 대기 수는 사이드바가 이미 보인다 */
      '<div class="bm-head-acts">' +
      '<div class="bm-views" role="group">' +
      VIEWS.map((v) =>
        '<button type="button" class="btn btn-ghost" data-act="view" data-view="' + v + '" aria-pressed="false">' +
        esc(viewLabel(v)) + '</button>').join('') +
      '</div>' +
      '<input id="bm-q" class="bm-q" type="search" autocomplete="off" aria-label="' +
      esc(t('mydash.bm.search.label', undefined, '검색')) + '" placeholder="' +
      esc(t('mydash.bm.search.ph', undefined, '제목, 작성자, 메모')) + '">' +
      '<button type="button" class="btn btn-ghost" data-act="filters" data-filters-sum="1" aria-expanded="false"></button>' +
      '</div>' +
      '<div class="bm-filters" data-filters="1" hidden>' +
      '<div class="bm-filters-acts">' +
      '<button type="button" class="btn btn-ghost" data-act="pending" aria-pressed="false"></button>' +
      '<button type="button" class="btn btn-ghost" data-act="select"></button>' +
      '<button type="button" class="btn btn-ghost" data-act="judge"></button>' +
      '</div>' +
      '<div class="bm-nums">' + numHtml.join('') + '</div>' +
      '<div class="bm-groups">' + groupHtml + '</div>' +
      '</div>' +
      '<div class="bm-revisit" data-revisit="1"></div>' +
      '<div class="tool-status" data-count="1"></div>' +
      '<div class="tool-list bm-list" data-list="1"></div>' +
      '<div class="tool-actions" data-more="1">' +
      '<button type="button" class="btn btn-ghost" data-act="more"></button></div>' +
      '<div class="bm-judge" data-judge="1" hidden></div>' +
      '<div class="bm-bar" data-bar="1" hidden></div>' +
      '</div>' +
      '<div class="bm-sheet" data-sheet="1" hidden></div>';

    const qEl = wrap.querySelector('#bm-q') as HTMLInputElement;
    const filtersEl = wrap.querySelector('[data-filters]') as HTMLElement;
    const filtersSumEl = wrap.querySelector('[data-filters-sum]') as HTMLElement;
    /** PC 두 열인가. 옆판이 늘 떠 있고 자판으로 훑는 것은 이 폭에서만 */
    const wideMq = window.matchMedia('(min-width:900px)');
    const isWide = (): boolean => wideMq.matches;
    const evLineEl = wrap.querySelector('[data-evline]') as HTMLElement;
    const revisitEl = wrap.querySelector('[data-revisit]') as HTMLElement;
    const countEl = wrap.querySelector('[data-count]') as HTMLElement;
    const listEl = wrap.querySelector('[data-list]') as HTMLElement;
    const moreEl = wrap.querySelector('[data-more]') as HTMLElement;
    const moreBtn = wrap.querySelector('[data-act="more"]') as HTMLElement;
    const selectBtn = wrap.querySelector('[data-act="select"]') as HTMLElement;
    const judgeBtn = wrap.querySelector('[data-act="judge"]') as HTMLElement;
    const judgeEl = wrap.querySelector('[data-judge]') as HTMLElement;
    const barEl = wrap.querySelector('[data-bar]') as HTMLElement;
    const sheetEl = wrap.querySelector('[data-sheet]') as HTMLElement;
    const searchEl = qEl as HTMLElement;
    const headActsEl = wrap.querySelector('.bm-head-acts') as HTMLElement;

    const picked: Record<string, Set<string>> = {};
    for (const g of groups) picked[g.key] = new Set<string>();
    const opened = new Set<string>();
    let query = '';
    let shown = PAGE;
    /** 옆판이 보고 있는 줄. 자판 위아래가 이 줄에서 움직인다 */
    let curId = '';
    /* 보기. 사이드바 "판정 대기" 로 들어오면 대기만 걸러 폰은 피드, PC 는 격자 (사용자 2026-09-19) */
    const judgeMode = ctx.mode === 'judge';
    let pendingOnly = judgeMode;
    let view: View = judgeMode ? (isWide() ? 'grid' : 'feed') : readView();
    /** 피드 카드마다 고른 의도. 저장 전까지 여기 */
    const feedPicks = new Map<string, Set<string>>();
    /** 피드에서 방금 저장한 카드. 흐리게 두고 다음으로 */
    const feedDone = new Set<string>();

    function readView(): View {
      try {
        const v = window.localStorage.getItem(VIEW_KEY) as View | null;
        return v && VIEWS.indexOf(v) >= 0 ? v : 'list';
      } catch {
        return 'list';
      }
    }
    function setView(v: View): void {
      view = v;
      try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* 저장 막힌 브라우저 */ }
      shown = PAGE;
      paint();
      paintSheet();
    }

    /* 선택 모드. 고른 것과 바에서 고른 의도 */
    let selectMode = false;
    const selected = new Set<string>();
    const barIntent = new Set<string>();
    let barBusy = '';

    /* 한 장 모드 */
    type Judge = { list: Item[]; at: number; picks: Set<string>; lastAuthor: string; lastIntent: string[] };
    let judge: Judge | null = null;

    /* 시트 */
    let sheet: SheetTarget | null = null;
    let draft: ItemState | null = null;
    let draftBase: ItemState | null = null;
    let sheetMsg = '';
    let sheetMsgBad = false;
    let showNowList = false;

    /* ── 쓰기 ──
       파일 이름의 epoch 가 겹치면 putNewJson 이 던진다 (append 전용). 한 번 저장에 최대
       네 벌이 나가므로 시각을 세션 안에서 단조 증가로 뽑는다. */
    let lastStamp = 0;
    function nextStamp(): number {
      const now = Date.now();
      lastStamp = now > lastStamp ? now : lastStamp + 1;
      return lastStamp;
    }

    /** 보낼 이벤트 한 벌. 경로는 만들 때 정해진다 (파일 이름이 곧 시각과 기기와 탭) */
    type Outgoing = { ev: DashEvent; path: string };

    /** `<epoch-ms>-<device6>-<nonce4>.json`. nonce 는 셸이 탭마다 하나 만든다 */
    function eventPath(ms: number): string {
      return (
        EVENTS_DIR + '/' + monthKey(ms) + '/' + ms + '-' + repo.deviceId + '-' + repo.nonce + '.json'
      );
    }

    function makeEvent(type: EvType, target: string, fields: Partial<DashEvent>): Outgoing {
      const ms = nextStamp();
      const ev: DashEvent = {
        v: EVENT_V,
        at: new Date(ms).toISOString(),
        device: repo.deviceId,
        type,
        target,
      };
      if (fields.intent) ev.intent = fields.intent;
      if (fields.topic) ev.topic = fields.topic;
      if (fields.domain !== undefined) ev.domain = fields.domain;
      if (fields.priority !== undefined) ev.priority = fields.priority;
      if (fields.status !== undefined) ev.status = fields.status;
      if (fields.note !== undefined) ev.note = fields.note;
      return { ev, path: eventPath(ms) };
    }

    /** 같은 이벤트를 새 시각으로 다시. `nextStamp` 가 단조 증가라 경로가 반드시 달라진다 */
    function restamp(out: Outgoing): Outgoing {
      const ms = nextStamp();
      const ev: DashEvent = { ...out.ev, at: new Date(ms).toISOString() };
      return { ev, path: eventPath(ms) };
    }

    /** `collided` 는 새 시각으로 다시 보내도 또 이미 있는 것. 사람이 다시 눌러야 한다 */
    type SendResult = 'sent' | 'queued' | 'denied' | 'collided';

    function applySent(ev: DashEvent): void {
      noteEvent(ev);
      rebuildStates(touched(ev.target));
    }

    /**
     * 이벤트 하나 보내기. 네트워크 실패는 큐로, 권한 없음과 이미 있음은 큐에 안 남김.
     * 보냈든 큐에 넣었든 화면은 바로 갱신 (낙관적).
     *
     * 이미 있음(422)을 큐에 넣으면 안 된다. 재전송해도 같은 422 고, 셸 outbox 는 그것을
     * 보낸 것으로 치고 버린다. 그래서 이벤트가 조용히 사라진다. nonce 가 붙은 뒤로는
     * 같은 탭에서 같은 ms 가 두 번 나올 때만 나므로, 새 시각으로 **한 번만** 다시 보냄.
     */
    async function sendEvent(out: Outgoing): Promise<SendResult> {
      const first = await putOnce(out);
      if (first !== 'collided') return first;
      const again = await putOnce(restamp(out));
      return again;
    }

    async function putOnce(out: Outgoing): Promise<SendResult> {
      const { ev, path } = out;
      const message = 'dash: ' + ev.type + ' ' + ev.target;
      try {
        await repo.putNewJson(path, ev, message);
        applySent(ev);
        return 'sent';
      } catch (e) {
        if (isPermError(e)) return 'denied';
        if (isExistsError(e)) return 'collided';
        repo.enqueueJson(path, ev, message);
        applySent(ev);
        return 'queued';
      }
    }

    function sendWord(r: SendResult): string {
      if (r === 'sent') return t('mydash.bm.save.ok', undefined, '저장함');
      if (r === 'queued') {
        return t('mydash.bm.save.queued', undefined, '네트워크 실패. 큐에 넣었고 다음에 다시 보냅니다');
      }
      if (r === 'collided') {
        return t('mydash.bm.save.collided', undefined, '같은 시각 충돌, 다시 저장');
      }
      return t(
        'mydash.bm.save.denied',
        undefined,
        '쓰기 권한이 없습니다. GitHub App 권한 Contents 를 Read & write 로 바꾸고 설치에서 승인하세요'
      );
    }

    /** 보내기가 안 끝난 것. 화면이 선택을 안 비우고, 사람에게 말을 남기는 갈래 */
    function isBad(r: SendResult): boolean {
      return r === 'denied' || r === 'collided';
    }

    /* ── 고르기 ── */
    function matches(it: Item): boolean {
      if (pendingOnly && !isPending(it)) return false;
      const s = stateOf(it);
      /* 버림과 승격은 아카이브다. 필터를 안 켜면 기본 목록에서 뺀다 */
      if (!picked.status || !picked.status.size) {
        if (HIDDEN_STATUS.indexOf(s.status) >= 0) return false;
      }
      for (const g of groups) {
        const set = picked[g.key];
        if (!set.size) continue;
        const vals = valuesFor(it, g.key);
        let hit = false;
        for (const v of vals) {
          if (set.has(v)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
      if (query) {
        /* 보이는 글자를 그대로 찾는다. label 이 빈 항목은 화면에 대체 문자열이 떠 있어
           원본 label 로만 재면 눈에 보이는 말로 못 찾는다. */
        const m = mediaOf(it);
        const body = m ? [m.text, m.title, m.description, m.who && m.who.name].map(text).join(' ') : '';
        const hay = (displayLabel(it, s.note) + ' ' + text(it.author) + ' ' + s.note + ' ' + body).toLowerCase();
        if (hay.indexOf(query) < 0) return false;
      }
      return true;
    }

    /** 기록일 내림차순. 날짜가 없는 것은 뒤로 */
    function byRecent(a: Item, b: Item): number {
      const x = text(a.recordedAt);
      const y = text(b.recordedAt);
      if (x !== y) return x && y ? (x < y ? 1 : -1) : x ? -1 : 1;
      return text(a.id) < text(b.id) ? -1 : 1;
    }

    /** 묶음으로 접는다. 크기 2 이상만 묶음이고 나머지는 낱개 */
    function unitsOf(list: Item[]): Unit[] {
      const out: Unit[] = [];
      const at = new Map<string, number>();
      for (const it of list) {
        const key = bundleKey(it);
        if (!key) {
          out.push({ key: '', items: [it] });
          continue;
        }
        const seen = at.get(key);
        if (seen === undefined) {
          at.set(key, out.length);
          out.push({ key, items: [it] });
        } else {
          out[seen].items.push(it);
        }
      }
      return out;
    }

    /* ── 줄 그리기 ── */
    function titleHtml(it: Item): string {
      const s = stateOf(it);
      const label = headOf(it, s.note) || text(it.id);
      const url = safeLinkUrl(it.url);
      if (!url) {
        /* 주소가 있는데 거부된 것과, 애초에 주소가 없는 것을 가른다. 거부는 표식으로 말한다 */
        const mark = text(it.url).trim()
          ? '<span class="bm-badurl">' + esc(t('mydash.bm.badUrl', undefined, '주소 열 수 없음')) + '</span>'
          : '';
        return '<span class="bm-title">' + esc(label) + mark + '</span>';
      }
      return (
        '<a class="bm-title" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(label) + '</a>'
      );
    }

    function metaHtml(it: Item): string {
      const s = stateOf(it);
      const bits: string[] = [];
      const author = text(it.author);
      if (author) bits.push('<span>' + esc(author) + '</span>');
      const day = text(it.recordedAt).slice(0, 10);
      if (day) bits.push('<span>' + esc(day) + '</span>');
      if (isPending(it)) {
        bits.push(
          '<span class="tool-chip">' + esc(t('mydash.bm.pendingChip', undefined, '판정 대기')) + '</span>'
        );
      } else {
        for (const v of s.intent) {
          bits.push('<span class="tool-chip">' + esc(valueLabel('intent', v)) + '</span>');
        }
      }
      if (s.priority) {
        bits.push('<span class="tool-chip">' + esc(valueLabel('priority', s.priority)) + '</span>');
      }
      if (s.status !== 'unsorted' && s.status !== 'tagged') {
        bits.push('<span class="tool-chip">' + esc(valueLabel('status', s.status)) + '</span>');
      }
      return '<div class="bm-meta">' + bits.join('') + '</div>';
    }

    /** 시트를 여는 버튼. 선택 모드에서는 칸을 누르는 것이 일이라 안 그린다 */
    function openBtnHtml(target: string): string {
      if (selectMode) return '';
      return (
        '<div class="tool-actions tight bm-open"><button type="button" class="btn btn-ghost" ' +
        'data-act="open" data-target="' + esc(target) + '">' +
        esc(t('mydash.bm.row.open', undefined, '분류')) + '</button></div>'
      );
    }

    function checkHtml(it: Item): string {
      if (!selectMode) return '';
      const on = selected.has(text(it.id)) ? ' checked' : '';
      return (
        '<input type="checkbox" class="bm-check" data-pick="' + esc(text(it.id)) + '"' + on +
        ' aria-label="' + esc(displayLabel(it, stateOf(it).note)) + '">'
      );
    }

    function rowHtml(it: Item, extra: string): string {
      const cls =
        'tool-list-row bm-row' + (extra ? ' ' + extra : '') + (selectMode ? ' is-pick' : '') +
        (curId === text(it.id) ? ' is-cur' : '');
      const rowAct = selectMode ? ' data-act="pick" data-id="' + esc(text(it.id)) + '"' : ' data-act="row"';
      return (
        '<div class="' + cls + '"' + rowAct + ' data-row="' + esc(text(it.id)) + '">' +
        checkHtml(it) +
        '<div class="tool-list-key">' + esc(srcLabel(text(it.src))) + '</div>' +
        thumbHtml(it) +
        '<div class="tool-list-val bm-body">' + titleHtml(it) + subHtml(it) + metaHtml(it) +
        openBtnHtml(text(it.id)) + '</div>' +
        '</div>'
      );
    }

    /** 줄 왼쪽 썸네일. 없으면 자리도 없다 (글만 있는 줄이 밀리지 않게) */
    function thumbHtml(it: Item): string {
      const u = thumbOf(it);
      if (!u) return '';
      return '<img class="bm-thumb" src="' + esc(u) + '" alt="" loading="lazy" decoding="async">';
    }

    function subHtml(it: Item): string {
      const sub = subOf(it);
      if (!sub) return '';
      return '<div class="bm-sub">' + esc(sub) + '</div>';
    }

    /** 카드가 보이는 사진 (첫 장) 과 나머지 수 */
    function firstPic(it: Item, size: 'small' | 'medium'): { url: string; more: number; w?: number; h?: number } | null {
      const m = mediaOf(it);
      if (!m) return null;
      const ph = m.photos && m.photos.length ? m.photos[0] : null;
      if (ph && ph.url) return { url: picUrl(ph.url, size), more: (m.photos as MediaPhoto[]).length - 1, w: ph.w, h: ph.h };
      if (m.video && m.video.poster) return { url: picUrl(m.video.poster, size), more: 0 };
      const img = m.image ? safeLinkUrl(m.image) : '';
      return img ? { url: img, more: 0 } : null;
    }

    function whoOf(it: Item): string {
      const m = mediaOf(it);
      if (m && m.kind === 'tweet' && m.who) {
        return [text(m.who.name), m.who.handle ? '@' + text(m.who.handle) : ''].filter(Boolean).join(' ');
      }
      if (text(it.author)) return text(it.author);
      return hostOf(it.url);
    }

    /**
     * 피드 카드 (트위터 식). 누가와 출처, 내가 쓴 말, 원문, 사진, 아래 판정 셋과 의도 칩.
     * 저장한 카드는 흐려지고 다음 카드로. 카드 어디를 눌러도 옆판 (버튼 제외)
     */
    function cardHtml(it: Item): string {
      const id = text(it.id);
      const s = stateOf(it);
      const m = mediaOf(it);
      const said = text(it.src) === 'kakao' ? text(it.label).trim() : '';
      const memo = text(s.note).trim();
      const body = m && m.kind === 'tweet' ? text(m.text).trim() : m && m.kind === 'page' ? text(m.description).trim() : '';
      const title = m && m.kind === 'page' ? text(m.title).trim() : '';
      const pic = firstPic(it, 'medium');
      const picks = feedPicks.get(id) || new Set(s.intent);
      const cls = 'bm-card' + (feedDone.has(id) ? ' is-done' : '') + (curId === id ? ' is-cur' : '');
      const parts: string[] = [];
      parts.push(
        '<div class="bm-card-head"><span class="bm-card-who">' + esc(whoOf(it)) + '</span>' +
        '<span class="bm-card-src">' + esc(srcLabel(text(it.src))) + ' ' + esc(text(it.recordedAt).slice(0, 10)) + '</span></div>'
      );
      if (said) parts.push('<div class="bm-said">' + esc(said) + '</div>');
      if (memo && memo !== said) parts.push('<div class="bm-said bm-said-memo">' + esc(memo) + '</div>');
      if (title && title !== said && title !== text(it.label).trim()) parts.push('<div class="bm-ptitle">' + esc(title) + '</div>');
      if (!said && !title && !body && !pic) parts.push('<div class="bm-ptitle">' + esc(displayLabel(it, s.note)) + '</div>');
      if (body) parts.push('<div class="bm-tw">' + esc(body) + '</div>');
      if (m && m.kind === 'tweet' && m.deleted) {
        parts.push('<div class="tool-hint">' + esc(t('mydash.bm.media.deleted', undefined, 'X 에서 못 받음. 지워졌거나 로그인이 필요한 트윗')) + '</div>');
      }
      if (pic) {
        const ratio = pic.w && pic.h ? ' style="aspect-ratio:' + Number(pic.w) + '/' + Number(pic.h) + '"' : '';
        parts.push(
          '<div class="bm-card-pic"><img class="bm-pic" src="' + esc(pic.url) + '" alt="" loading="lazy" decoding="async"' + ratio + '>' +
          (pic.more > 0 ? '<span class="bm-card-more">+' + pic.more + '</span>' : '') + '</div>'
        );
      }
      const url = safeLinkUrl(it.url);
      if (url) {
        parts.push('<a class="bm-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a>');
      }
      parts.push(
        '<div class="bm-card-acts">' +
        '<button type="button" class="btn btn-ghost bm-act bm-act-drop" data-act="c-drop" data-id="' + esc(id) + '">' +
        esc(valueLabel('status', 'dropped')) + '</button>' +
        '<button type="button" class="btn btn-ghost bm-act bm-act-keep" data-act="c-keep" data-id="' + esc(id) + '">' +
        esc(t('mydash.bm.card.keep', undefined, '둔다')) + '</button>' +
        '<button type="button" class="btn btn-ghost bm-act bm-act-now" data-act="c-now" data-id="' + esc(id) + '">' +
        esc(valueLabel('priority', 'now')) + '</button>' +
        '</div>' +
        '<div class="bm-card-tags">' +
        axisPicks('intent').slice(0, FEED_TAGS).map((p) =>
          '<button type="button" class="tool-chip' + (picks.has(p.key) ? ' active' : '') +
          '" data-act="c-intent" data-id="' + esc(id) + '" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>').join('') +
        '<button type="button" class="tool-chip" data-act="open" data-target="' + esc(id) + '">' +
        esc(t('mydash.bm.card.more', undefined, '더')) + '</button>' +
        '</div>' +
        '<div class="tool-status" data-cmsg="' + esc(id) + '"></div>'
      );
      return '<article class="' + cls + '" data-row="' + esc(id) + '" data-act="row">' + parts.join('') + '</article>';
    }

    /** 격자 타일 (핀터레스트 식). 사진이 타일, 없으면 글 타일. 누르면 옆판, 위에 버림과 지금 */
    /** 카드와 타일의 제목. 트윗은 본문이 없으면 비운다. AI 가 지은 라벨을 원문 자리에 안 놓는다 */
    function capOf(it: Item, note: string): string {
      const m = mediaOf(it);
      if (m && m.kind === 'tweet' && !m.deleted) return text(m.text).trim().split('\n')[0];
      return headOf(it, note);
    }

    function tileHtml(it: Item): string {
      const id = text(it.id);
      const s = stateOf(it);
      const pic = firstPic(it, 'small');
      const head = capOf(it, s.note) || (pic ? '' : headOf(it, s.note));
      const cls = 'bm-tile' + (pic ? '' : ' is-text') + (curId === id ? ' is-cur' : '') + (feedDone.has(id) ? ' is-done' : '');
      const ratio = pic && pic.w && pic.h ? ' style="aspect-ratio:' + Number(pic.w) + '/' + Number(pic.h) + '"' : '';
      return (
        '<figure class="' + cls + '" data-row="' + esc(id) + '" data-act="row">' +
        (pic
          ? '<img src="' + esc(pic.url) + '" alt="" loading="lazy" decoding="async"' + ratio + '>'
          : '<div class="bm-tile-text">' + esc(head) + '</div>') +
        '<figcaption>' +
        (pic && head ? '<div class="bm-tile-cap">' + esc(head) + '</div>' : '') +
        '<div class="bm-tile-meta">' + esc(whoOf(it)) +
        (isPending(it) ? ' <b>' + esc(t('mydash.bm.pendingChip', undefined, '판정 대기')) + '</b>' : '') +
        (s.priority ? ' <span>' + esc(valueLabel('priority', s.priority)) + '</span>' : '') +
        '</div></figcaption>' +
        '<div class="bm-tile-acts">' +
        '<button type="button" class="bm-tile-btn" data-act="c-drop" data-id="' + esc(id) + '" title="' + esc(valueLabel('status', 'dropped')) + '">' +
        esc(valueLabel('status', 'dropped')) + '</button>' +
        '<button type="button" class="bm-tile-btn" data-act="c-now" data-id="' + esc(id) + '" title="' + esc(valueLabel('priority', 'now')) + '">' +
        esc(valueLabel('priority', 'now')) + '</button>' +
        '</div></figure>'
      );
    }

    /** 피드와 격자의 한 손 판정. 보내고, 카드를 흐리게, 다음 카드로 */
    async function cardJudge(id: string, out: Outgoing): Promise<void> {
      const r = await sendEvent(out);
      const msgEl = listEl.querySelector('[data-cmsg="' + id + '"]') as HTMLElement | null;
      if (isBad(r)) {
        if (msgEl) { msgEl.textContent = sendWord(r); msgEl.classList.add('error'); }
        return;
      }
      feedDone.add(id);
      feedPicks.delete(id);
      const ids = visibleRowIds();
      const at = ids.indexOf(id);
      paint();
      paintHead();
      if (at >= 0 && at + 1 < ids.length) {
        const next = listEl.querySelector('[data-row="' + ids[at + 1] + '"]') as HTMLElement | null;
        if (next && typeof next.scrollIntoView === 'function') next.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }

    function unitHtml(u: Unit): string {
      if (u.items.length < 2) return rowHtml(u.items[0], '');
      const isOpen = opened.has(u.key);
      const head0 = u.items[0];
      /* 머리 줄도 항목 하나. 자식과 같은 meta (날짜, 작성자, 의도 칩, 판정 대기 칩) 를 부착.
         접힌 상태에서 보이는 것이 이 줄뿐이라, 빠지면 묶음 첫 항목만 정보 결여. */
      const head =
        '<div class="tool-list-row bm-row' + (selectMode ? ' is-pick' : '') +
        (curId === text(head0.id) ? ' is-cur' : '') + '"' +
        (selectMode ? ' data-act="pick" data-id="' + esc(text(head0.id)) + '"' : ' data-act="row"') +
        ' data-row="' + esc(text(head0.id)) + '">' +
        checkHtml(head0) +
        '<div class="tool-list-key">' + esc(srcLabel(text(head0.src))) + '</div>' +
        thumbHtml(head0) +
        '<div class="tool-list-val bm-body">' +
        titleHtml(head0) +
        subHtml(head0) +
        metaHtml(head0) +
        '<div class="tool-actions tight"><button type="button" class="btn btn-ghost" data-act="bundle" ' +
        'data-key="' + esc(u.key) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        esc(t('mydash.bm.bundle', { n: u.items.length }, '묶음 {n}건')) + ' ' +
        esc(
          isOpen
            ? t('mydash.bm.bundleClose', undefined, '접기')
            : t('mydash.bm.bundleOpen', undefined, '펼치기')
        ) +
        '</button>' +
        (selectMode
          ? ''
          : '<button type="button" class="btn btn-ghost" data-act="open" data-target="bundle:' +
            esc(u.key) + '">' +
            esc(t('mydash.bm.row.openBundle', undefined, '묶음 분류')) + '</button>') +
        '</div></div></div>';
      if (!isOpen) return head;
      return head + u.items.slice(1).map((it) => rowHtml(it, 'bm-kid')).join('');
    }

    /* ── 재발굴 한 칸 ──
       방치일수는 **날것으로 재면 안 됨**. 출처마다 모은 기간이 다름 (실측 2026-09-10:
       카톡은 2025-08 부터 1년치, X 와 브라우저는 2026-08 한 주치). 날것 점수로는
       상위 8건이 영원히 카톡 고정.

       방치일수를 **그 출처 안에서** 0~1 로 정규화하는 것만으로도 미해결. 정규화 점수로
       한 줄 세워 상위 40 을 끊으면 폭이 좁은 출처가 독점 (실측 2026-09-10: 브라우저
       82건이 전부 같은 날짜라 폭이 0, 만점 처리 시 후보 40 이 전부 브라우저. 폭 0 을 0.5 로
       낮추면 이번엔 X 39 에 카톡 1). 한 자로 재서 한 줄로 세우는 한 데이터가 제일 고른
       출처의 독점.

       그래서 순위는 **출처 안에서만** 매기고, 후보 40 은 출처를 번갈아 채움 (실측 결과
       브라우저 14, 카톡 13, X 13). 점수는 정규화 방치도 / 공유 횟수, 공유 횟수는 `shared`
       배열 길이 (없으면 1).

       고르기는 날짜 씨앗이라 같은 후보 목록에서 같은 날 같은 자리를 지정. 다만 보여 준 id 를
       그 자리에서 기록해, 같은 날 다시 열면 그 다음 것이 노출. 필터와 무관하게 전체 대상.
       버린 것과 승격한 것은 후보에서 뺌 (다시 파낼 이유 없음). */
    function revisitPool(): Item[] {
      const live = items.filter((it) => HIDDEN_STATUS.indexOf(stateOf(it).status) < 0);
      const lo = new Map<string, number>();
      const hi = new Map<string, number>();
      for (const it of live) {
        const days = idleDays(it.recordedAt);
        if (days < 0) continue;
        const src = text(it.src);
        const a = lo.get(src);
        const b = hi.get(src);
        if (a === undefined || days < a) lo.set(src, days);
        if (b === undefined || days > b) hi.set(src, days);
      }
      const bySrc = new Map<string, Array<{ it: Item; score: number }>>();
      for (const it of live) {
        const days = idleDays(it.recordedAt);
        if (days < 0) continue;
        const src = text(it.src);
        const a = lo.get(src) as number;
        const b = hi.get(src) as number;
        const span = b - a;
        /* 한 출처의 날짜가 하나뿐이면 나눌 폭이 없다. 그 출처 안에서는 전부 같은 값이고
           출처끼리는 안 겨루므로 만점으로 둔다 */
        const norm = span > 0 ? (days - a) / span : 1;
        const shared = Array.isArray(it.shared) ? it.shared.length : 0;
        const row = { it, score: norm / (shared > 0 ? shared : 1) };
        const list = bySrc.get(src);
        if (list) list.push(row);
        else bySrc.set(src, [row]);
      }
      const srcs = Array.from(bySrc.keys()).sort(bySrcOrder);
      for (const s of srcs) {
        (bySrc.get(s) as Array<{ it: Item; score: number }>).sort((x, y) =>
          y.score !== x.score ? y.score - x.score : text(x.it.id) < text(y.it.id) ? -1 : 1
        );
      }
      const pool: Item[] = [];
      for (let i = 0; pool.length < REVISIT_POOL; i++) {
        let added = false;
        for (const s of srcs) {
          const list = bySrc.get(s) as Array<{ it: Item; score: number }>;
          if (i >= list.length) continue;
          pool.push(list[i].it);
          added = true;
          if (pool.length >= REVISIT_POOL) break;
        }
        if (!added) break;
      }
      return pool;
    }

    function revisitPick(): Item | null {
      const pool = revisitPool();
      if (!pool.length) return null;
      /* 이 기기에서 이미 보여 준 것은 후보 뒤로. 전부 봤으면 다시 처음부터 돈다 */
      const seen = new Set(seenIds());
      const fresh = pool.filter((it) => !seen.has(text(it.id)));
      const use = fresh.length ? fresh : pool;
      const seed = kstDayKey(Date.now());
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      return use[h % use.length];
    }

    let revisitId = '';
    function paintRevisit(): void {
      const it = revisitId ? itemById.get(revisitId) || revisitPick() : revisitPick();
      if (!it) {
        revisitEl.textContent = '';
        return;
      }
      revisitId = text(it.id);
      const days = idleDays(it.recordedAt);
      revisitEl.innerHTML =
        '<div class="tool-sublabel">' + esc(t('mydash.bm.revisit', undefined, '재발굴')) + '</div>' +
        '<div class="tool-list">' + rowHtml(it, '') + '</div>' +
        '<div class="tool-hint">' + esc(t('mydash.bm.revisitIdle', { n: days }, '{n}일 방치')) + '</div>';
      markSeen(revisitId);
    }

    /* ── 우선순위 상한 ──
       `now` 는 자리가 여덟이다. 아홉 번째를 올리려 하면 지금 여덟을 보여 하나를 내리게 한다.
       화면이 지킨다 (저장소에는 규칙이 없다). */
    function nowItems(exclude: Set<string>): Item[] {
      return items.filter((it) => stateOf(it).priority === 'now' && !exclude.has(text(it.id)));
    }

    /* ── 칩 숫자 ── */
    function paintChipCounts(): void {
      const tally = new Map<string, number>();
      for (const it of items) {
        for (const g of groups) {
          for (const v of valuesFor(it, g.key)) {
            const k = g.key + ':' + v;
            tally.set(k, (tally.get(k) || 0) + 1);
          }
        }
      }
      const spans = Array.from(wrap.querySelectorAll('[data-n]')) as HTMLElement[];
      for (const s of spans) s.textContent = String(tally.get(s.getAttribute('data-n') || '') || 0);
    }

    function paintHead(): void {
      const n = items.filter(isPending).length;
      const num = wrap.querySelector('[data-pending-num] b') as HTMLElement | null;
      if (num) num.textContent = String(n);
      judgeBtn.textContent = t('mydash.bm.act.judge', { n }, '판정 대기 {n}건');
      (judgeBtn as HTMLButtonElement).disabled = n === 0 && !judge;
      selectBtn.textContent = selectMode
        ? t('mydash.bm.act.selectOff', undefined, '선택 끄기')
        : t('mydash.bm.act.select', undefined, '선택');
      let on = 0;
      for (const g of groups) on += picked[g.key].size;
      filtersSumEl.textContent = on
        ? t('mydash.bm.filter.sumOn', { n: on }, '필터 {n}')
        : t('mydash.bm.filter.sum', undefined, '필터');
      evLineEl.textContent = eventCount
        ? t('mydash.bm.events.applied', { n: eventCount }, '이벤트 {n}건 반영')
        : '';
      evLineEl.hidden = !eventCount;
    }

    function paint(): void {
      const chipEls = Array.from(wrap.querySelectorAll('.bm-groups .tool-chip')) as HTMLElement[];
      for (const b of chipEls) {
        const axis = b.getAttribute('data-axis') || '';
        const value = b.getAttribute('data-value') || '';
        b.classList.toggle('active', !!picked[axis] && picked[axis].has(value));
      }
      const list = items.filter(matches).sort(byRecent);
      const units = unitsOf(list);
      /* 건수 줄과 더 보기가 서로 다른 것을 세면 숫자가 안 맞는다 (전에는 항목 수와 묶음 수).
         둘 다 항목 수와 묶음 수를 같이 보인다. shown 이 세는 것은 묶음이다. */
      countEl.textContent = t(
        'mydash.bm.count',
        { n: list.length, m: units.length },
        '항목 {n} (묶음 {m})'
      );
      const empty =
        '<div class="tool-list-row"><div class="tool-list-val">' +
        esc(t('mydash.bm.noMatch', undefined, '조건에 맞는 것이 없습니다')) +
        '</div></div>';
      listEl.className = 'tool-list bm-list bm-view-' + view;
      wrap.classList.toggle('is-feed', view === 'feed');
      if (view === 'list') {
        listEl.innerHTML = units.slice(0, shown).map(unitHtml).join('') || empty;
      } else if (view === 'feed') {
        /* 피드와 격자는 묶음을 안 접는다. 한 장이 한 항목. 못 받은 트윗 (지워짐, 로그인 필요) 은
           볼 것이 없어 뒤로. 판정 대기 453 중 142 가 그것이라 앞에 두면 첫 화면이 빈 카드 (2026-09-19 실측) */
        const gone = (it: Item): boolean => { const m = mediaOf(it); return !!(m && m.kind === 'tweet' && m.deleted); };
        const live = list.filter((it) => !gone(it));
        const dead = list.filter(gone);
        listEl.innerHTML = live.concat(dead).slice(0, shown).map(cardHtml).join('') || empty;
      } else {
        /* 격자는 그림이 주인공. 그림 있는 것을 앞에, 글만 있는 것은 뒤에 (각각 최근순 유지) */
        const withPic = list.filter((it) => !!firstPic(it, 'small'));
        const noPic = list.filter((it) => !firstPic(it, 'small'));
        listEl.innerHTML = withPic.concat(noPic).slice(0, shown).map(tileHtml).join('') || empty;
      }
      /* 재발굴 칸은 목록 보기에서만. 피드와 격자는 넘기는 화면이라 위에 딴 것을 안 둔다 */
      revisitEl.hidden = view !== 'list' || pendingOnly;
      const viewBtns = Array.from(wrap.querySelectorAll('[data-act="view"]')) as HTMLElement[];
      for (const b of viewBtns) b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false');
      const pendBtn = wrap.querySelector('[data-act="pending"]') as HTMLElement | null;
      if (pendBtn) {
        pendBtn.setAttribute('aria-pressed', pendingOnly ? 'true' : 'false');
        pendBtn.textContent = t('mydash.bm.act.pendingOnly', undefined, '대기만');
      }
      const restUnits = (view === 'list' ? units.length : list.length) - shown;
      const restItems = view === 'list' ? units.slice(shown).reduce((n, u) => n + u.items.length, 0) : Math.max(0, restUnits);
      moreEl.style.display = restUnits > 0 ? '' : 'none';
      if (restUnits > 0) {
        moreBtn.textContent = t(
          'mydash.bm.more',
          { n: restItems, m: restUnits },
          '더 보기 항목 {n} (묶음 {m})'
        );
      }
      paintChipCounts();
      paintHead();
      paintBar();
    }

    /* ── 시트 ──
       화면 아래에서 올라오고, 저장은 **바뀐 축만** 이벤트로 낸다. 한 번에 최대 네 벌
       (tag, priority, status, note). */

    function openSheet(target: string): void {
      const list = touched(target);
      if (!list.length) return;
      sheet = { target, items: list, bundle: target.indexOf('bundle:') === 0 };
      if (!sheet.bundle) setCur(target);
      const s = stateOf(list[0]);
      draftBase = { intent: s.intent.slice(), topic: s.topic.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged };
      draft = { intent: s.intent.slice(), topic: s.topic.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged };
      sheetMsg = '';
      sheetMsgBad = false;
      showNowList = false;
      paintSheet();
    }

    function closeSheet(): void {
      sheet = null;
      draft = null;
      draftBase = null;
      paintSheet();
    }

    /** 옆판이 보는 줄 바꾸기. 목록은 다시 안 그리고 표식만 옮긴다 */
    function setCur(id: string): void {
      if (curId === id) return;
      curId = id;
      const rows = Array.from(wrap.querySelectorAll('[data-row]')) as HTMLElement[];
      for (const r of rows) r.classList.toggle('is-cur', r.getAttribute('data-row') === id);
    }

    /** 지금 화면에 있는 줄의 id 차례 (접힌 묶음은 머리 줄만). 자판 위아래가 도는 줄 */
    function visibleRowIds(): string[] {
      const rows = Array.from(listEl.querySelectorAll('[data-row]')) as HTMLElement[];
      return rows.map((r) => r.getAttribute('data-row') || '').filter((x) => !!x);
    }

    /** 위아래로 한 줄. 끝이면 그대로. 옆판이 그 줄을 보고 목록이 그 줄까지 스크롤 */
    function moveCur(delta: number): void {
      const ids = visibleRowIds();
      if (!ids.length) return;
      const at = ids.indexOf(curId);
      const next = at < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + delta));
      const id = ids[next];
      openSheet(id);
      const row = listEl.querySelector('[data-row="' + id + '"]') as HTMLElement | null;
      if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
    }

    /** 자판 숫자 하나가 무엇인가. 우선순위 값 차례대로, 그 다음 수가 버림 */
    function keyPicks(): Array<{ key: string; label: string; act: 'prio' | 'drop' }> {
      const out: Array<{ key: string; label: string; act: 'prio' | 'drop' }> = [];
      for (const p of axisPicks('priority')) out.push({ key: p.key, label: p.label, act: 'prio' });
      out.push({ key: 'dropped', label: valueLabel('status', 'dropped'), act: 'drop' });
      return out;
    }

    function keysHtml(): string {
      if (!isWide()) return '';
      const picks = keyPicks()
        .map((p, i) => '<kbd>' + (i + 1) + '</kbd> ' + esc(p.label))
        .join(' ');
      return (
        '<div class="bm-keys"><kbd>\u2191</kbd><kbd>\u2193</kbd> ' +
        esc(t('mydash.bm.keys.move', undefined, '이동')) + ' ' + picks + ' <kbd>Enter</kbd> ' +
        esc(t('mydash.bm.sheet.save', undefined, '저장')) + ' <kbd>Esc</kbd> ' +
        esc(t('mydash.bm.sheet.close', undefined, '닫기')) + '</div>'
      );
    }

    /**
     * 옆판 세 층 (MVP 5, 사용자 2026-09-19 "원문 그대로가 먼저").
     * 1 내가 쓴 말: 카톡 라벨 (내 설명) 과 메모. 2 실제 내용: 트윗 본문과 그림 전부, 페이지는
     * 제목과 설명과 그림. 3 AI 분류: 접힘. 아래 편집 칩과 겹치는 의도와 영역은 제외
     */
    function layersHtml(it: Item, note: string, url: string): string {
      const m = mediaOf(it);
      const out: string[] = [];
      const said = text(it.src) === 'kakao' ? text(it.label).trim() : '';
      const memo = text(note).trim();
      if (said || memo) {
        out.push(
          '<div class="bm-layer"><div class="tool-sublabel">' +
          esc(t('mydash.bm.layer.mine', undefined, '내가 쓴 말')) + '</div>' +
          (said ? '<div class="bm-said">' + esc(said) + '</div>' : '') +
          (memo && memo !== said ? '<div class="bm-said bm-said-memo">' + esc(memo) + '</div>' : '') +
          '</div>'
        );
      }
      const body: string[] = [];
      if (m && m.kind === 'tweet') {
        if (m.deleted) {
          body.push('<div class="tool-hint">' + esc(t('mydash.bm.media.deleted', undefined, 'X 에서 못 받음. 지워졌거나 로그인이 필요한 트윗')) + '</div>');
        } else {
          const who = m.who ? [text(m.who.name), m.who.handle ? '@' + text(m.who.handle) : ''].filter(Boolean).join(' ') : '';
          if (who) body.push('<div class="bm-who">' + esc(who) + '</div>');
          if (text(m.text).trim()) body.push('<div class="bm-tw">' + esc(text(m.text).trim()) + '</div>');
          for (const ph of m.photos || []) {
            const u = picUrl(text(ph.url), 'medium');
            if (!u) continue;
            const ratio = ph.w && ph.h ? ' style="aspect-ratio:' + Number(ph.w) + '/' + Number(ph.h) + '"' : '';
            body.push('<img class="bm-pic" src="' + esc(u) + '" alt="" loading="lazy" decoding="async"' + ratio + '>');
          }
          if (m.video && m.video.poster) {
            body.push(
              '<img class="bm-pic" src="' + esc(picUrl(text(m.video.poster), 'medium')) + '" alt="" loading="lazy">' +
              '<div class="tool-hint">' + esc(t('mydash.bm.media.video', undefined, '영상은 원문에서')) + '</div>'
            );
          }
        }
      } else if (m && m.kind === 'page') {
        const title = text(m.title).trim();
        if (title && title !== said && title !== text(it.label).trim()) body.push('<div class="bm-ptitle">' + esc(title) + '</div>');
        if (m.site) body.push('<div class="bm-who">' + esc(text(m.site)) + '</div>');
        if (text(m.description).trim()) body.push('<div class="bm-tw">' + esc(text(m.description).trim()) + '</div>');
        const img = m.image ? safeLinkUrl(m.image) : '';
        if (img) body.push('<img class="bm-pic" src="' + esc(img) + '" alt="" loading="lazy" decoding="async">');
      }
      if (url) {
        body.push(
          '<a class="bm-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a>'
        );
      }
      if (body.length) {
        out.push(
          '<div class="bm-layer"><div class="tool-sublabel">' +
          esc(m && m.kind === 'tweet'
            ? t('mydash.bm.layer.tweet', undefined, '트윗 원문')
            : t('mydash.bm.layer.page', undefined, '페이지')) +
          '</div>' + body.join('') + '</div>'
        );
      }
      const ai: string[] = [];
      const sub = text(it.subhead).trim();
      if (sub) ai.push(sub);
      for (const key of ['form', 'cost', 'decay']) {
        for (const v of axisValues(it, key)) ai.push(valueLabel(key, v));
      }
      if (ai.length) {
        out.push(
          '<details class="bm-layer bm-ai"><summary><span class="tool-sublabel">' +
          esc(t('mydash.bm.layer.ai', undefined, 'AI 분류')) + '</span> <span class="bm-ai-peek">' +
          esc(ai.slice(0, 2).join(', ')) + '</span></summary>' +
          '<div class="tool-chips">' + ai.map((a) => '<span class="tool-chip">' + esc(a) + '</span>').join('') + '</div>' +
          '<div class="tool-hint">' + esc(t('mydash.bm.layer.aiHint', undefined, '추정입니다. 위의 원문이 정본')) + '</div>' +
          '</details>'
        );
      }
      return out.join('');
    }

    function chipsHtml(axisKey: string, on: (v: string) => boolean, act: string): string {
      const picks = axisPicks(axisKey);
      if (!picks.length) return '';
      return (
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel(axisKey)) +
        '</div><div class="tool-chips">' +
        picks
          .map(
            (p) =>
              '<button type="button" class="tool-chip' + (on(p.key) ? ' active' : '') +
              '" data-act="' + esc(act) + '" data-value="' + esc(p.key) + '">' + esc(p.label) +
              '</button>'
          )
          .join('') +
        '</div></div>'
      );
    }

    function paintSheet(): void {
      /* 목록 보기만 옆판이 늘 떠 있다. 피드와 격자는 화면 전체가 카드라 열었을 때만 옆판 (PC 격자 5열) */
      wrap.classList.toggle('no-panel', view !== 'list' && !sheet);
      if (!sheet || !draft || !draftBase) {
        if (isWide() && view === 'list') {
          sheetEl.hidden = false;
          sheetEl.innerHTML =
            '<div class="bm-sheet-empty">' +
            esc(t('mydash.bm.sheet.empty', undefined, '줄을 누르면 여기에 뜹니다')) + '</div>' + keysHtml();
        } else {
          sheetEl.hidden = true;
          sheetEl.innerHTML = '';
        }
        return;
      }
      const head = sheet.items[0];
      const url = safeLinkUrl(head.url);
      const title = sheet.bundle
        ? t('mydash.bm.sheet.bundle', { n: sheet.items.length }, '묶음 {n}건 전체에 적용')
        : headOf(head, draft.note);

      /* now 상한. 이 대상이 새로 차지할 자리 수만큼 미리 잰다 */
      const mine = new Set(sheet.items.map((it) => text(it.id)));
      const cap = nowCap();
      const others = nowItems(mine);
      const overflow = draft.priority === 'now' && others.length + sheet.items.length > cap;

      /* 사람이 고르는 생애주기 셋. axes.json 에 없는 값은 제외
         (없는 값을 쓰게 두면 필터 칩에 안 잡히는 미아 발생). 정의 통째로 없으면 셋 다 */
      const known = axisPicks('status');
      const statusPicks = known.length
        ? PICKABLE_STATUS.filter((k) => known.some((p) => p.key === k))
        : PICKABLE_STATUS.slice();
      const needNote = draft.status === 'promoted';

      const nowListHtml =
        overflow || showNowList
          ? '<div class="bm-nowlist"><div class="tool-sublabel">' +
            esc(
              t(
                'mydash.bm.prio.capHead',
                { n: cap },
                '지금 자리는 {n}개입니다. 하나를 곧 으로 내리세요'
              )
            ) +
            '</div>' +
            (others.length
              ? others
                  .map(
                    (it) =>
                      '<div class="bm-nowrow"><span>' +
                      esc(displayLabel(it, stateOf(it).note)) +
                      '</span><button type="button" class="btn btn-ghost" data-act="s-demote" data-id="' +
                      esc(text(it.id)) + '">' +
                      esc(t('mydash.bm.prio.demote', undefined, '곧 으로')) + '</button></div>'
                  )
                  .join('')
              : '<div class="tool-hint">' +
                esc(t('mydash.bm.prio.capEmpty', undefined, '지금 으로 올린 것이 없습니다')) +
                '</div>') +
            '</div>'
          : '';

      sheetEl.innerHTML =
        '<div class="bm-scrim" data-act="sheet-close"></div>' +
        '<div class="bm-sheet-card" role="dialog" aria-modal="true">' +
        '<div class="bm-sheet-head"><div class="bm-sheet-title">' + esc(title) + '</div>' +
        '<button type="button" class="btn btn-ghost" data-act="sheet-close">' +
        esc(t('mydash.bm.sheet.close', undefined, '닫기')) + '</button></div>' +
        keysHtml() +
        (sheet.bundle ? '' : layersHtml(head, draft.note, url || '')) +
        (url && sheet.bundle
          ? '<div><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a></div>'
          : '') +
        chipsHtml('intent', (v) => (draft as ItemState).intent.indexOf(v) >= 0, 's-intent') +
        chipsHtml('topic', (v) => (draft as ItemState).topic.indexOf(v) >= 0, 's-topic') +
        chipsHtml('domain', (v) => (draft as ItemState).domain === v, 's-domain') +
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel('priority')) +
        '</div><div class="tool-chips">' +
        axisPicks('priority')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' +
              ((draft as ItemState).priority === p.key ? ' active' : '') +
              '" data-act="s-prio" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' + nowListHtml + '</div>' +
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel('status')) +
        '</div><div class="tool-chips">' +
        statusPicks
          .map(
            (k) =>
              '<button type="button" class="tool-chip' +
              ((draft as ItemState).status === k ? ' active' : '') +
              '" data-act="s-status" data-value="' + esc(k) + '">' + esc(valueLabel('status', k)) +
              '</button>'
          )
          .join('') +
        '</div></div>' +
        '<div class="field-group"><label class="field-label" for="bm-note">' +
        esc(
          needNote
            ? t('mydash.bm.note.promote', undefined, '이걸로 뭘 알게 됐나')
            : t('mydash.bm.note.label', undefined, '메모')
        ) +
        '</label><input id="bm-note" type="text" autocomplete="off" value="' +
        esc(draft.note) + '"></div>' +
        '<div class="bm-sheet-foot">' +
        '<div class="tool-status' + (sheetMsgBad ? ' error' : '') + '">' + esc(sheetMsg) + '</div>' +
        '<button type="button" class="btn btn-primary" data-act="sheet-save">' +
        esc(t('mydash.bm.sheet.save', undefined, '저장')) + '</button></div>' +
        '</div>';
      sheetEl.hidden = false;
      const noteEl = sheetEl.querySelector('#bm-note') as HTMLInputElement | null;
      if (noteEl) {
        noteEl.addEventListener('input', () => {
          if (draft) draft.note = noteEl.value;
        });
        /* 메모 칸에서 Enter 는 저장. 자판 훑기의 손이 칸 안에서도 안 끊기게 */
        noteEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void saveSheet();
          }
        });
      }
    }

    /** 이번 시트에서 승격으로 **새로 바뀌었나**. 이미 promoted 인 것을 다시 저장하는 것은 아님 */
    function promotingNow(): boolean {
      if (!draft || !draftBase) return false;
      return draft.status === 'promoted' && draftBase.status !== 'promoted';
    }

    /** 시트의 초안과 지금 상태를 견줘 낼 이벤트를 만든다. 안 바뀐 축은 안 낸다 */
    function sheetEvents(): Outgoing[] {
      if (!sheet || !draft || !draftBase) return [];
      const out: Outgoing[] = [];
      const tagChanged = !sameSet(draft.intent, draftBase.intent) || draft.domain !== draftBase.domain || !sameSet(draft.topic, draftBase.topic);
      if (tagChanged) {
        out.push(makeEvent('tag', sheet.target, { intent: draft.intent.slice(), topic: draft.topic.slice(), domain: draft.domain }));
      }
      if (draft.priority !== draftBase.priority) {
        out.push(makeEvent('priority', sheet.target, { priority: draft.priority }));
      }
      if (draft.status !== draftBase.status) {
        out.push(makeEvent('status', sheet.target, { status: draft.status }));
      }
      /* 묶음을 승격할 때는 메모를 **항상** 같이 낸다. 초안의 밑값은 묶음 첫 항목의 메모라,
         나머지 항목은 메모가 달라도 안 바뀐 것으로 보인다. 그러면 승격한 근거가 묶음 안에서
         한 건에만 남는다. 대상이 같은 `bundle:<열쇠>` 라 이벤트 하나로 전체에 걸린다. */
      const noteChanged = draft.note !== draftBase.note;
      if (noteChanged || (promotingNow() && sheet.bundle)) {
        out.push(makeEvent('note', sheet.target, { note: draft.note }));
      }
      return out;
    }

    async function saveSheet(): Promise<void> {
      if (!sheet || !draft || !draftBase) return;
      /* 승격 관문. 메모가 **이번에 사람이 바꾼 값**이어야 한다. 비어 있지 않은 것만 재면
         옛 메모가 그대로 통과해, 승격 근거를 적게 하려던 관문이 그냥 열린다. */
      if (promotingNow() && (!draft.note.trim() || draft.note === draftBase.note)) {
        sheetMsg = t(
          'mydash.bm.promote.need',
          undefined,
          '승격하려면 이걸로 뭘 알게 됐는지 한 줄 적으세요'
        );
        sheetMsgBad = true;
        paintSheet();
        return;
      }
      const mine = new Set(sheet.items.map((it) => text(it.id)));
      if (draft.priority === 'now' && nowItems(mine).length + sheet.items.length > nowCap()) {
        sheetMsg = t('mydash.bm.prio.capBlock', { n: nowCap() }, '지금 은 {n}개까지입니다. 하나를 내리세요');
        sheetMsgBad = true;
        showNowList = true;
        paintSheet();
        return;
      }
      const evs = sheetEvents();
      if (!evs.length) {
        sheetMsg = t('mydash.bm.save.none', undefined, '바뀐 것이 없습니다');
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      /* 나쁜 것이 이긴다. 권한 없음이 가장 세고, 그 다음이 시각 충돌 */
      let worst: SendResult = 'sent';
      for (const ev of evs) {
        const r = await sendEvent(ev);
        if (r === 'denied') worst = 'denied';
        else if (r === 'collided' && worst !== 'denied') worst = 'collided';
        else if (r === 'queued' && worst === 'sent') worst = 'queued';
      }
      paint();
      if (isBad(worst)) {
        sheetMsg = sendWord(worst);
        sheetMsgBad = true;
        paintSheet();
        return;
      }
      /* PC 는 저장하면 다음 줄로. 훑는 손이 저장마다 목록으로 안 돌아가게. 낱개일 때만
         (묶음은 다음 줄이 무엇인지 애매) */
      if (isWide() && !sheet.bundle) {
        const ids = visibleRowIds();
        const at = ids.indexOf(curId);
        if (at >= 0 && at + 1 < ids.length) {
          moveCur(1);
          return;
        }
      }
      closeSheet();
    }

    /* ── 선택 모드 ── */
    function paintBar(): void {
      if (!selectMode) {
        barEl.hidden = true;
        barEl.innerHTML = '';
        wrap.classList.remove('has-bar');
        return;
      }
      wrap.classList.add('has-bar');
      barEl.hidden = false;
      barEl.innerHTML =
        '<div class="tool-chips">' +
        axisPicks('intent')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' + (barIntent.has(p.key) ? ' active' : '') +
              '" data-act="b-intent" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' +
        '<div class="tool-actions">' +
        '<button type="button" class="btn btn-primary" data-act="b-apply">' +
        esc(t('mydash.bm.sel.applyIntent', undefined, '의도 적용')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="b-drop">' +
        esc(t('mydash.bm.sel.drop', undefined, '버림')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="b-cancel">' +
        esc(t('mydash.bm.sel.cancel', undefined, '취소')) + '</button>' +
        '</div>' +
        '<div class="tool-status">' +
        esc(
          barBusy ||
            t('mydash.bm.sel.picked', { n: selected.size }, '고른 것 {n}건')
        ) +
        '</div>';
    }

    /**
     * 고른 것마다 이벤트 하나씩 순차로. 파일 하나에 이벤트 하나 규약은 여기서도 그대로라,
     * 묶어 보내지 않고 한 건씩 보냄.
     *
     * 끝에 셋을 센다. 보냄, 큐, 실패. 전에는 한 줄로 진행만 보이고 끝나면 지웠는데,
     * 그러면 몇 건이 큐로 갔는지 사람이 알 길이 없었다. 큐나 실패가 있으면 **선택을 안
     * 비움**. 고른 것이 사라지면 다시 고르는 수밖에 없음.
     */
    async function runBulk(make: (it: Item) => Outgoing): Promise<void> {
      const ids = Array.from(selected);
      if (!ids.length) {
        barBusy = t('mydash.bm.sel.none', undefined, '고른 것이 없습니다');
        paintBar();
        return;
      }
      let sent = 0;
      let queued = 0;
      let failed = 0;
      /* 안 끝난 것 중 가장 나쁜 갈래. 집계 줄 뒤에 이 갈래의 안내를 한 번만 붙인다 */
      let worst: SendResult = 'sent';
      let done = 0;
      for (const id of ids) {
        const it = itemById.get(id);
        if (!it) continue;
        /* 요청 사이 간격. 한 건씩 순차라 왕복 시간이 여기 더해진다. GitHub 의 쓰기
           2차 한도에 걸려 통째로 막히는 것보다 조금 느린 편이 낫다 */
        if (done > 0) await gap();
        const r = await sendEvent(make(it));
        done++;
        if (r === 'sent') sent++;
        else if (r === 'queued') queued++;
        else failed++;
        if (r === 'denied') worst = 'denied';
        else if (r === 'collided' && worst !== 'denied') worst = 'collided';
        else if (r === 'queued' && worst === 'sent') worst = 'queued';
        barBusy = t('mydash.bm.sel.progress', { n: done, m: ids.length }, '{n}/{m}');
        paintBar();
        /* 권한 없음은 다음 건도 같은 자리에서 막힌다. 더 두드리지 않는다 */
        if (r === 'denied') break;
      }
      const tally = t(
        'mydash.bm.sel.tally',
        { n: sent, m: queued, k: failed },
        '보냄 {n}, 큐 {m}, 실패 {k}'
      );
      barBusy = worst === 'sent' ? tally : tally + '. ' + sendWord(worst);
      if (!queued && !failed) selected.clear();
      paint();
    }

    /* ── 한 장 모드 ──
       판정 대기만 한 장씩. 차례는 작성자별로 모아 같은 작가가 연달아 오게 한다 (같은 그림쟁이
       스물몇 장을 매번 새로 판단하는 것 방지). 같은 작가면 앞에서 고른 의도를 미리 체크. */
    function judgeList(): Item[] {
      return items.filter(isPending).sort((a, b) => {
        const x = text(a.author);
        const y = text(b.author);
        if (x !== y) return x < y ? -1 : 1;
        return byRecent(a, b);
      });
    }

    function enterJudge(): void {
      const list = judgeList();
      judge = { list, at: 0, picks: new Set<string>(), lastAuthor: '', lastIntent: [] };
      if (selectMode) toggleSelect(false);
      paintJudge();
    }

    function exitJudge(): void {
      judge = null;
      paintJudge();
      paint();
    }

    /** 한 장 모드에서는 목록 쪽을 통째로 감춘다. 화면에 판단할 것 하나만 남기려는 것 */
    function setListVisible(on: boolean): void {
      for (const el of [searchEl, revisitEl, countEl, listEl, moreEl]) {
        if (el) el.hidden = !on;
      }
      headActsEl.hidden = !on;
      /* 필터는 자기 접힘 상태가 있다. 한 장 모드에서는 무조건 숨기고, 나올 때는 접힌 채로 */
      if (!on) filtersEl.hidden = true;
      if (on) filtersSumEl.setAttribute('aria-expanded', 'false');
      /* 옆판도 같이. 한 장 모드에 "줄을 누르면" 안내가 떠 있으면 거짓말 */
      if (!on) sheetEl.hidden = true;
      else paintSheet();
    }

    function paintJudge(): void {
      if (!judge) {
        judgeEl.hidden = true;
        judgeEl.innerHTML = '';
        setListVisible(true);
        return;
      }
      setListVisible(false);
      judgeEl.hidden = false;
      const total = judge.list.length;
      if (judge.at >= total) {
        judgeEl.innerHTML =
          '<div class="tool-status ok">' +
          esc(t('mydash.bm.judge.done', undefined, '판정 대기를 다 봤습니다')) + '</div>' +
          '<div class="tool-actions"><button type="button" class="btn btn-primary" data-act="j-exit">' +
          esc(t('mydash.bm.judge.exit', undefined, '나가기')) + '</button></div>';
        return;
      }
      const it = judge.list[judge.at];
      const url = safeLinkUrl(it.url);
      const s = stateOf(it);
      judgeEl.innerHTML =
        '<div class="tool-status">' +
        esc(t('mydash.bm.judge.progress', { k: judge.at + 1, n: total }, '{k}/{n}')) + '</div>' +
        '<div class="bm-judge-title">' + esc(displayLabel(it, s.note)) + '</div>' +
        '<div class="bm-meta">' +
        (text(it.author) ? '<span>' + esc(text(it.author)) + '</span>' : '') +
        (text(it.subhead) ? '<span>' + esc(text(it.subhead)) + '</span>' : '') +
        '</div>' +
        (url
          ? '<div><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a></div>'
          : '') +
        '<div class="tool-chips">' +
        axisPicks('intent')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' +
              ((judge as Judge).picks.has(p.key) ? ' active' : '') +
              '" data-act="j-intent" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' +
        '<div class="tool-actions">' +
        '<button type="button" class="btn btn-primary" data-act="j-save">' +
        esc(t('mydash.bm.judge.saveNext', undefined, '저장하고 다음')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-skip">' +
        esc(t('mydash.bm.judge.skip', undefined, '건너뛰기')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-drop">' +
        esc(t('mydash.bm.judge.drop', undefined, '버림')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-exit">' +
        esc(t('mydash.bm.judge.exit', undefined, '나가기')) + '</button>' +
        '</div>' +
        '<div class="tool-status" data-jmsg="1"></div>';
    }

    function judgeAdvance(): void {
      if (!judge) return;
      judge.at++;
      const next = judge.list[judge.at];
      judge.picks = new Set<string>();
      /* 같은 작가면 앞에서 고른 의도를 미리 체크. 다른 작가면 빈칸에서 시작 */
      if (next && judge.lastAuthor && text(next.author) === judge.lastAuthor) {
        for (const v of judge.lastIntent) judge.picks.add(v);
      }
      paintJudge();
    }

    function judgeMsg(msg: string, bad: boolean): void {
      const el = judgeEl.querySelector('[data-jmsg]') as HTMLElement | null;
      if (!el) return;
      el.textContent = msg;
      el.classList.toggle('error', bad);
    }

    async function judgeSave(): Promise<void> {
      if (!judge) return;
      const it = judge.list[judge.at];
      if (!it) return;
      if (!judge.picks.size) {
        judgeMsg(t('mydash.bm.judge.needIntent', undefined, '의도를 하나 이상 고르세요'), true);
        return;
      }
      const picks = Array.from(judge.picks);
      const s = stateOf(it);
      const r = await sendEvent(makeEvent('tag', text(it.id), { intent: picks, domain: s.domain }));
      if (isBad(r)) {
        judgeMsg(sendWord(r), true);
        return;
      }
      judge.lastAuthor = text(it.author);
      judge.lastIntent = picks;
      judgeAdvance();
      paintHead();
    }

    async function judgeDrop(): Promise<void> {
      if (!judge) return;
      const it = judge.list[judge.at];
      if (!it) return;
      const r = await sendEvent(makeEvent('status', text(it.id), { status: 'dropped' }));
      if (isBad(r)) {
        judgeMsg(sendWord(r), true);
        return;
      }
      judgeAdvance();
      paintHead();
    }

    function toggleSelect(on: boolean): void {
      selectMode = on;
      if (!on) {
        selected.clear();
        barIntent.clear();
        barBusy = '';
      }
      paint();
    }

    /* ── 손 ── */
    wrap.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      /* 제목 링크는 링크로 둔다. 시트를 여는 것은 그 밖의 자리 */
      if (target.closest('a')) return;
      const el = target.closest('[data-axis],[data-act],[data-pick]') as HTMLElement | null;
      if (!el) return;
      const act = el.getAttribute('data-act');

      if (act === 'more') {
        shown += PAGE;
        paint();
        return;
      }
      if (act === 'bundle') {
        const key = el.getAttribute('data-key') || '';
        if (opened.has(key)) opened.delete(key);
        else opened.add(key);
        paint();
        return;
      }
      if (act === 'select') {
        toggleSelect(!selectMode);
        return;
      }
      if (act === 'view') {
        setView((el.getAttribute('data-view') as View) || 'list');
        return;
      }
      if (act === 'pending') {
        pendingOnly = !pendingOnly;
        shown = PAGE;
        paint();
        return;
      }
      if (act === 'c-intent') {
        const id = el.getAttribute('data-id') || '';
        const v = el.getAttribute('data-value') || '';
        const it = itemById.get(id);
        if (!it) return;
        const set = feedPicks.get(id) || new Set(stateOf(it).intent);
        if (set.has(v)) set.delete(v);
        else set.add(v);
        feedPicks.set(id, set);
        el.classList.toggle('active', set.has(v));
        return;
      }
      if (act === 'c-drop' || act === 'c-now' || act === 'c-keep') {
        const id = el.getAttribute('data-id') || '';
        const it = itemById.get(id);
        if (!it) return;
        if (act === 'c-drop') {
          void cardJudge(id, makeEvent('status', id, { status: 'dropped' }));
        } else if (act === 'c-now') {
          /* 지금 자리 상한. 넘치면 옆판이 내릴 것을 보인다 */
          if (nowItems(new Set([id])).length + 1 > nowCap()) {
            openSheet(id);
            if (draft) { draft.priority = 'now'; showNowList = true; paintSheet(); }
            return;
          }
          void cardJudge(id, makeEvent('priority', id, { priority: 'now' }));
        } else {
          const set = feedPicks.get(id) || new Set(stateOf(it).intent);
          if (!set.size) {
            const msgEl = listEl.querySelector('[data-cmsg="' + id + '"]') as HTMLElement | null;
            if (msgEl) { msgEl.textContent = t('mydash.bm.judge.needIntent', undefined, '의도를 하나 이상 고르세요'); msgEl.classList.add('error'); }
            return;
          }
          void cardJudge(id, makeEvent('tag', id, { intent: Array.from(set), domain: stateOf(it).domain }));
        }
        return;
      }
      if (act === 'filters') {
        filtersEl.hidden = !filtersEl.hidden;
        filtersSumEl.setAttribute('aria-expanded', filtersEl.hidden ? 'false' : 'true');
        return;
      }
      if (act === 'judge') {
        enterJudge();
        return;
      }
      if (act === 'open') {
        openSheet(el.getAttribute('data-target') || '');
        return;
      }
      if (act === 'row') {
        /* 줄 어디를 눌러도 옆판. 링크는 위에서 걸렀고, 버튼은 자기 act 가 먼저 잡힌다 */
        openSheet(el.getAttribute('data-row') || '');
        return;
      }
      if (act === 'pick' || el.hasAttribute('data-pick')) {
        const id = el.getAttribute('data-id') || el.getAttribute('data-pick') || '';
        if (!id) return;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        /* 목록을 다시 안 그린다. 백 줄을 매번 다시 그리면 폰에서 끊기고, 다시 그리는 순간
           아직 안 누른 칸이 새 노드로 갈려 연달아 고르기가 끊긴다. 칸과 띠만 맞춘다 */
        /* 같은 항목이 목록과 재발굴 칸에 두 번 떠 있을 수 있다. 둘 다 맞춘다 */
        const boxes = Array.from(
          wrap.querySelectorAll('[data-pick="' + id + '"]')
        ) as HTMLInputElement[];
        for (const box of boxes) box.checked = selected.has(id);
        paintBar();
        return;
      }
      if (act === 'sheet-close') {
        closeSheet();
        return;
      }
      if (act === 'sheet-save') {
        void saveSheet();
        return;
      }
      if (act === 's-intent' && draft) {
        const v = el.getAttribute('data-value') || '';
        const at = draft.intent.indexOf(v);
        if (at >= 0) draft.intent.splice(at, 1);
        else draft.intent.push(v);
        paintSheet();
        return;
      }
      if (act === 's-topic' && draft) {
        const v = el.getAttribute('data-value') || '';
        const at = draft.topic.indexOf(v);
        if (at >= 0) draft.topic.splice(at, 1);
        else draft.topic.push(v);
        paintSheet();
        return;
      }
      if (act === 's-domain' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.domain = draft.domain === v ? null : v;
        paintSheet();
        return;
      }
      if (act === 's-prio' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.priority = draft.priority === v ? null : v;
        showNowList = false;
        sheetMsg = '';
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      if (act === 's-status' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.status = draft.status === v ? (draftBase as ItemState).status : v;
        sheetMsg = '';
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      if (act === 's-demote') {
        const id = el.getAttribute('data-id') || '';
        void (async () => {
          const r = await sendEvent(makeEvent('priority', id, { priority: 'soon' }));
          if (isBad(r)) {
            sheetMsg = sendWord(r);
            sheetMsgBad = true;
          } else {
            sheetMsg = '';
            sheetMsgBad = false;
          }
          paint();
          paintSheet();
        })();
        return;
      }
      if (act === 'b-intent') {
        const v = el.getAttribute('data-value') || '';
        if (barIntent.has(v)) barIntent.delete(v);
        else barIntent.add(v);
        barBusy = '';
        paintBar();
        return;
      }
      if (act === 'b-apply') {
        if (!barIntent.size) {
          barBusy = t('mydash.bm.sel.pickIntent', undefined, '의도를 고르세요');
          paintBar();
          return;
        }
        const picks = Array.from(barIntent);
        void runBulk((it) => makeEvent('tag', text(it.id), { intent: picks, domain: stateOf(it).domain }));
        return;
      }
      if (act === 'b-drop') {
        void runBulk((it) => makeEvent('status', text(it.id), { status: 'dropped' }));
        return;
      }
      if (act === 'b-cancel') {
        toggleSelect(false);
        return;
      }
      if (act === 'j-intent' && judge) {
        const v = el.getAttribute('data-value') || '';
        if (judge.picks.has(v)) judge.picks.delete(v);
        else judge.picks.add(v);
        paintJudge();
        return;
      }
      if (act === 'j-save') {
        void judgeSave();
        return;
      }
      if (act === 'j-skip') {
        judgeAdvance();
        return;
      }
      if (act === 'j-drop') {
        void judgeDrop();
        return;
      }
      if (act === 'j-exit') {
        exitJudge();
        return;
      }

      const axis = el.getAttribute('data-axis');
      if (!axis || !picked[axis]) return;
      const value = el.getAttribute('data-value') || '';
      if (picked[axis].has(value)) picked[axis].delete(value);
      else picked[axis].add(value);
      shown = PAGE;
      paint();
    });

    /* ── 자판 (PC) ──
       위아래로 줄, 숫자로 판정, Enter 저장, Esc 닫기. 글 쓰는 칸 안에서는 안 잡는다.
       이 패널이 화면에 없으면 안 잡고, 떠날 때 셸이 떼어 준다 */
    function onKey(e: KeyboardEvent): void {
      if (!isWide() || !ctx.isCurrent() || selectMode || judge) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt ? tgt.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tgt && tgt.isContentEditable)) return;
      const k = e.key;
      /* 초점이 버튼이나 링크에 있으면 Enter 는 그것의 몫 */
      if (k === 'Enter' && (tag === 'BUTTON' || tag === 'A')) return;
      if (k === 'ArrowDown' || k === 'j') {
        e.preventDefault();
        moveCur(1);
        return;
      }
      if (k === 'ArrowUp' || k === 'k') {
        e.preventDefault();
        moveCur(-1);
        return;
      }
      if (!sheet || !draft || !draftBase) return;
      if (k === 'Escape') {
        closeSheet();
        return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        void saveSheet();
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const pick = keyPicks()[parseInt(k, 10) - 1];
        if (!pick) return;
        e.preventDefault();
        if (pick.act === 'prio') draft.priority = draft.priority === pick.key ? null : pick.key;
        else draft.status = draft.status === 'dropped' ? draftBase.status : 'dropped';
        showNowList = false;
        sheetMsg = '';
        sheetMsgBad = false;
        paintSheet();
      }
    }
    document.addEventListener('keydown', onKey);
    ctx.onDispose(() => document.removeEventListener('keydown', onKey));
    /* 폭이 바뀌면 옆판 모양이 바뀐다 (빈 자리 글, 자판 안내) */
    const onWide = (): void => paintSheet();
    wideMq.addEventListener('change', onWide);
    ctx.onDispose(() => wideMq.removeEventListener('change', onWide));

    qEl.addEventListener('input', () => {
      query = qEl.value.trim().toLowerCase();
      shown = PAGE;
      paint();
    });

    paintRevisit();
    paint();
    paintSheet();

    /* 밀린 쓰기 비우기. 보낸 것이 있으면 브랜치가 바뀐 것이라 이벤트를 다시 읽는다 */
    void (async () => {
      try {
        const r = await repo.flushOutbox();
        if (r && r.sent > 0) {
          await loadEvents();
          paint();
          evLineEl.hidden = false;
          evLineEl.textContent = t('mydash.bm.outbox.sent', { n: r.sent }, '밀린 저장 {n}건 보냈습니다');
        }
      } catch {
        /* 큐 비우기는 화면을 막지 않는다. 다음 로드나 online 에서 다시 */
      }
    })();
  }

  /* 탭 이름은 **등록하는 순간** 셸 소관, 그 자리는 기다릴 곳 없어 되받을 글 동봉 방식.
     묶음 받기를 여기서 미리 걸어 두면 로그인 뒤 칩이 그려질 때는 대개 옮긴 말 도착. */
  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'bookmarks',
    get title(): string {
      return t('mydash.bm.title', undefined, '북마크');
    },
    access: 'write',
    paths: [SUMMARY_PATH, AXES_PATH, EVENTS_DIR],
    render,
  });
})();

export {};
