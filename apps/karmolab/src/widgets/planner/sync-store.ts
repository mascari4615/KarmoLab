import type { DashRepoWrite } from '../mydash/kit';
import { PLANNER_KEYS, rowKey, validateRow, parseBatch, plannerHeads, materializePlanner, type Collection, type Row, type Operation, type Batch } from './sync-model';
export { PLANNER_KEYS } from './sync-model';
export const PLANNER_IMPORT_KEY = 'karmolab_planner_pending_import';
const CACHE_OWNER_KEY = 'planner.sync.cache-owner';
export type PlannerSyncState = { phase: 'pending' | 'syncing' | 'synced' | 'error'; message: string };
type SharedWindow = Window & { KarmoPlannerSyncWriter?: (key: string, rows: unknown[]) => void };
let state: PlannerSyncState = { phase: 'pending', message: '자동 동기화 연결 중' };

export function plannerSyncState(): PlannerSyncState { return state; }
function announce(next: PlannerSyncState): void {
    state = next;
    window.dispatchEvent(new Event('planner-sync-status'));
}
function readRows(storage: Storage, collection: Collection): Row[] {
    const raw = storage.getItem(PLANNER_KEYS[collection]);
    const rows: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error('기존 기록을 보존했어요. 저장 형식을 확인해 주세요.');
    const result = rows.map(row => validateRow(collection, row));
    if (new Set(result.map(row => rowKey(collection, row))).size !== result.length) throw new Error('기록 이름이 중복돼 동기화를 멈췄어요.');
    return result;
}

