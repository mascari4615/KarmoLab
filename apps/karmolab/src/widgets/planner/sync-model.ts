// Shared journal protocol for browser synchronization and automation clients.
export const PLANNER_KEYS = {
    diary: 'karmolab_planner_diary',
    tasks: 'karmolab_planner_tasks',
    events: 'karmolab_planner_events'
} as const;
export type Collection = keyof typeof PLANNER_KEYS;
export type Row = Record<string, unknown>;
export interface Operation {
    id: string;
    collection: Collection;
    key: string;
    parents: string[];
    at: number;
    value: Row | null;
}
export interface Batch { schema: 'planner-sync/1'; id: string; ops: Operation[] }

export function rowKey(collection: Collection, row: Row): string {
    const key = row[collection === 'diary' ? 'date' : 'id'];
    if (typeof key !== 'string' || !key) throw new Error('기존 기록의 이름을 읽을 수 없어요.');
    return key;
}
export function validateRow(collection: Collection, raw: unknown): Row {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('기록 형식을 확인해 주세요.');
    const row = raw as Row;
    rowKey(collection, row);
    if (collection === 'diary' ? typeof row.text !== 'string' : typeof row.title !== 'string') throw new Error('기록 본문을 읽을 수 없어요.');
    if (collection === 'events' && (typeof row.start !== 'string' || typeof row.end !== 'string' || typeof row.allDay !== 'boolean')) throw new Error('일정 날짜를 읽을 수 없어요.');
    if (collection === 'tasks' && !['todo', 'inProgress', 'done'].includes(String(row.column))) throw new Error('할 일 상태를 읽을 수 없어요.');
    return row;
}
export function parseBatch(raw: unknown): Batch {
    const batch = raw as Batch;
    if (!batch || batch.schema !== 'planner-sync/1' || typeof batch.id !== 'string' || !/^[\w-]+$/.test(batch.id) || !Array.isArray(batch.ops)) throw new Error('동기화 기록 형식을 확인해 주세요.');
    for (const op of batch.ops) {
        if (!op || !Object.prototype.hasOwnProperty.call(PLANNER_KEYS, op.collection) || typeof op.id !== 'string' || typeof op.key !== 'string' || !Array.isArray(op.parents) || !op.parents.every(id => typeof id === 'string') || !Number.isFinite(op.at)) throw new Error('동기화 기록을 읽지 못했어요.');
        if (op.value !== null && rowKey(op.collection, validateRow(op.collection, op.value)) !== op.key) throw new Error('동기화 기록 이름이 달라요.');
    }
    return batch;
}
export function plannerHeads(ops: Operation[]): Operation[] {
    const superseded = new Set(ops.flatMap(op => op.parents));
    return ops.filter(op => !superseded.has(op.id)).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
export function materializePlanner(all: Operation[]): Record<Collection, Row[]> {
    const result = { diary: [], tasks: [], events: [] } as Record<Collection, Row[]>;
    for (const collection of Object.keys(PLANNER_KEYS) as Collection[]) {
        const groups = new Map<string, Operation[]>();
        for (const op of all.filter(op => op.collection === collection)) groups.set(op.key, [...(groups.get(op.key) || []), op]);
        for (const ops of groups.values()) {
            const heads = plannerHeads(ops);
            const winner = heads[heads.length - 1];
            if (!winner?.value) continue;
            let value = winner.value;
            if (collection === 'diary') {
                const texts = [...new Set(heads.flatMap(op => op.value ? [String(op.value.text)] : []))];
                const distinct = texts.filter(text => !texts.some(other => other !== text && other.startsWith(text)));
                value = { ...value, text: distinct.join('\n\n[다른 기기 기록]\n\n') };
            }
            result[collection].push(value);
        }
        result[collection].sort((a, b) => rowKey(collection, a).localeCompare(rowKey(collection, b)));
    }
    return result;
}
