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
 * 격자와 분류 편집, 일괄 작업이 같은 states와 이벤트 저장 경로 사용.
 * 보기 전환 없이 체크박스에서 선택 진입, 필터와 일괄 분류는 top-layer 팝업.
 *
 * 출처 라벨(X, 브라우저, 카톡)만 i18n 소관. `src` 는 축이 아니라 데이터 갈래라
 * axes.json 에 정의 없음. 모르는 갈래는 값 그대로 표시.
 */
import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx, DashRepoWrite } from './kit';
import { t, loadNamespace } from '../../lib/i18n';
import { createMediaViewer, nextItem, type MediaItem } from '../../../../../packages/media-browser/index.js';
import gridCss from './bookmark-grid.css';

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
    /** 정본 문서에 들어온 날 (배치 머리줄 날짜). recordedAt 은 출처마다 뜻이 달라 새로 들어옴 필터는 이것 */
    addedAt?: string | null;
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
    video?: { poster?: string; src?: string; durationMs?: number; w?: number; h?: number } | null;
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
    /** 사람이 주제를 붙였나 (tag 이벤트에 topic 이 실림). 주제만 붙여도 판정 끝 (사용자 2026-09-19) */
    topicByUser: boolean;
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
  /** 격자 열 폭과 간격. bookmark-grid.css와 같은 값 */
  const GRID_COL = 224;
  const GRID_GAP = 12;
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
  const SRC_ORDER = ['x', 'edge', 'kakao', 'kakao-group', 'youtube', 'memo'];
  const KST_OFFSET_MS = 9 * 3600000;
  /** 새로 들어옴 필터의 기간 (일) */
  const FRESH_DAYS = 7;
  type Sort = 'recent' | 'oldest' | 'title' | 'priority';
  const SORT_KEY = 'karmolab.mydash.bm.sort';
  const SORTS: Sort[] = ['recent', 'oldest', 'title', 'priority'];

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
    let style = document.getElementById(STYLE_ID);
    if (!style) { style = document.createElement('style'); style.id = STYLE_ID; document.head.appendChild(style); }
    style.textContent = gridCss;
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
  function picUrl(url: string, size: 'small' | 'medium' | 'orig'): string {
    const clean = text(url).trim();
    if (!clean) return '';
    if (/^https:\/\/pbs\.twimg\.com\//.test(clean)) return clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'name=' + size;
    return clean;
  }

  /** 유튜브 주소면 영상 id. watch?v=, youtu.be/, shorts/, embed/ 네 꼴 */
  function youtubeId(url: unknown): string {
    const u = text(url).trim();
    const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
    return m ? m[1] : '';
  }

  function mediaOf(it: Item): Media | null {
    return it.media && typeof it.media === 'object' ? it.media : null;
  }

  function mediaItems(it: Item): MediaItem[] {
    const media = mediaOf(it);
    if (!media || media.deleted) return [];
    const title = text(it.label) || text(media.title) || text(media.text) || text(it.id);
    const photos = media.photos || (media.image ? [{ url: media.image }] : []);
    const images: MediaItem[] = photos.flatMap((photo, index) => {
      const src = safeLinkUrl(picUrl(text(photo.url), 'orig'));
      return src ? [{ id: text(it.id) + '::image:' + index, kind: 'image', src, title }] : [];
    });
    const video = safeLinkUrl(media.video?.src);
    if (video) images.push({ id: text(it.id) + '::video', kind: 'video', src: video, title, poster: safeLinkUrl(media.video?.poster) || undefined });
    return images;
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
  /** 시트가 지금 무엇을 고치고 있나. 묶음이면 items 가 그 묶음 전부 */
  type SheetTarget = { target: string; items: Item[]; bundle: boolean };

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

  /* video 태그는 referrerpolicy 속성을 안 받는다 (Chromium). video.twimg.com 은 referer 있으면 403 (2026-09-19 curl 실측).
     문서 단위 meta 로 끈다. 이 페이지는 로그인한 사람만 보는 대시보드라 잃는 것 없음 */
  function ensureNoReferrer(): void {
    if (document.querySelector('meta[name="referrer"]')) return;
    const m = document.createElement('meta');
    m.name = 'referrer';
    m.content = 'no-referrer';
    document.head.appendChild(m);
  }

  async function render(ctx: DashPanelCtx<DashRepoWrite>): Promise<void> {
    ensureStyle();
    ensureNoReferrer();
    /* 옮긴 말이 안 와도 그린다. 아래 모든 t 호출에 한국어 원본이 딸려 있다 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    root.innerHTML =
      '<div class="bm"><div class="tool-status">' +
      esc(t('mydash.bm.loading', undefined, '저장소에서 받는 중...')) +
      '</div></div>';
    const [rawSummary, rawAxes] = await Promise.all([repo.readJson<Summary>(SUMMARY_PATH), repo.readJson<AxesFile>(AXES_PATH).catch((): AxesFile => ({}))]);

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
      t('mydash.bm.status.scoped', { n: items.filter(it => it.src !== 'kakao-group').length,
        m: items.filter(it => it.src === 'kakao-group').length, when: bakedAgo(rawSummary.generatedAt) },
        '내 자료 {n}건, 단체방 수집 {m}건, {when}')
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
        topicByUser: false,
      };
    }

    function applyEvent(s: ItemState, ev: DashEvent): void {
      if (ev.type === 'tag') {
        if (Array.isArray(ev.intent)) s.intent = ev.intent.filter((x) => typeof x === 'string');
        if (Array.isArray(ev.topic)) {
          s.topic = ev.topic.filter((x) => typeof x === 'string');
          if (s.topic.length) s.topicByUser = true;
        }
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
    await loadNamespace('media');

    /* ── 뼈대 ── */
    const wrap = document.createElement('div');
    wrap.className = 'bm';
    root.textContent = '';
    root.appendChild(wrap);
    wrap.addEventListener('error', event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.parentElement?.classList.contains('bm-view-open')) return;
      image.parentElement.classList.add('is-unavailable');
      image.parentElement.dataset.error = t('media.viewer.error');
    }, true);

    /**
     * 지금 판정 대기인가.
     *
     * **재는 것은 결과지 이벤트가 아니다.** 전에는 tag 이벤트가 왔나(`tagged`)로 쟀는데,
     * 그러면 생성기가 이미 의도를 채워 둔 항목이 대기로 남고 (이벤트가 없으니), 반대로
     * 의도를 비운 tag 이벤트는 대기가 아닌 것이 됐다. 지금은 의도가 하나라도 있으면 해제.
     * 버린 것과 승격한 것도 다시 물을 이유 없음.
     */
    /** 최근 FRESH_DAYS 일 안에 정본에 들어온 것 (카톡, 유튜브, X 자동 수집분) */
    const freshSince = new Date(Date.now() + KST_OFFSET_MS - FRESH_DAYS * 86400000).toISOString().slice(0, 10);
    function isFresh(it: Item): boolean {
      const d = text(it.addedAt).slice(0, 10);
      return !!d && d >= freshSince;
    }

    function isPending(it: Item): boolean {
      if (!text(it.pending)) return false;
      const s = stateOf(it);
      if (s.intent.length || s.topicByUser) return false;
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
    wrap.innerHTML =
      '<div class="bm-main">' + notes.join('') +
      '<header class="bm-toolbar">' +
      '<div class="bm-browse" data-browse="1">' +
      '<input id="bm-q" class="bm-q" type="search" autocomplete="off" aria-label="' + esc(t('mydash.bm.search.label', undefined, '검색')) + '" placeholder="' + esc(t('mydash.bm.search.ph', undefined, '제목, 작성자, 메모')) + '">' +
      '<button type="button" data-act="filters" data-filters-sum="1" popovertarget="bm-filter-menu" aria-expanded="false" aria-controls="bm-filter-menu">' + esc(t('mydash.bm.filter.sum', undefined, '필터')) + '</button>' +
      '<select class="bm-sort" data-sort="1" aria-label="' + esc(t('mydash.bm.sort.label', undefined, '정렬')) + '">' +
      SORTS.map(k => '<option value="' + k + '">' + esc(t('mydash.bm.sort.' + k, undefined, ({ recent: '최신순', oldest: '오래된순', title: '제목순', priority: '우선순위순' })[k])) + '</option>').join('') + '</select>' +
      '<span class="bm-count" data-count="1" role="status"></span></div>' +
      '<div class="bm-selection" data-bar="1" hidden></div></header>' +
      '<div class="bm-active" data-active="1" aria-label="' + esc(t('mydash.bm.filter.active', undefined, '적용한 조건')) + '" hidden></div>' +
      '<div class="bm-scroll" tabindex="0" aria-label="' + esc(t('mydash.bm.title', undefined, '북마크')) + '">' +
      '<div class="bm-grid" data-list="1"></div><div class="bm-more" data-more="1"><button type="button" data-act="more"></button></div></div>' +
      '<div class="bm-live" data-evline="1" role="status" hidden></div></div>' +
      '<div id="bm-filter-menu" class="bm-popover bm-filter" data-filters="1" popover="auto" role="dialog" aria-label="' + esc(t('mydash.bm.filter.sum', undefined, '필터')) + '">' +
      '<div class="bm-popover-head"><strong>' + esc(t('mydash.bm.filter.sum', undefined, '필터')) + '</strong><button type="button" data-act="close-filters">' + esc(t('media.viewer.close')) + '</button></div>' +
      '<div class="bm-filter-layout"><nav class="bm-filter-tabs" role="tablist" aria-orientation="vertical" aria-label="' + esc(t('mydash.bm.grid.categories', undefined, '필터 종류')) + '">' +
      '<button type="button" role="tab" data-act="filter-tab" data-filter-axis="quick">' + esc(t('mydash.bm.grid.quick', undefined, '빠른 필터')) + '</button>' +
      groups.map(g => '<button type="button" role="tab" data-act="filter-tab" data-filter-axis="' + esc(g.key) + '">' + esc(g.label) + ' <span data-group-count="' + esc(g.key) + '"></span></button>').join('') +
      '</nav><section id="bm-filter-values" class="bm-filter-values" role="tabpanel">' +
      '<input class="bm-filter-search" data-filter-search="1" type="search" aria-label="' + esc(t('mydash.bm.grid.findFilter', undefined, '필터 항목 찾기')) + '" placeholder="' + esc(t('mydash.bm.grid.findFilter', undefined, '필터 항목 찾기')) + '">' +
      '<div class="bm-options" data-filter-options="1">' +
      '<div class="bm-quick" data-filter-panel="quick" hidden><button type="button" data-act="pending" aria-pressed="false"></button><button type="button" data-act="fresh" aria-pressed="false"></button></div>' +
      groups.map(g => '<div data-filter-panel="' + esc(g.key) + '">' + g.values.map(v =>
        '<label class="bm-option"><input type="checkbox" data-axis="' + esc(g.key) + '" data-value="' + esc(v.key) + '"><span>' + esc(v.label) + '</span><small data-n="' + esc(g.key) + ':' + esc(v.key) + '">0</small></label>').join('') + '</div>').join('') +
      '</div></section></div>' +
      '<div class="bm-popover-foot"><label>' + esc(t('mydash.bm.scope.label', undefined, '목록')) + '<select data-scope="1">' +
      '<option value="personal">' + esc(t('mydash.bm.scope.personal', undefined, '내 북마크')) + '</option><option value="collected">' + esc(t('mydash.bm.scope.collected', undefined, '단체방 수집 링크')) + '</option><option value="all">' + esc(t('mydash.bm.scope.all', undefined, '전체 자료')) + '</option></select></label>' +
      '<button type="button" data-act="clear-filters">' + esc(t('mydash.bm.filter.clear', undefined, '조건 초기화')) + '</button></div></div>' +
      '<div id="bm-bulk-menu" class="bm-popover bm-bulk" data-bulk-menu="1" popover="auto" role="dialog" aria-label="' + esc(t('mydash.bm.grid.bulkEdit', undefined, '선택한 항목 분류')) + '">' +
      '<div class="bm-popover-head"><strong>' + esc(t('mydash.bm.grid.bulkEdit', undefined, '선택한 항목 분류')) + '</strong><button type="button" data-act="close-bulk">' + esc(t('media.viewer.close')) + '</button></div>' +
      '<div class="bm-bulk-fields"><select data-bulk-axis="1" aria-label="' + esc(t('mydash.bm.grid.categories', undefined, '필터 종류')) + '">' +
      ['intent', 'topic', 'domain'].map(key => '<option value="' + key + '">' + esc(axisLabel(key)) + '</option>').join('') + '</select><input class="bm-bulk-search" type="search" data-bulk-search="1" aria-label="' + esc(t('mydash.bm.grid.findTag', undefined, '분류 항목 찾기')) + '" placeholder="' + esc(t('mydash.bm.grid.findTag', undefined, '분류 항목 찾기')) + '"></div>' +
      '<div class="bm-options" data-bulk-options="1"></div><div class="bm-bulk-status" data-bulk-status="1" role="status"></div>' +
      '<div class="bm-popover-foot"><button type="button" data-act="b-apply">' + esc(t('mydash.bm.grid.addTags', undefined, '선택한 항목에 추가')) + '</button></div></div>' +
      '<div class="bm-sheet" data-sheet="1" hidden></div>';

    const qEl = wrap.querySelector('#bm-q') as HTMLInputElement;
    const filtersEl = wrap.querySelector('[data-filters]') as HTMLElement;
    const filtersSumEl = wrap.querySelector('[data-filters-sum]') as HTMLElement;
    const scopeEl = wrap.querySelector('[data-scope]') as HTMLSelectElement;
    const sortEl = wrap.querySelector('[data-sort]') as HTMLSelectElement;
    const activeEl = wrap.querySelector('[data-active]') as HTMLElement;
    const browseEl = wrap.querySelector('[data-browse]') as HTMLElement;
    const bulkEl = wrap.querySelector('[data-bulk-menu]') as HTMLElement;
    const bulkAxisEl = wrap.querySelector('[data-bulk-axis]') as HTMLSelectElement;
    const bulkSearchEl = wrap.querySelector('[data-bulk-search]') as HTMLInputElement;
    const filterSearchEl = wrap.querySelector('[data-filter-search]') as HTMLInputElement;
    let filterAxis = groups[0]?.key || 'quick';
    /** PC 두 열인가. 옆판이 늘 떠 있고 자판으로 훑는 것은 이 폭에서만 */
    const wideMq = window.matchMedia('(min-width:900px)');
    const isWide = (): boolean => wideMq.matches;
    const evLineEl = wrap.querySelector('[data-evline]') as HTMLElement;
    const countEl = wrap.querySelector('[data-count]') as HTMLElement;
    const listEl = wrap.querySelector('[data-list]') as HTMLElement;
    const moreEl = wrap.querySelector('[data-more]') as HTMLElement;
    const moreBtn = wrap.querySelector('[data-act="more"]') as HTMLElement;
    /* 스크롤로 더 보기 칸이 가까워지면 다음 묶음을 저절로 (사용자 2026-10-09 "더 보기 눌러야만 로딩").
       버튼은 관찰기가 없는 환경과 키보드용으로 남김. 그린 뒤에도 칸이 보이면 한 번 더 */
    let autoMoreBusy = false;
    function moreInView(): boolean {
      if (moreEl.style.display === 'none' || !moreEl.isConnected) return false;
      const r = moreEl.getBoundingClientRect();
      return r.top < window.innerHeight + 800 && r.bottom > -800;
    }
    function autoMore(): void {
      if (autoMoreBusy || !moreInView()) return;
      autoMoreBusy = true;
      shown += PAGE;
      paint();
      requestAnimationFrame(() => {
        autoMoreBusy = false;
        autoMore();
      });
    }
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) autoMore();
      }, { rootMargin: '800px 0px' }).observe(moreEl);
    }
    const barEl = wrap.querySelector('[data-bar]') as HTMLElement;
    const sheetEl = wrap.querySelector('[data-sheet]') as HTMLElement;
    const mediaViewer = createMediaViewer({ parent: wrap, labels: {
      title: t('media.viewer.title'), zoom: t('media.viewer.zoom'), fit: t('media.viewer.fit'),
      close: t('media.viewer.close'), previous: t('media.viewer.previous'), next: t('media.viewer.next'), error: t('media.viewer.error'), loading: t('media.viewer.loading'), retry: t('media.viewer.retry')
    }, actions: { label: t('media.viewer.settings'), openByDefault: () => false, render: (item, host) => {
      const id = item.id.slice(0, item.id.lastIndexOf('::'));
      if (sheet?.target !== id) openSheet(id);
      host.append(sheetEl);
      sheetEl.querySelector('.bm-sheet-card')?.removeAttribute('role');
      sheetEl.querySelector('.bm-sheet-card')?.removeAttribute('aria-modal');
    } }, beforeChange: item => {
      if (sheetSaving) return false;
      const id = item?.id.slice(0, item.id.lastIndexOf('::'));
      if (id === sheet?.target || !draft || !draftBase) return true;
      const changed = !sameSet(draft.intent, draftBase.intent) || !sameSet(draft.topic, draftBase.topic) || draft.domain !== draftBase.domain || draft.priority !== draftBase.priority || draft.status !== draftBase.status || draft.note !== draftBase.note;
      return !changed || window.confirm(t('media.viewer.unsaved'));
    }, onClose: () => {
      wrap.append(sheetEl); closeSheet();
      requestAnimationFrame(() => {
        if (mediaViewer.opened) return;
        const target = listEl.querySelector<HTMLElement>('[data-row="' + CSS.escape(curId) + '"] .bm-view-open') || wrap.querySelector<HTMLElement>('.bm-scroll');
        target?.focus({ preventScroll: true });
      });
    } });
    ctx.onDispose(() => mediaViewer.dispose());

    const picked: Record<string, Set<string>> = {};
    for (const g of groups) picked[g.key] = new Set<string>();
    let query = '';
    let scope = 'personal';
    let sort: Sort = 'recent';
    try {
      const saved = localStorage.getItem(SORT_KEY) as Sort;
      if (SORTS.includes(saved)) sort = saved;
    } catch { /* 저장 막힌 브라우저 */ }
    sortEl.value = sort;
    let shown = PAGE;
    /** 옆판이 보고 있는 줄. 자판 위아래가 이 줄에서 움직인다 */
    let curId = '';
    let pendingOnly = ctx.mode === 'judge';
    let freshOnly = false;
    /** 이 화면에서 방금 판정한 것 (카드, 타일, 선택 일괄). 흐리게 제자리에 둔다 */
    const feedDone = new Set<string>();
    /** 조건이 바뀌면 다시 흐르는 것이 맞다. 그때 제자리 고정을 푼다 */
    function resetDone(): void {
      feedDone.clear();
    }

    /* 선택 모드. 고른 것과 바에서 고른 의도, 주제, 영역.
       주제와 영역도 한 번에 (사용자 2026-09-24 "성인 이런거 설정하려고 해도 안 보이는데") */
    let selectMode = false;
    const selected = new Set<string>();
    let lastTileClick: { id: string; selected: Set<string> } | null = null;
    const barIntent = new Set<string>();
    const barTopic = new Set<string>();
    let barDomain: string | null = null;
    let barBusy = '';
    let bulkSaving = false;
    /** Shift 범위의 시작. 마지막으로 누른 항목 */
    let pickAnchor = '';
    /** 격자가 지금 그린 차례 (열로 나눠 그려 DOM 차례와 다르다). 자판 이동과 Shift 범위가 쓴다 */
    let gridOrder: string[] = [];
    /** 격자 열 수. 폭이 바뀌어 이 수가 바뀔 때만 다시 나눈다 */
    let gridCols = 0;


    /* 시트 */
    let sheet: SheetTarget | null = null;
    let draft: ItemState | null = null;
    let draftBase: ItemState | null = null;
    let sheetSaving = false;
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
    function matches(it: Item, ignoreAxis = ''): boolean {
      if (!inScope(it)) return false;
      /* 방금 판정한 것은 조건을 벗어나도 제자리에 흐리게 남긴다. 빼면 뒤가 전부 당겨져
         격자가 통째로 다시 흐른다 (사용자 2026-09-24 "하나 판정하면 전체 배치가 바뀐다").
         필터나 검색을 바꿀 때 비운다 (resetDone) */
      const kept = feedDone.has(text(it.id));
      if (pendingOnly && !isPending(it) && !kept) return false;
      if (freshOnly && !isFresh(it) && !kept) return false;
      const s = stateOf(it);
      /* 버림과 승격은 아카이브다. 필터를 안 켜면 기본 목록에서 뺀다 */
      if (!kept && ignoreAxis !== 'status' && (!picked.status || !picked.status.size)) {
        if (HIDDEN_STATUS.indexOf(s.status) >= 0) return false;
      }
      for (const g of groups) {
        if (g.key === ignoreAxis) continue;
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
      return text(a.id).localeCompare(text(b.id));
    }

    function inScope(it: Item): boolean {
      return scope === 'all' || (scope === 'collected' ? it.src === 'kakao-group' : it.src !== 'kakao-group');
    }

    function bySort(a: Item, b: Item): number {
      if (sort === 'title') {
        return displayLabel(a, stateOf(a).note).localeCompare(displayLabel(b, stateOf(b).note), undefined, { numeric: true }) || byRecent(a, b);
      }
      if (sort === 'priority') {
        const order = axisPicks('priority').map(v => v.key);
        const rank = (it: Item): number => {
          const at = order.indexOf(stateOf(it).priority || '');
          return at < 0 ? order.length : at;
        };
        return rank(a) - rank(b) || byRecent(a, b);
      }
      if (sort === 'oldest') {
        const x = text(a.recordedAt), y = text(b.recordedAt);
        if (x !== y) return x && y ? x.localeCompare(y) : x ? -1 : 1;
      }
      return byRecent(a, b);
    }

    function refreshResults(): void {
      resetDone();
      shown = PAGE;
      paint();
      wrap.querySelector('.bm-scroll')!.scrollTop = 0;
    }

    /** 카드가 보이는 사진 (첫 장) 과 나머지 수 */
    function firstPic(it: Item, size: 'small' | 'medium'): { url: string; more: number; w?: number; h?: number } | null {
      const m = mediaOf(it);
      if (!m) return null;
      const ph = m.photos && m.photos.length ? m.photos[0] : null;
      if (ph && ph.url) return { url: picUrl(ph.url, size), more: (m.photos as MediaPhoto[]).length - 1, w: ph.w, h: ph.h };
      /* 영상도 크기 전달. 빠지면 그림 도착 뒤에야 높이가 정해져 격자 칸이 열 사이로 다시 흐름
         (판정 대기 452 중 213 이 영상, 2026-09-23 사용자 "순서나 모양이 계속 바뀐다") */
      if (m.video && m.video.poster) return { url: picUrl(m.video.poster, size), more: 0, w: m.video.w, h: m.video.h };
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

    /** 격자 타일 (핀터레스트 식). 사진이 타일, 없으면 글 타일. 누르면 옆판, 위에 버림과 지금 */
    /** 카드와 타일의 제목. 트윗은 본문이 없으면 비운다. AI 가 지은 라벨을 원문 자리에 안 놓는다 */
    function capOf(it: Item, note: string): string {
      const m = mediaOf(it);
      if (m && m.kind === 'tweet' && !m.deleted) return text(m.text).trim().split('\n')[0];
      return headOf(it, note);
    }
    function tileHtml(it: Item): string {
          const id = text(it.id), s = stateOf(it), pic = firstPic(it, 'small');
          const head = capOf(it, s.note) || headOf(it, s.note);
          const checked = selected.has(id) ? ' checked' : '';
          const ratio = pic?.w && pic.h ? ' style="aspect-ratio:' + Number(pic.w) + '/' + Number(pic.h) + '"' : '';
          return '<article class="bm-tile' + (pic ? '' : ' is-text') + (selected.has(id) ? ' is-sel' : '') + (feedDone.has(id) ? ' is-done' : '') + '" data-row="' + esc(id) + '">' +
            '<label class="bm-check-hit"><input type="checkbox" data-pick="' + esc(id) + '"' + checked + ' aria-label="' + esc(t('mydash.bm.grid.selectItem', { title: head }, '{title} 선택')) + '"></label>' +
            '<button type="button" class="bm-tile-edit" data-act="open" data-target="' + esc(id) + '" title="' + esc(t('mydash.bm.grid.edit', undefined, '분류와 메모')) + '">' + esc(t('mydash.bm.row.open', undefined, '분류')) + '</button>' +
            '<button type="button" class="bm-tile-open bm-view-open" data-act="tile" data-id="' + esc(id) + '" aria-label="' + esc(head) + '">' +
            (pic ? '<img src="' + esc(pic.url) + '" referrerpolicy="no-referrer" alt="" loading="lazy" decoding="async"' + ratio + '>' : '<span class="bm-tile-text">' + esc(head) + '</span>') +
            '<span class="bm-tile-caption">' + (pic ? '<span class="bm-tile-cap">' + esc(head) + '</span>' : '') +
            '<span class="bm-tile-meta">' + esc(whoOf(it) || srcLabel(text(it.src))) + (isPending(it) ? ' · ' + esc(t('mydash.bm.pendingChip', undefined, '판정 대기')) : '') + '</span></span></button>' +
            (s.priority ? '<span class="bm-tile-badge">' + esc(valueLabel('priority', s.priority)) + '</span>' : '') + '</article>';
        }

    /** 격자 열 수. CSS 의 열 폭 (--bm-col) 과 같은 셈. 폰은 2열 */
    function gridColCount(): number {
      if (window.matchMedia('(max-width:559px)').matches) return 2;
      const w = listEl.clientWidth || wrap.clientWidth;
      return Math.max(1, Math.floor((w + GRID_GAP) / (GRID_COL + GRID_GAP)));
    }

    /**
     * 핀터레스트 식 배치. 차례대로 가장 짧은 열 밑.
     * - 높이는 그림 도착 전에 데이터의 가로세로 비로 어림
     * - 그림이 늦게 와도, 더 보기로 뒤가 붙어도 앞 칸 자리 유지 (CSS columns 는 전부 다시 나눔)
     * - 읽는 차례가 왼쪽에서 오른쪽. Shift 범위가 눈에 보이는 덩어리와 일치
     */
    function gridHtml(tiles: Item[]): string {
      const n = gridColCount();
      gridCols = n;
      const cols: string[][] = [];
      const hs: number[] = [];
      for (let i = 0; i < n; i++) { cols.push([]); hs.push(0); }
      for (const it of tiles) {
        let at = 0;
        for (let i = 1; i < n; i++) if (hs[i] < hs[at] - 0.01) at = i;
        cols[at].push(tileHtml(it));
        hs[at] += tileWeight(it);
      }
      listEl.style.setProperty('--bm-ncol', String(n));
      return cols.map((c) => '<div class="bm-gcol">' + c.join('') + '</div>').join('');
    }

    /** 타일 높이 어림 (열 폭 1 기준). 그림은 세로/가로, 없으면 정사각에 가깝게, 글 줄 몫을 더한다 */
    function tileWeight(it: Item): number {
      const pic = firstPic(it, 'small');
      const body = pic ? (pic.w && pic.h ? Math.min(3, pic.h / pic.w) : 1) : 0.7;
      return body + 0.35;
    }


    /* ── 우선순위 상한 ──
       `now` 는 자리가 여덟이다. 아홉 번째를 올리려 하면 지금 여덟을 보여 하나를 내리게 한다.
       화면이 지킨다 (저장소에는 규칙이 없다). */
    function nowItems(exclude: Set<string>): Item[] {
      return items.filter((it) => stateOf(it).priority === 'now' && !exclude.has(text(it.id)));
    }
    function paintChipCounts(): void {
          const tally = new Map<string, number>();
          for (const g of groups) for (const it of items) {
            if (!matches(it, g.key)) continue;
            for (const v of valuesFor(it, g.key)) {
              const key = g.key + ':' + v;
              tally.set(key, (tally.get(key) || 0) + 1);
            }
          }
          for (const node of filtersEl.querySelectorAll<HTMLElement>('[data-n]')) node.textContent = String(tally.get(node.dataset.n || '') || 0);
        }
    function paintHead(): void {
          let count = 0;
          const chips: string[] = [];
          const remove = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>';
          const chip = (act: string, label: string, attrs = '') => '<button type="button" data-act="' + act + '" ' + attrs + ' aria-label="' + esc(t('mydash.bm.filter.remove', { label }, '{label} 해제')) + '">' + esc(label) + remove + '</button>';
          for (const g of groups) {
            const n = picked[g.key].size;
            count += n;
            const node = filtersEl.querySelector('[data-group-count="' + g.key + '"]');
            if (node) node.textContent = n ? String(n) : '';
            for (const value of picked[g.key]) chips.push(chip('remove-filter', g.values.find(v => v.key === value)?.label || value,
              'data-remove-axis="' + esc(g.key) + '" data-value="' + esc(value) + '"'));
          }
          if (pendingOnly) { count++; chips.push(chip('pending', t('mydash.bm.act.pendingOnly', undefined, '대기만'))); }
          if (freshOnly) { count++; chips.push(chip('fresh', t('mydash.bm.filter.fresh', undefined, '최근 7일'))); }
          if (scope !== 'personal') { count++; chips.push(chip('clear-scope', scopeEl.selectedOptions[0].textContent || '')); }
          if (query) chips.push(chip('clear-query', qEl.value));
          filtersSumEl.textContent = t('mydash.bm.filter.sum', undefined, '필터') + (count ? ' ' + count : '');
          activeEl.hidden = !chips.length;
          activeEl.innerHTML = chips.join('') + (chips.length ? '<button type="button" data-act="clear-filters">' + esc(t('mydash.bm.filter.clear', undefined, '조건 초기화')) + '</button>' : '');
          const pending = filtersEl.querySelector<HTMLButtonElement>('[data-act="pending"]')!;
          pending.textContent = t('mydash.bm.act.pendingOnly', undefined, '대기만');
          pending.setAttribute('aria-pressed', String(pendingOnly));
          const fresh = filtersEl.querySelector<HTMLButtonElement>('[data-act="fresh"]')!;
          fresh.textContent = t('mydash.bm.filter.fresh', undefined, '최근 7일');
          fresh.setAttribute('aria-pressed', String(freshOnly));
          paintFilterMenu();
        }
    function paint(): void {
          const focused = document.activeElement as HTMLElement | null;
          const focusedId = focused?.matches('.bm-tile-open') ? focused.dataset.id : null;
          const list = items.filter(it => matches(it)).sort(bySort);
          const tiles = list.slice(0, shown);
          gridOrder = tiles.map(it => text(it.id));
          countEl.textContent = t('mydash.bm.grid.resultCount', { n: list.length }, '{n}개');
          listEl.innerHTML = tiles.length ? gridHtml(tiles) : '<div class="bm-empty">' + esc(t('mydash.bm.noMatch', undefined, '조건에 맞는 것이 없습니다')) +
            '<button type="button" data-act="clear-filters">' + esc(t('mydash.bm.filter.clear', undefined, '조건 초기화')) + '</button></div>';
          const rest = Math.max(0, list.length - shown);
          moreEl.hidden = !rest;
          moreEl.style.display = rest ? '' : 'none';
          moreBtn.textContent = t('mydash.bm.grid.more', { n: rest }, '{n}개 더 보기');
          paintChipCounts();
          paintHead();
          syncPicks();
          if (focusedId && !mediaViewer.opened) listEl.querySelector<HTMLElement>('[data-row="' + CSS.escape(focusedId) + '"] .bm-tile-open')?.focus({ preventScroll: true });
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
      draftBase = { intent: s.intent.slice(), topic: s.topic.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged, topicByUser: s.topicByUser };
      draft = { intent: s.intent.slice(), topic: s.topic.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged, topicByUser: s.topicByUser };
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
    function visibleRowIds(): string[] { return gridOrder.slice(); }

    /** 위아래로 한 줄. 끝이면 그대로. 옆판이 그 줄을 보고 목록이 그 줄까지 스크롤 */
    function moveCur(delta: number): void {
      const ids = visibleRowIds();
      if (!ids.length) return;
      const id = nextItem(ids, curId, delta, { key: id => id });
      if (!id) return;
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
      const said = text(it.src) === 'kakao' || text(it.src) === 'memo' ? text(it.label).trim() : '';
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
          for (const [index, ph] of (mediaViewer.opened ? [] : m.photos || []).entries()) {
            const u = picUrl(text(ph.url), 'medium');
            if (!u) continue;
            const ratio = ph.w && ph.h ? ' style="aspect-ratio:' + Number(ph.w) + '/' + Number(ph.h) + '"' : '';
            body.push('<button type="button" class="bm-view-open" data-act="media" data-id="' + esc(text(it.id)) + '" data-media-key="' + esc(text(it.id) + '::image:' + index) + '" aria-label="' + esc(t('media.viewer.title')) + '"><img class="bm-pic" referrerpolicy="no-referrer" src="' + esc(u) + '" alt="" loading="lazy" decoding="async"' + ratio + '></button>');
          }
          if (!mediaViewer.opened && m.video && m.video.src) {
            /* 영상 미리보기 (사용자 2026-09-19). mp4 를 그 자리에서 튼다. 소리는 눌러야. referer 있으면 video.twimg.com 이 403 (curl 실측) */
            const ratio = m.video.w && m.video.h ? ' style="aspect-ratio:' + Number(m.video.w) + '/' + Number(m.video.h) + '"' : '';
            body.push(
              '<video class="bm-pic bm-video" controls preload="metadata" playsinline poster="' +
              esc(picUrl(text(m.video.poster), 'medium')) + '" src="' + esc(text(m.video.src)) + '"' + ratio + '></video><button type="button" class="btn btn-ghost" data-act="media" data-id="' + esc(text(it.id)) + '" data-media-key="' + esc(text(it.id) + '::video') + '">' + esc(t('media.viewer.title')) + '</button>'
            );
          } else if (!mediaViewer.opened && m.video && m.video.poster) {
            body.push(
              '<img class="bm-pic" referrerpolicy="no-referrer" src="' + esc(picUrl(text(m.video.poster), 'medium')) + '" alt="" loading="lazy">' +
              '<div class="tool-hint">' + esc(t('mydash.bm.media.video', undefined, '영상은 원문에서')) + '</div>'
            );
          }
        }
      } else if (youtubeId(it.url)) {
        /* 유튜브는 그 자리에서 (사용자 2026-09-19 "유튜브면 유튜브"). 제목과 채널은 미리보기 값 */
        const yid = youtubeId(it.url);
        const title = m ? text(m.title).trim() : '';
        if (title && title !== said && title !== text(it.label).trim()) body.push('<div class="bm-ptitle">' + esc(title) + '</div>');
        if (m && text(m.description).trim()) body.push('<div class="bm-who">' + esc(text(m.description).trim()) + '</div>');
        body.push(
          '<iframe class="bm-yt" src="https://www.youtube-nocookie.com/embed/' + esc(yid) + '" title="YouTube" ' +
          'allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>'
        );
      } else if (m && m.kind === 'page') {
        const title = text(m.title).trim();
        if (title && title !== said && title !== text(it.label).trim()) body.push('<div class="bm-ptitle">' + esc(title) + '</div>');
        if (m.site) body.push('<div class="bm-who">' + esc(text(m.site)) + '</div>');
        if (text(m.description).trim()) body.push('<div class="bm-tw">' + esc(text(m.description).trim()) + '</div>');
        const img = m.image ? safeLinkUrl(m.image) : '';
        if (img && !mediaViewer.opened) body.push('<button type="button" class="bm-view-open" data-act="media" data-id="' + esc(text(it.id)) + '" aria-label="' + esc(t('media.viewer.title')) + '"><img class="bm-pic" referrerpolicy="no-referrer" src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></button>');
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
      wrap.classList.add('no-panel');
      if (!sheet || !draft || !draftBase) {
        sheetEl.hidden = true;
        sheetEl.innerHTML = '';
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
      if (sheetEl.closest('.kmb-details')) {
        sheetEl.querySelector('.bm-sheet-card')?.removeAttribute('role');
        sheetEl.querySelector('.bm-sheet-card')?.removeAttribute('aria-modal');
      }
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
      if (!sheet || !draft || !draftBase || sheetSaving) return;
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
      sheetSaving = true;
      sheetMsg = t('media.viewer.saving'); paintSheet();
      const controls = [...sheetEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button')].filter(control => !control.disabled);
      controls.forEach(control => { control.disabled = true; });
      try {
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
      if (mediaViewer.opened) {
        const target = sheet.target;
        openSheet(target); sheetMsg = sendWord(worst); paintSheet(); return;
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
      } finally { sheetSaving = false; controls.forEach(control => { control.disabled = false; }); }
    }
    function paintBar(): void {
          selectMode = selected.size > 0;
          browseEl.hidden = selectMode;
          barEl.hidden = !selectMode;
          wrap.classList.toggle('is-selecting', selectMode);
          if (!selectMode) {
            if (bulkEl.matches(':popover-open')) bulkEl.hidePopover();
            if (!bulkSaving) { barIntent.clear(); barTopic.clear(); barDomain = null; }
            if (barBusy) { evLineEl.textContent = barBusy; evLineEl.hidden = false; }
            return;
          }
          const matching = items.filter(it => matches(it));
          const all = matching.length > 0 && matching.every(it => selected.has(text(it.id)));
          if (!barEl.children.length) barEl.innerHTML = '<label class="bm-all" title="' + esc(t('mydash.bm.grid.selectAll', undefined, '검색 결과 전체 선택')) + '"><input type="checkbox" data-act="select-all"' + (all ? ' checked' : '') + ' aria-label="' + esc(t('mydash.bm.grid.selectAll', undefined, '검색 결과 전체 선택')) + '"></label>' +
            '<strong class="bm-selection-count">' + esc(t('mydash.bm.grid.selected', { n: selected.size }, '{n}개 선택')) + '</strong>' +
            '<button type="button" data-act="bulk-menu" popovertarget="bm-bulk-menu" aria-controls="bm-bulk-menu" aria-expanded="false">' + esc(t('mydash.bm.row.open', undefined, '분류')) + '</button>' +
            '<button type="button" data-act="b-now">' + esc(valueLabel('priority', 'now')) + '</button>' +
            '<button type="button" data-act="b-drop">' + esc(valueLabel('status', 'dropped')) + '</button>' +
            '<button type="button" data-act="b-cancel">' + esc(t('mydash.bm.grid.deselect', undefined, '선택 해제')) + '</button>';
          const master = barEl.querySelector<HTMLInputElement>('[data-act="select-all"]')!;
          master.checked = all;
          master.indeterminate = !all && matching.some(it => selected.has(text(it.id)));
          barEl.querySelector('.bm-selection-count')!.textContent = t('mydash.bm.grid.selected', { n: selected.size }, '{n}개 선택');
          for (const input of bulkEl.querySelectorAll<HTMLInputElement>('[data-value]')) {
            const v = input.dataset.value || '';
            input.checked = bulkAxisEl.value === 'intent' ? barIntent.has(v) : bulkAxisEl.value === 'topic' ? barTopic.has(v) : barDomain === v;
          }
          const total = barIntent.size + barTopic.size + (barDomain ? 1 : 0);
          bulkEl.querySelector('[data-bulk-status]')!.textContent = barBusy || t('mydash.bm.grid.tagCount', { n: total }, '분류 {n}개 선택');
          for (const button of barEl.querySelectorAll<HTMLButtonElement>('[data-act="bulk-menu"],[data-act="b-now"],[data-act="b-drop"]')) button.disabled = bulkSaving;
          bulkEl.querySelector<HTMLButtonElement>('[data-act="b-apply"]')!.disabled = bulkSaving || !total;
        }

    /**
     * 고른 것마다 이벤트 파일 하나. 파일 하나에 이벤트 하나 규약은 그대로지만, 먼저 전부를
     * **커밋 하나로** 보냄 (putNewJsonMany). 한 건씩 PUT 은 건당 1초 남짓이라 여러 건 설정이
     * 느렸다 (2026-10-09 사용자 지적). 묶음이 실패하면 아무것도 안 들어간 것이라 아래 한 건씩 길로.
     *
     * 끝에 셋을 센다. 보냄, 큐, 실패. 전에는 한 줄로 진행만 보이고 끝나면 지웠는데,
     * 그러면 몇 건이 큐로 갔는지 사람이 알 길이 없었다. 큐나 실패가 있으면 **선택을 안
     * 비움**. 고른 것이 사라지면 다시 고르는 수밖에 없음.
     */
    async function runBulk(make: (it: Item) => Outgoing): Promise<void> {
      if (bulkSaving) return;
      const ids = Array.from(selected);
      if (!ids.length) {
        barBusy = t('mydash.bm.sel.none', undefined, '고른 것이 없습니다');
        paintBar();
        return;
      }
      bulkSaving = true;
      try {
      let sent = 0;
      let queued = 0;
      let failed = 0;
      /* 안 끝난 것 중 가장 나쁜 갈래. 집계 줄 뒤에 이 갈래의 안내를 한 번만 붙인다 */
      let worst: SendResult = 'sent';
      let done = 0;
      const outs: Array<{ id: string; out: Outgoing }> = [];
      for (const id of ids) {
        const it = itemById.get(id);
        if (it) outs.push({ id, out: make(it) });
      }
      if (outs.length > 1) {
        barBusy = t('mydash.bm.sel.progress', { n: 0, m: outs.length }, '{n}/{m}');
        paintBar();
        try {
          await repo.putNewJsonMany(
            outs.map((o) => ({ path: o.out.path, value: o.out.ev })),
            'dash: ' + outs[0].out.ev.type + ' ' + outs.length + '건'
          );
          for (const o of outs) {
            applySent(o.out.ev);
            feedDone.add(o.id);
          }
          barBusy = t('mydash.bm.sel.tally', { n: outs.length, m: 0, k: 0 }, '보냄 {n}, 큐 {m}, 실패 {k}');
          for (const id of ids) selected.delete(id);
          paint();
          return;
        } catch {
          /* 한 건씩 길로. 묶음은 다 들어가거나 하나도 안 들어감 */
        }
      }
      for (const { id, out } of outs) {
        /* 요청 사이 간격. 한 건씩 순차라 왕복 시간이 여기 더해진다. GitHub 의 쓰기
           2차 한도에 걸려 통째로 막히는 것보다 조금 느린 편이 낫다 */
        if (done > 0) await gap();
        const r = await sendEvent(out);
        done++;
        /* 큐로 간 것도 화면 상태는 이미 바뀌었다. 둘 다 제자리 고정 */
        if (r === 'sent' || r === 'queued') feedDone.add(id);
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
      if (!queued && !failed) for (const id of ids) selected.delete(id);
      paint();
      } finally { bulkSaving = false; paintBar(); }
    }
    function toggleSelect(on: boolean): void {
          if (!on) {
            selected.clear(); barIntent.clear(); barTopic.clear(); barDomain = null; barBusy = ''; pickAnchor = '';
          }
          syncPicks();
          paintHead();
        }
    function togglePick(id: string): void {
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          pickAnchor = id;
        }

    /** 보이는 차례로 a 부터 b 까지 전부 고른다. 격자는 그린 차례 (왼쪽에서 오른쪽) */
    function pickRange(a: string, b: string): void {
      const ids = visibleRowIds();
      const i = ids.indexOf(a);
      const j = ids.indexOf(b);
      if (i < 0 || j < 0) {
        togglePick(b);
        return;
      }
      for (let k = Math.min(i, j); k <= Math.max(i, j); k++) selected.add(ids[k]);
      pickAnchor = b;
    }
    function syncPicks(): void {
          for (const tile of listEl.querySelectorAll<HTMLElement>('[data-row]')) {
            const on = selected.has(tile.dataset.row || '');
            tile.classList.toggle('is-sel', on);
            const box = tile.querySelector<HTMLInputElement>('[data-pick]');
            if (box) box.checked = on;
          }
          paintBar();
          activeEl.hidden = !activeEl.children.length;
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
      if (act === 'filters') { requestAnimationFrame(() => positionMenu(filtersEl, filtersSumEl)); return; }
      if (act === 'close-filters') { filtersEl.hidePopover(); filtersSumEl.focus(); return; }
      if (act === 'filter-tab') {
        filterAxis = el.dataset.filterAxis || 'quick'; filterSearchEl.value = ''; paintFilterMenu(); return;
      }
      if (act === 'bulk-menu') { paintBulkOptions(); requestAnimationFrame(() => positionMenu(bulkEl, el)); return; }
      if (act === 'close-bulk') { bulkEl.hidePopover(); barEl.querySelector<HTMLElement>('[data-act="bulk-menu"]')?.focus(); return; }
      if (act === 'select-all') {
        const matching = items.filter(it => matches(it));
        if ((el as HTMLInputElement).checked) for (const it of matching) selected.add(text(it.id));
        else for (const it of matching) selected.delete(text(it.id));
        syncPicks(); return;
      }
      if (act === 'remove-filter') {
        picked[el.dataset.removeAxis || '']?.delete(el.dataset.value || ''); refreshResults();
        activeEl.querySelector<HTMLButtonElement>('button')?.focus(); return;
      }
      if (act === 'clear-filters' || act === 'clear-query' || act === 'clear-scope') {
        if (act !== 'clear-scope') { query = ''; qEl.value = ''; }
        if (act !== 'clear-query') { scope = 'personal'; scopeEl.value = scope; picked.src?.clear(); }
        if (act === 'clear-filters') {
          for (const g of groups) picked[g.key].clear(); pendingOnly = false; freshOnly = false;
        }
        refreshResults();
        if (!filtersEl.matches(':popover-open')) qEl.focus();
        return;
      }
      if (act === 'pending' || act === 'fresh') {
        if (act === 'pending') pendingOnly = !pendingOnly; else freshOnly = !freshOnly;
        refreshResults(); return;
      }
      if (act === 'more') { shown += PAGE; paint(); return; }
      if (el.hasAttribute('data-pick')) {
        const id = el.dataset.pick || '';
        if (ev.shiftKey && pickAnchor) pickRange(pickAnchor, id); else togglePick(id);
        syncPicks(); return;
      }
      if (act === 'tile') {
        const id = el.dataset.id || '';
        if (ev.detail === 2 && lastTileClick?.id === id) return;
        if (selectMode || ev.ctrlKey || ev.metaKey || ev.shiftKey) {
          lastTileClick = { id, selected: new Set(selected) };
          if (ev.shiftKey && pickAnchor) pickRange(pickAnchor, id); else togglePick(id);
          syncPicks();
        } else { lastTileClick = null; openTile(id, el); }
        return;
      }
      if (act === 'media') {
        const id = el.dataset.id || '';
        const media = items.filter(it => matches(it)).sort(bySort).flatMap(mediaItems);
        const first = el.dataset.mediaKey ? media.find(item => item.id === el.dataset.mediaKey) : media.find(item => item.id.startsWith(id + '::'));
        if (first) mediaViewer.open(media, first.id, el);
        return;
      }
      if (act === 'open') { openSheet(el.dataset.target || ''); return; }
      if (act === 'sheet-close') {
        if (mediaViewer.opened) { mediaViewer.showActions(false); return; }
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
      if (act === 'b-topic') {
        const v = el.getAttribute('data-value') || '';
        if (barTopic.has(v)) barTopic.delete(v);
        else barTopic.add(v);
        barBusy = '';
        paintBar();
        return;
      }
      if (act === 'b-domain') {
        const v = el.getAttribute('data-value') || '';
        barDomain = barDomain === v ? null : v;
        barBusy = '';
        paintBar();
        return;
      }
      if (act === 'b-apply') {
        if (!barIntent.size && !barTopic.size && !barDomain) {
          barBusy = t('mydash.bm.sel.pickAny', undefined, '의도, 주제, 영역 중 하나를 고르세요');
          paintBar();
          return;
        }
        /* 고른 값을 항목마다 더함 (의도, 주제는 합집합, 영역은 바꿈). tag 는 가장 최근 것 하나만 살아서
           셋을 늘 같이 보냄. 안 보내면 전에 붙인 의도나 주제가 풀림 */
        const addIntent = Array.from(barIntent);
        const addTopic = Array.from(barTopic);
        const setDomain = barDomain;
        const union = (a: string[], b: string[]): string[] => Array.from(new Set(a.concat(b)));
        void runBulk((it) => {
          const st = stateOf(it);
          /* 주제는 사람이 붙인 것이 있거나 새로 고른 때만 보냄. 보낼 때는 있던 주제 (AI 추정 포함) 에 더함. 주제 이벤트가 목록을 통째로 바꾸기 때문 */
          const keepTopic = addTopic.length > 0 || st.topicByUser;
          return makeEvent('tag', text(it.id), {
            intent: union(st.intent, addIntent),
            ...(keepTopic ? { topic: union(st.topic, addTopic) } : {}),
            domain: setDomain !== null ? setDomain : st.domain,
          });
        });
        return;
      }
      if (act === 'b-drop') {
        void runBulk((it) => makeEvent('status', text(it.id), { status: 'dropped' }));
        return;
      }
      if (act === 'b-now') {
        /* 지금 자리 상한은 한 장 판정과 같다. 넘치면 보내지 않고 알린다 */
        const cap = nowCap();
        const fresh = Array.from(selected).filter((id) => {
          const it = itemById.get(id);
          return !!it && stateOf(it).priority !== 'now';
        });
        if (nowItems(new Set<string>()).length + fresh.length > cap) {
          barBusy = t('mydash.bm.sel.nowOver', { n: cap }, '지금은 {n}칸까지입니다');
          paintBar();
          return;
        }
        void runBulk((it) => makeEvent('priority', text(it.id), { priority: 'now' }));
        return;
      }
      if (act === 'b-cancel') {
        toggleSelect(false);
        return;
      }

      const axis = el.getAttribute('data-axis');
      if (!axis || !picked[axis]) return;
      const value = el.getAttribute('data-value') || '';
      if (picked[axis].has(value)) picked[axis].delete(value);
      else picked[axis].add(value);
      refreshResults();
    });

    /* ── 자판 (PC) ──
       위아래로 줄, 숫자로 판정, Enter 저장, Esc 닫기. 글 쓰는 칸 안에서는 안 잡는다.
       이 패널이 화면에 없으면 안 잡고, 떠날 때 셸이 떼어 준다 */
    function onKey(e: KeyboardEvent): void {
      if (!ctx.isCurrent() || mediaViewer.opened || filtersEl.matches(':popover-open') || bulkEl.matches(':popover-open')) return;
      if (e.key === 'Escape' && selectMode) { e.preventDefault(); toggleSelect(false); return; }
      if (!isWide() || selectMode) return;
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
    /* 격자 열 수는 폭으로 정해진다. 수가 바뀔 때만 다시 나눈다 (같은 수면 칸이 안 움직인다) */
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => {
        if (gridOrder.length && gridColCount() !== gridCols) paint();
      });
      ro.observe(listEl);
      ctx.onDispose(() => ro.disconnect());
    }
    /* Shift 로 범위를 고를 때 글자가 같이 긁히지 않게 */
    listEl.addEventListener('mousedown', (e) => {
      if (e.shiftKey) e.preventDefault();
    });

    sortEl.addEventListener('change', () => {
      sort = sortEl.value as Sort;
      try { localStorage.setItem(SORT_KEY, sort); } catch { /* 저장 막힌 브라우저 */ }
      refreshResults();
    });
    scopeEl.addEventListener('change', () => {
      scope = scopeEl.value;
      picked.src?.clear();
      pendingOnly = false;
      selected.clear();
      refreshResults();
    });
    qEl.addEventListener('input', () => {
      query = qEl.value.trim().toLowerCase();
      refreshResults();
    });

    wrap.addEventListener('dblclick', (event) => {
      const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-act="tile"]');
      if (!tile || !lastTileClick || lastTileClick.id !== tile.dataset.id) return;
      selected.clear();
      for (const id of lastTileClick.selected) selected.add(id);
      syncPicks();
      openTile(tile.dataset.id || '', tile);
      lastTileClick = null;
    });
    filterSearchEl.addEventListener('input', paintFilterMenu);
    filtersEl.addEventListener('keydown', event => {
      const current = (event.target as HTMLElement).closest<HTMLElement>('[data-filter-axis]');
      if (!current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...filtersEl.querySelectorAll<HTMLElement>('[data-filter-axis]')];
      const at = tabs.indexOf(current);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      filterAxis = tabs[next].dataset.filterAxis || 'quick'; filterSearchEl.value = '';
      paintFilterMenu(); tabs[next].focus();
    });
    bulkAxisEl.addEventListener('change', () => { bulkSearchEl.value = ''; paintBulkOptions(); });
    bulkSearchEl.addEventListener('input', paintBulkOptions);
    filtersEl.addEventListener('toggle', () => filtersSumEl.setAttribute('aria-expanded', String(filtersEl.matches(':popover-open'))));
    bulkEl.addEventListener('toggle', () => barEl.querySelector('[data-act="bulk-menu"]')?.setAttribute('aria-expanded', String(bulkEl.matches(':popover-open'))));
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

    function paintFilterMenu(): void {
          for (const tab of filtersEl.querySelectorAll<HTMLElement>('[data-filter-axis]')) {
            const on = tab.dataset.filterAxis === filterAxis;
            tab.id = 'bm-filter-tab-' + tab.dataset.filterAxis;
            tab.setAttribute('aria-controls', 'bm-filter-values');
            tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
          }
          filtersEl.querySelector('[role="tabpanel"]')!.setAttribute('aria-labelledby', 'bm-filter-tab-' + filterAxis);
              for (const panel of filtersEl.querySelectorAll<HTMLElement>('[data-filter-panel]')) panel.hidden = panel.dataset.filterPanel !== filterAxis;
              filterSearchEl.hidden = filterAxis === 'quick';
              const term = filterSearchEl.value.trim().toLocaleLowerCase();
              for (const input of filtersEl.querySelectorAll<HTMLInputElement>('[data-axis]')) {
                const axis = input.dataset.axis || '', value = input.dataset.value || '';
                input.checked = !!picked[axis]?.has(value);
                const label = input.closest<HTMLElement>('.bm-option')!;
                label.hidden = (axis === 'src' && !inScope({ id: '', src: value })) || !(label.textContent || '').toLocaleLowerCase().includes(term);
              }
            }

    function paintBulkOptions(): void {
              const axis = bulkAxisEl.value;
              const term = bulkSearchEl.value.trim().toLocaleLowerCase();
              bulkEl.querySelector('[data-bulk-options]')!.innerHTML = axisPicks(axis).filter(v => v.label.toLocaleLowerCase().includes(term)).map(v =>
                '<label class="bm-option"><input type="checkbox" data-act="b-' + axis + '" data-value="' + esc(v.key) + '"><span>' + esc(v.label) + '</span></label>').join('');
              paintBar();
            }

    function positionMenu(panel: HTMLElement, anchor: HTMLElement): void {
          if (!panel.matches(':popover-open')) return;
              const a = anchor.getBoundingClientRect(), r = panel.getBoundingClientRect();
              panel.style.left = Math.max(12, Math.min(a.right - r.width, innerWidth - r.width - 12)) + 'px';
              panel.style.top = Math.max(12, Math.min(a.bottom + 8, innerHeight - r.height - 12)) + 'px';
            }

    function openTile(id: string, trigger: HTMLElement): void {
              setCur(id);
              const media = items.filter(it => matches(it)).sort(bySort).flatMap(mediaItems);
              const first = media.find(item => item.id.startsWith(id + '::'));
              if (first) mediaViewer.open(media, first.id, trigger); else openSheet(id);
            }
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
