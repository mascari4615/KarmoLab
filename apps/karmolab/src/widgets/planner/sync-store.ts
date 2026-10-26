import type { DashRepoWrite } from '../mydash/kit';

export const PLANNER_KEYS = {
    diary: 'karmolab_planner_diary',
    tasks: 'karmolab_planner_tasks',
    events: 'karmolab_planner_events'
} as const;
type Collection = keyof typeof PLANNER_KEYS;
type Row = Record<string, unknown>;
interface Operation {
    id: string;
    collection: Collection;
    key: string;
    parents: string[];
    at: number;
    value: Row | null;
}
interface Batch { schema: 'planner-sync/1'; id: string; ops: Operation[] }
export type PlannerSyncState = { phase: 'pending' | 'syncing' | 'synced' | 'error'; message: string };
type SharedWindow = Window & { KarmoPlannerSyncWriter?: (key: string, rows: unknown[]) => void };
let state: PlannerSyncState = { phase: 'pending', message: '자동 동기화 연결 중' };

export function plannerSyncState(): PlannerSyncState { return state; }
function announce(next: PlannerSyncState): void {
    state = next;
    window.dispatchEvent(new Event('planner-sync-status'));
}
function rowKey(collection: Collection, row: Row): string {
    const key = row[collection === 'diary' ? 'date' : 'id'];
    if (typeof key !== 'string' || !key) throw new Error('기존 기록의 이름을 읽을 수 없어요.');
    return key;
}
function validateRow(collection: Collection, raw: unknown): Row {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('기록 형식을 확인해 주세요.');
    const row = raw as Row;
    rowKey(collection, row);
    if (collection === 'diary' ? typeof row.text !== 'string' : typeof row.title !== 'string') throw new Error('기록 본문을 읽을 수 없어요.');
    if (collection === 'events' && (typeof row.start !== 'string' || typeof row.end !== 'string' || typeof row.allDay !== 'boolean')) throw new Error('일정 날짜를 읽을 수 없어요.');
    if (collection === 'tasks' && !['todo', 'inProgress', 'done'].includes(String(row.column))) throw new Error('할 일 상태를 읽을 수 없어요.');
    return row;
}
function readRows(storage: Storage, collection: Collection): Row[] {
    const raw = storage.getItem(PLANNER_KEYS[collection]);
    const rows: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error('기존 기록을 보존했어요. 저장 형식을 확인해 주세요.');
    const result = rows.map(row => validateRow(collection, row));
    if (new Set(result.map(row => rowKey(collection, row))).size !== result.length) throw new Error('기록 이름이 중복돼 동기화를 멈췄어요.');
    return result;
}
function parseBatch(raw: unknown): Batch {
    const batch = raw as Batch;
    if (!batch || batch.schema !== 'planner-sync/1' || typeof batch.id !== 'string' || !/^[\w-]+$/.test(batch.id) || !Array.isArray(batch.ops)) throw new Error('동기화 기록 형식을 확인해 주세요.');
    for (const op of batch.ops) {
        if (!op || !Object.prototype.hasOwnProperty.call(PLANNER_KEYS, op.collection) || typeof op.id !== 'string' || typeof op.key !== 'string' || !Array.isArray(op.parents) || !op.parents.every(id => typeof id === 'string') || !Number.isFinite(op.at)) throw new Error('동기화 기록을 읽지 못했어요.');
        if (op.value !== null && rowKey(op.collection, validateRow(op.collection, op.value)) !== op.key) throw new Error('동기화 기록 이름이 달라요.');
    }
    return batch;
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
    private heads(ops: Operation[]): Operation[] {
        const superseded = new Set(ops.flatMap(op => op.parents));
        return ops.filter(op => !superseded.has(op.id)).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    }
    private append(ops: Omit<Operation, 'id'>[]): void {
        if (!ops.length) return;
        const id = this.uuid();
        const batch: Batch = { schema: 'planner-sync/1', id, ops: ops.map((op, i) => ({ ...op, id: id + '-' + i })) };
        this.storage.setItem(this.prefix + 'batch.' + id, JSON.stringify(batch));
    }
    migrate(): void {
        if (this.storage.getItem(this.prefix + 'migrated')) return;
        // Validate every collection before recording or replacing any legacy data.
        const collections = Object.keys(PLANNER_KEYS) as Collection[];
        const rows = collections.map(collection => ({ collection, rows: readRows(this.storage, collection) }));
        this.append(rows.flatMap(({ collection, rows }) => rows.map(value => ({ collection, key: rowKey(collection, value), parents: [], at: 0, value }))));
        this.storage.setItem(this.prefix + 'migrated', '1');
    }
    write(collection: Collection, rows: Row[]): void {
        const old = readRows(this.storage, collection);
        rows.forEach(row => validateRow(collection, row));
        const before = new Map(old.map(row => [rowKey(collection, row), row]));
        const after = new Map(rows.map(row => [rowKey(collection, row), row]));
        const all = this.ops();
        const at = all.reduce((at, op) => Math.max(at, op.at + 1), Date.now());
        const ops: Omit<Operation, 'id'>[] = [];
        for (const key of new Set([...before.keys(), ...after.keys()])) {
            if (JSON.stringify(before.get(key)) === JSON.stringify(after.get(key))) continue;
            const heads = this.heads(all.filter(op => op.collection === collection && op.key === key));
            ops.push({ collection, key, parents: heads.map(op => op.id), at, value: after.get(key) || null });
        }
        // The durable journal precedes the cache; a failed cache write is recoverable.
        this.append(ops);
        this.apply();
    }
    apply(): boolean {
        const all = this.ops();
        for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) readRows(this.storage, collection);
        let changed = false;
        for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) {
            readRows(this.storage, collection);
            const groups = new Map<string, Operation[]>();
            for (const op of all.filter(op => op.collection === collection)) groups.set(op.key, [...(groups.get(op.key) || []), op]);
            const rows: Row[] = [];
            for (const ops of groups.values()) {
                const heads = this.heads(ops);
                const winner = heads[heads.length - 1];
                if (!winner?.value) continue;
                let value = winner.value;
                if (collection === 'diary') {
                    // Concurrent diary edits retain both texts; a later edit resolves all heads.
                    const texts = [...new Set(heads.flatMap(op => op.value ? [String(op.value.text)] : []))];
                    const distinct = texts.filter(text => !texts.some(other => other !== text && other.startsWith(text)));
                    value = { ...value, text: distinct.join('\n\n[다른 기기 기록]\n\n') };
                }
                rows.push(value);
            }
            rows.sort((a, b) => rowKey(collection, a).localeCompare(rowKey(collection, b)));
            const next = JSON.stringify(rows);
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
        const prefix = 'planner/sync/';
        const files = await repo.tree(repo.eventsBranch);
        if (this.stopped) return;
        for (const file of files.filter(file => file.type === 'file' && file.path.startsWith(prefix) && file.path.endsWith('.json'))) {
            const id = file.path.slice(prefix.length, -5);
            if (this.storage.getItem(this.prefix + 'ack.' + id)) continue;
            const batch = parseBatch(await repo.readJson(file.path, { ref: repo.eventsBranch }));
            if (this.stopped) return;
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
    try { journal.migrate(); journal.apply(); }
    catch { announce({ phase: 'error', message: '기존 기록을 읽지 못해 동기화를 멈췄어요. 원본은 보존했어요.' }); return () => { journal.stopped = true; if (shared.KarmoPlannerSyncWriter === writer) delete shared.KarmoPlannerSyncWriter; }; }
    const schedule = (delay = 600): void => {
        if (journal.stopped) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { void run(); }, delay);
    };
    const run = async (): Promise<void> => {
        if (journal.stopped) return;
        if (syncing) { dirty = true; return; }
        syncing = true;
        dirty = false;
        announce({ phase: 'syncing', message: '기기 간 기록 동기화 중' });
        try {
            await journal.sync(repo);
            if (journal.stopped) return;
            failures = 0;
            announce(journal.pending() ? { phase: 'pending', message: '이 기기에 저장됨, 동기화 대기' } : { phase: 'synced', message: '기기 간 자동 동기화됨' });
        } catch (error) {
            if (journal.stopped) return;
            failures++;
            const kind = (error as { kind?: string }).kind;
            announce({ phase: 'error', message: kind === 'perm' ? '이 기기에 저장됨. 동기화 쓰기 권한을 확인해 주세요.' : kind === 'auth' ? '이 기기에 저장됨. 다시 로그인하면 동기화해요.' : '이 기기에 저장됨. 연결되면 동기화를 다시 시도해요.' });
        } finally {
            syncing = false;
            if (!journal.stopped && !document.hidden) schedule(dirty ? 600 : Math.min(300000, 45000 * 2 ** Math.min(failures, 3)));
        }
    };
    const changed = (): void => { dirty = true; announce({ phase: 'pending', message: '이 기기에 저장됨, 동기화 대기' }); schedule(); };
    const visible = (): void => { if (!document.hidden) schedule(0); };
    const storage = (event: StorageEvent): void => {
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
