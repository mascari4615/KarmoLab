/**
 * 사진 정보 보기, 지우기 (TASK-KL-088)
 *
 * 폰으로 찍은 사진에는 **찍은 곳의 좌표**가 들어 있다. 중고 거래 사진 한 장으로 집을 찾아낸
 * 이야기가 흔한 이유다. 그런데 그걸 지우겠다고 사진을 낯선 사이트에 올리는 건 앞뒤가 안 맞는다.
 *
 * 지우는 방식이 중요하다. 캔버스로 다시 그리면 정보는 사라지지만 **화질이 한 번 더 깎인다**.
 * 그래서 JPEG 안의 정보 구획만 잘라 낸다. 그림 데이터는 한 바이트도 건드리지 않는다.
 *
 * 무엇이 들어 있었는지 먼저 보여 준다. 지웠다는 말만으로는 사람이 안심하지 못한다.
 */
import { escapeHtml as esc } from '@lab/widgets/tools/shared/text';
import { statCell } from '@lab/widgets/tools/shared/stats';
import { read as readCoreExif } from '@lab/core/exif';
import { t } from '@lab/lib/i18n';
import { defineTool, type ToolContext, type ToolHandlers, type ToolResult } from '../../frame/define-tool';

interface Info {
  date?: string;
  camera?: string;
  lens?: string;
  gps?: string;
  orientation?: number;
  software?: string;
}

/** JPEG 은 0xFFxx 표시로 구획이 나뉜다. 그 구조를 따라 걸으며 정보 구획을 찾음 */
function walkSegments(bytes: Uint8Array): Array<{ marker: number; start: number; end: number }> {
  const out: Array<{ marker: number; start: number; end: number }> = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return out; // JPEG 아님
  let i = 2;
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // 그림 데이터 시작(SOS) 뒤로는 구획이 아니라 압축 데이터다. 여기서 멈춤
    if (marker === 0xda || marker === 0xd9) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    out.push({ marker, start: i, end: i + 2 + len });
    i += 2 + len;
  }
  return out;
}

const TAGS: Record<number, keyof Info> = {
  0x0132: 'date', // DateTime
  0x9003: 'date', // DateTimeOriginal (이쪽이 더 정확해 나중에 덮어쓴다)
  0x010f: 'camera', // Make
  0x0110: 'camera', // Model
  0xa434: 'lens',
  0x0112: 'orientation',
  0x0131: 'software'
};

/** EXIF 를 읽어 사람이 알아볼 항목만 뽑는다. 전부 해석할 필요는 없음 */
/*
 * 읽는 셈은 ** 하나뿐이다** (TASK-KL-316 / 31).
 * 사진 자리 도구가 생기면서 같은 파서가 두 벌이 될 뻔했다. 한쪽만 고쳐지면 같은 사진에 두 답이 남
 * 여기는 화면 말투(위치를 한 줄 글로)만 맡는다. 지우는 일(strip)은 그림을 다시 잇는 일이라 여기 남음
 */
function readExif(bytes: Uint8Array): Info {
  const core = readCoreExif(bytes);
  return {
    date: core.date,
    camera: core.camera,
    lens: core.lens,
    software: core.software,
    orientation: core.orientation,
    gps: core.gps === undefined ? undefined : core.gps.lat.toFixed(6) + ', ' + core.gps.lon.toFixed(6)
  };
}

/** 정보 구획(APP1/APP13 등)만 빼고 다시 잇는다. 그림 데이터는 그대롬 */
function strip(bytes: Uint8Array): Uint8Array {
  const segs = walkSegments(bytes);
  // 지울 것: Exif(APP1), Photoshop(APP13), 주석(COM). APP0(JFIF)는 두어야 열리는 프로그램이 있음
  const drop = segs.filter((s) => s.marker === 0xe1 || s.marker === 0xed || s.marker === 0xfe);
  if (!drop.length) return bytes;
  const keep: Array<[number, number]> = [];
  let cur = 0;
  for (const d of drop.sort((a, b) => a.start - b.start)) {
    keep.push([cur, d.start]);
    cur = d.end;
  }
  keep.push([cur, bytes.length]);
  const size = keep.reduce((a, [s, e]) => a + (e - s), 0);
  const out = new Uint8Array(size);
  let off = 0;
  for (const [s, e] of keep) {
    out.set(bytes.subarray(s, e), off);
    off += e - s;
  }
  return out;
}