/** Append-only journal, with the existing planner arrays as local read caches. */
export class PlannerJournal {
    readonly prefix: string;
    stopped = false;
    private busy: Promise<void> | null = null;
    constructor(readonly storage: Storage, scope: string, private changed: () => void = () => {}, private uuid = () => crypto.randomUUID()) {
        this.prefix = 'planner.sync.' + encodeURIComponent(scope) + '.';
    }
    batches(): Batch[] {
        const batches: Batch[] = [];
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i)!;
            if (key.startsWith(this.prefix + 'batch.')) batches.push(parseBatch(JSON.parse(this.storage.getItem(key)!)));
        }
        return batches;
    }
    private ops(): Operation[] { return this.batches().flatMap(batch => batch.ops); }
    ownsCache(): boolean { return this.storage.getItem(CACHE_OWNER_KEY) === this.prefix; }
    private requireCacheOwner(): void {
        if (!this.ownsCache()) throw new Error('다른 저장소가 열려 있어 기록 동기화를 멈췄어요. 이 저장소를 다시 열어 주세요.');
    }
    private append(ops: Omit<Operation, 'id'>[]): void {
        if (!ops.length) return;
        const id = this.uuid();
        const batch: Batch = { schema: 'planner-sync/1', id, ops: ops.map((op, i) => ({ ...op, id: id + '-' + i })) };
        this.storage.setItem(this.prefix + 'batch.' + id, JSON.stringify(batch));
    }
    migrate(): void {
        const migrated = this.storage.getItem(this.prefix + 'migrated');
        if (migrated !== null) {
            if (migrated !== '1') throw new Error('기존 기록의 이관 상태를 확인해 주세요.');
            for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) readRows(this.storage, collection);
            this.storage.setItem(CACHE_OWNER_KEY, this.prefix);
            return;
        }
        // Validate every collection before recording or replacing any legacy data.
        const collections = Object.keys(PLANNER_KEYS) as Collection[];
        const rows = collections.map(collection => ({ collection, rows: readRows(this.storage, collection) }));
        let otherScope = false;
        for (let i = 0; i < this.storage.length; i++) {
            const match = this.storage.key(i)?.match(/^planner\.sync\.(.+)\.(?:migrated|batch\.[^.]+|ack\.[^.]+)$/);
            if (match && 'planner.sync.' + match[1] + '.' !== this.prefix) otherScope = true;
        }
        // Shared caches belong to an existing journal; only the first scope imports legacy rows.
        if (!otherScope) this.append(rows.flatMap(({ collection, rows }) => rows.map(value => ({ collection, key: rowKey(collection, value), parents: [], at: 0, value }))));
        this.storage.setItem(this.prefix + 'migrated', '1');
        this.storage.setItem(CACHE_OWNER_KEY, this.prefix);
    }
    importPending(): void {
        this.requireCacheOwner();
        const raw = this.storage.getItem(PLANNER_IMPORT_KEY);
        if (raw === null) return;
        const payload: unknown = JSON.parse(raw);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('가져올 기록 형식을 확인해 주세요.');
        const all = this.ops();
        const at = all.reduce((at, op) => Math.max(at, op.at + 1), Date.now());
        const ops: Omit<Operation, 'id'>[] = [];
        for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) {
            const value = (payload as Record<string, unknown>)[PLANNER_KEYS[collection]];
            if (value === undefined) continue;
            if (typeof value !== 'string') throw new Error('가져올 기록 형식을 확인해 주세요.');
            const rows: unknown = JSON.parse(value);
            if (!Array.isArray(rows)) throw new Error('가져올 기록 형식을 확인해 주세요.');
            const imported = new Set<string>();
            for (const rawRow of rows) {
                const row = validateRow(collection, rawRow);
                const key = rowKey(collection, row);
                if (imported.has(key)) throw new Error('가져올 기록 이름이 중복돼요.');
                imported.add(key);
                const heads = plannerHeads(all.filter(op => op.collection === collection && op.key === key));
                // Explicit imports replace matching rows, including intentional restoration of a deletion.
                if (heads.length === 1 && JSON.stringify(heads[0].value) === JSON.stringify(row)) continue;
                ops.push({ collection, key, parents: heads.map(op => op.id), at, value: row });
            }
        }
        this.append(ops);
        this.apply();
        this.storage.removeItem(PLANNER_IMPORT_KEY);
    }
    write(collection: Collection, rows: Row[]): void {
        this.requireCacheOwner();
        const old = readRows(this.storage, collection);
        rows.forEach(row => validateRow(collection, row));
        const before = new Map(old.map(row => [rowKey(collection, row), row]));
        const after = new Map(rows.map(row => [rowKey(collection, row), row]));
        const all = this.ops();
        const at = all.reduce((at, op) => Math.max(at, op.at + 1), Date.now());
        const ops: Omit<Operation, 'id'>[] = [];
        for (const key of new Set([...before.keys(), ...after.keys()])) {
            if (JSON.stringify(before.get(key)) === JSON.stringify(after.get(key))) continue;
            const heads = plannerHeads(all.filter(op => op.collection === collection && op.key === key));
            ops.push({ collection, key, parents: heads.map(op => op.id), at, value: after.get(key) || null });
        }
        // The durable journal precedes the cache; a failed cache write is recoverable.
        this.append(ops);
        this.apply();
    }
    apply(): boolean {
        this.requireCacheOwner();
        const all = this.ops();
        for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) readRows(this.storage, collection);
        const materialized = materializePlanner(all);
        let changed = false;
        for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) {
            readRows(this.storage, collection);
            const next = JSON.stringify(materialized[collection]);
            const key = PLANNER_KEYS[collection];
            if ((this.storage.getItem(key) || '[]') !== next) { this.storage.setItem(key, next); changed = true; }
        }
        return changed;
    }
    sync(repo: DashRepoWrite): Promise<void> {
        if (this.busy) return this.busy;
        this.busy = this.exchange(repo).finally(() => { this.busy = null; });
        return this.busy;
    }
    private async exchange(repo: DashRepoWrite): Promise<void> {
        this.requireCacheOwner();
        const prefix = 'planner/sync/';
        const files = await repo.tree(repo.eventsBranch);
        if (this.stopped) return;
        this.requireCacheOwner();
        for (const file of files.filter(file => file.type === 'file' && file.path.startsWith(prefix) && file.path.endsWith('.json'))) {
            const id = file.path.slice(prefix.length, -5);
            if (this.storage.getItem(this.prefix + 'ack.' + id)) continue;
            const batch = parseBatch(await repo.readJson(file.path, { ref: repo.eventsBranch }));
            if (this.stopped) return;
            this.requireCacheOwner();
            if (batch.id !== id) throw new Error('동기화 파일 이름이 달라요.');
            this.storage.setItem(this.prefix + 'batch.' + id, JSON.stringify(batch));
            this.storage.setItem(this.prefix + 'ack.' + id, '1');
        }
        // Local edits made while awaiting the network are included in this fresh read.
        if (this.stopped) return;
        if (this.apply()) this.changed();
        const pending = this.batches().filter(batch => !this.storage.getItem(this.prefix + 'ack.' + batch.id));
        if (pending.length) {
            await repo.putNewJsonMany(pending.map(batch => ({ path: prefix + batch.id + '.json', value: batch })), 'sync planner records');
            if (this.stopped) return;
            this.requireCacheOwner();
            for (const batch of pending) this.storage.setItem(this.prefix + 'ack.' + batch.id, '1');
        }
    }
    pending(): boolean { return this.batches().some(batch => !this.storage.getItem(this.prefix + 'ack.' + batch.id)); }
}

