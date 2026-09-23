/**
 * 대시보드가 저장소에서 읽은 파일의 마지막 판. IndexedDB 한 칸 (2026-09-23).
 *
 * 왜: 새로고침마다 북마크 목록 (1.4MB) 을 GitHub 에서 다 받은 뒤에야 칸을 그렸다. 사용자
 * "이미지 새로고침할 때마다 받는 것 같은데". 그림은 디스크 캐시에서 왔고 (6장 중 6장 실측),
 * 늦는 것은 목록 파일. 그래서 마지막 판으로 먼저 그리고 새 판은 뒤에서 받기.
 *
 * 전부 실패해도 조용히 null. 저장소가 막힌 브라우저 (비공개 창) 에서는 예전처럼 매번 받기.
 * 로그아웃하면 비운다 (남의 화면에 내 파일이 남지 않게)
 */

const DB = 'karmolab-mydash';
const STORE = 'reads';

let opening: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise<T | null>((resolve) => {
        if (!d) return resolve(null);
        try {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export function cachedRead(key: string): Promise<string | null> {
  return run<string>('readonly', (s) => s.get(key) as IDBRequest<string>);
}

export function saveRead(key: string, text: string): Promise<unknown> {
  return run('readwrite', (s) => s.put(text, key));
}

export function clearReads(): Promise<unknown> {
  return run('readwrite', (s) => s.clear());
}