const size = (n: number): string =>
  n>= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n>= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`;

function setup({ $, say }: ToolContext): ToolHandlers {
  const listEl = $<HTMLElement>('#exList');
  const stats = $<HTMLElement>('#exStats');

  let fileName = '';
  let raw: Uint8Array | null = null;

  const orientName = (n: number): string => t(`exifclean.orient.${n}`);

  async function load(files: File[]): Promise<boolean> {
    const f = files[0];
    fileName = f.name;
    raw = new Uint8Array(await f.arrayBuffer());
    if (raw[0] !== 0xff || raw[1] !== 0xd8) {
      say(t('exifclean.err.jpgOnly'), 'error');
      return false;
    }

    const info = readExif(raw);
    const rows: Array<[string, string]> = [];
    if (info.gps) rows.push([t('exifclean.row.gps'), t('exifclean.row.gpsNote', { v: info.gps })]);
    if (info.date) rows.push([t('exifclean.row.date'), info.date]);
    if (info.camera) rows.push([t('exifclean.row.camera'), info.camera]);
    if (info.lens) rows.push([t('exifclean.row.lens'), info.lens]);
    if (info.software) rows.push([t('exifclean.row.software'), info.software]);
    if (info.orientation)
      rows.push([t('exifclean.row.orientation'), orientName(info.orientation) || String(info.orientation)]);

    listEl.innerHTML = rows.length
      ? rows
          .map(
            ([k, v]) =>
              `<div class="tool-list-row"><span class="tool-list-key">${esc(k)}</span><span class="tool-list-val">${esc(v)}</span></div>`
          )
          .join('')
      : `<div class="tool-list-row"><span class="tool-list-val">${esc(t('exifclean.none'))}</span></div>`;

    const cleaned = strip(raw);
    stats.innerHTML =
      statCell(t('exifclean.stat.before'), size(raw.length), true) +
      statCell(t('exifclean.stat.after'), size(cleaned.length)) +
      statCell(t('exifclean.stat.gps'), t(info.gps ? 'exifclean.value.has' : 'exifclean.value.none'));

    if (info.gps) say(t('exifclean.say.gps'), 'error');
    else if (rows.length) say(t('exifclean.say.someInfo'), 'ok');
    else say(t('exifclean.say.clean'), 'ok');
    return true;
  }

  return {
    load,
    async run() {
      if (!raw) return null;
      const cleaned = strip(raw);
      const blob = new Blob([cleaned as unknown as BlobPart], { type: 'image/jpeg' });
      $<HTMLElement>('#exAfter').innerHTML =
        statCell(t('exifclean.stat.before'), size(raw.length)) + statCell(t('exifclean.stat.after'), size(cleaned.length), true);
      say(t('exifclean.say.done', { from: size(raw.length), to: size(cleaned.length) }), 'ok');
      Toolbox.trackUse?.('strip');
      return { blob, name: fileName.replace(/\.[^.]+$/, '') + t('exifclean.file.suffix') + '.jpg' };
    },
  };
}

defineTool({
  id: 'exifclean',
  namespace: 'exifclean',
  tabLabel: () => t('exifclean.tab', undefined, '정보 지우기'),
  ids: { drop: 'exDrop', file: 'exFile', status: 'exStatus', run: 'exRun', save: 'exSave' },
  accept: 'image/jpeg',
  dropLabel: () => t('exifclean.drop'),
  dropHint: () => t('exifclean.status.idle'),
  runLabel: () => t('exifclean.btn.run'),
  saveLabel: () => t('exifclean.btn.save'),
  body: () => `
    <div class="tool-list" id="exList"></div>
    <div class="cc-stats" id="exStats"></div>`,
  result: () => `<div class="cc-stats" id="exAfter"></div>`,
  setup,
});