export function writePlannerCollection(key: string, rows: unknown[]): void {
    const collection = (Object.keys(PLANNER_KEYS) as Collection[]).find(collection => PLANNER_KEYS[collection] === key);
    if (!collection) throw new Error('알 수 없는 플래너 기록');
    const writer = typeof window === 'undefined' ? undefined : (window as SharedWindow).KarmoPlannerSyncWriter;
    if (writer) writer(key, rows);
    else { readRows(localStorage, collection); localStorage.setItem(key, JSON.stringify(rows)); }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('planner-local-change'));
}

export function startPlannerSync(repo: DashRepoWrite, scope: string): () => void {
    let timer = 0;
    let syncing = false;
    let dirty = false;
    let failures = 0;
    const notify = (): void => { window.dispatchEvent(new Event('planner-remote-change')); };
    const journal = new PlannerJournal(localStorage, scope, notify);
    // The lazily loaded calendar is another IIFE; its stores must use this same journal.
    const shared = window as SharedWindow;
    const writer = (key: string, rows: unknown[]): void => {
        const collection = (Object.keys(PLANNER_KEYS) as Collection[]).find(collection => PLANNER_KEYS[collection] === key);
        if (!collection) throw new Error('알 수 없는 플래너 기록');
        journal.write(collection, rows as Row[]);
    };
    shared.KarmoPlannerSyncWriter = writer;
    try { journal.migrate(); journal.importPending(); journal.apply(); }
    catch { announce({ phase: 'error', message: '기존 기록을 읽지 못해 동기화를 멈췄어요. 원본은 보존했어요.' }); return () => { journal.stopped = true; if (shared.KarmoPlannerSyncWriter === writer) delete shared.KarmoPlannerSyncWriter; }; }
    const schedule = (delay = 600): void => {
        if (journal.stopped || !journal.ownsCache()) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { void run(); }, delay);
    };
    const run = async (): Promise<void> => {
        if (journal.stopped || !journal.ownsCache()) return;
        if (syncing) { dirty = true; return; }
        syncing = true;
        dirty = false;
        announce({ phase: 'syncing', message: '기기 간 기록 동기화 중' });
        try {
            await journal.sync(repo);
            if (journal.stopped || !journal.ownsCache()) return;
            failures = 0;
            announce(journal.pending() ? { phase: 'pending', message: '이 기기에 저장됨, 동기화 대기' } : { phase: 'synced', message: '기기 간 자동 동기화됨' });
        } catch (error) {
            if (journal.stopped || !journal.ownsCache()) return;
            failures++;
            const kind = (error as { kind?: string }).kind;
            announce({ phase: 'error', message: kind === 'perm' ? '이 기기에 저장됨. 동기화 쓰기 권한을 확인해 주세요.' : kind === 'auth' ? '이 기기에 저장됨. 다시 로그인하면 동기화해요.' : '이 기기에 저장됨. 연결되면 동기화를 다시 시도해요.' });
        } finally {
            syncing = false;
            if (!journal.stopped && journal.ownsCache() && !document.hidden) schedule(dirty ? 600 : Math.min(300000, 45000 * 2 ** Math.min(failures, 3)));
        }
    };
    const changed = (): void => { if (!journal.ownsCache()) return; dirty = true; announce({ phase: 'pending', message: '이 기기에 저장됨, 동기화 대기' }); schedule(); };
    const visible = (): void => { if (!document.hidden) schedule(0); };
    const storage = (event: StorageEvent): void => {
        if (!journal.ownsCache()) return;
        if (!event.key?.startsWith(journal.prefix)) return;
        try { const updated = journal.apply(); if (updated || event.key.startsWith(journal.prefix + 'batch.')) notify(); schedule(); }
        catch { announce({ phase: 'error', message: '이 기기 기록을 읽지 못해 동기화를 멈췄어요. 원본은 보존했어요.' }); }
    };
    window.addEventListener('planner-local-change', changed);
    window.addEventListener('storage', storage);
    window.addEventListener('online', visible);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    schedule(0);
    return () => {
        journal.stopped = true;
        if (shared.KarmoPlannerSyncWriter === writer) delete shared.KarmoPlannerSyncWriter;
        window.clearTimeout(timer);
        window.removeEventListener('planner-local-change', changed);
        window.removeEventListener('storage', storage);
        window.removeEventListener('online', visible);
        window.removeEventListener('focus', visible);
        document.removeEventListener('visibilitychange', visible);
    };
}
