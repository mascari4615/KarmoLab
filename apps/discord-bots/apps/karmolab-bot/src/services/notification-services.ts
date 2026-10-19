import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from '../paths';
import { provisionInstanceLabel, channelIdFor } from './channel-provision';
import { notificationDefinitions, type NotificationDefinition, type NotificationField } from './notification-definitions';

type Values = Record<string, number | string[]>;
interface Preference { enabled?: boolean; running?: boolean; values?: Values }
interface Saved { version: number; services: Record<string, Preference> }
export interface NotificationLifecycle {
  start(explicit: boolean): void | Promise<void>; stop(): void | Promise<void>;
  isRunning(): boolean; detail?(): string;
}
interface Observation { sent: number; skipped: number; failed: number; lastSentAt?: string; lastErrorAt?: string }
export class NotificationControlError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}

export class NotificationServices {
  private saved?: Saved;
  private readonly definitions = new Map<string, NotificationDefinition>();
  private readonly lifecycles = new Map<string, NotificationLifecycle>();
  private readonly observations = new Map<string, Observation>();
  private readonly errors = new Set<string>();
  private changing = false;

  constructor(private readonly file: string, definitions: NotificationDefinition[] = notificationDefinitions, private readonly env: NodeJS.ProcessEnv = process.env) {
    for (const definition of definitions) this.register(definition);
  }
  register(definition: NotificationDefinition): void {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.id) || this.definitions.has(definition.id)) throw new Error('duplicate_or_invalid_service');
    this.definitions.set(definition.id, definition);
  }
  has(id: string): boolean { return this.definitions.has(id); }
  private definition(id: string): NotificationDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new NotificationControlError('service_not_found', 404);
    return definition;
  }
  private load(): Saved {
    if (this.saved) return this.saved;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Saved;
      if (!Number.isSafeInteger(parsed.version) || parsed.version < 0 || !parsed.services || typeof parsed.services !== 'object' || Array.isArray(parsed.services)) throw new Error('invalid_settings');
      for (const [id, preference] of Object.entries(parsed.services)) {
        if (this.definitions.has(id)) this.validatePreference(id, preference);
      }
      this.saved = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new NotificationControlError('settings_unavailable', 503);
      this.saved = { version: 0, services: {} };
    }
    return this.saved;
  }
  private persist(next: Saved): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(this.file + '.tmp', this.file);
    this.saved = next;
  }
  private fieldValue(field: NotificationField): number | string[] {
    const raw = field.env ? this.env[field.env] : undefined;
    if (field.type === 'choices') {
      if (raw === undefined || !raw.trim()) return [...field.default as string[]];
      if (['off', '0', 'false', 'none'].includes(raw.trim().toLowerCase())) return [];
      const selected = raw.split(',').map(value => value.trim()).filter(value => field.options?.some(option => option.value === value));
      return selected.length ? [...new Set(selected)] : [...field.default as string[]];
    }
    const value = raw ? Number(raw) : field.default as number;
    return Number.isFinite(value) ? Math.min(field.max!, Math.max(field.min!, value)) : field.default;
  }
  setting<T extends number | string[]>(id: string, key: string): T {
    const field = this.definition(id).fields?.find(item => item.key === key);
    if (!field) throw new NotificationControlError('setting_not_found');
    return (this.load().services[id]?.values?.[key] ?? this.fieldValue(field)) as T;
  }
  enabled(id: string): boolean { this.definition(id); return this.load().services[id]?.enabled !== false; }
  private validatePreference(id: string, input: Preference): void {
    const definition = this.definition(id);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['enabled', 'running', 'values'].includes(key))) throw new NotificationControlError('invalid_settings');
    for (const key of ['enabled', 'running'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new NotificationControlError('invalid_settings');
    if (input.values !== undefined) {
      if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) throw new NotificationControlError('invalid_settings');
      for (const [key, value] of Object.entries(input.values)) {
        const field = definition.fields?.find(item => item.key === key);
        if (!field || (field.type === 'number'
          ? !Number.isInteger(value) || typeof value !== 'number' || value < field.min! || value > field.max!
          : !Array.isArray(value) || value.length > (field.options?.length ?? 0) || new Set(value).size !== value.length || value.some(option => !field.options?.some(item => item.value === option)))) throw new NotificationControlError('invalid_settings');
      }
    }
  }
  async bind(id: string, lifecycle: NotificationLifecycle): Promise<void> {
    this.definition(id);
    this.lifecycles.set(id, lifecycle);
    try { if (this.load().services[id]?.running !== false) await lifecycle.start(this.load().services[id]?.running === true); }
    catch { this.errors.add(id); }
  }
  async change(id: string, version: number, patch: Preference): Promise<void> {
    this.validatePreference(id, patch);
    if (this.changing) throw new NotificationControlError('change_in_progress', 409);
    const current = this.load();
    if (version !== current.version) throw new NotificationControlError('settings_conflict', 409);
    const lifecycle = this.lifecycles.get(id);
    if (patch.running !== undefined && !lifecycle) throw new NotificationControlError('lifecycle_not_supported', 409);
    const next: Saved = { version: current.version + 1, services: { ...current.services, [id]: { ...current.services[id], ...patch, values: { ...current.services[id]?.values, ...patch.values } } } };
    this.changing = true;
    try {
      this.persist(next);
      this.errors.delete(id);
      if (lifecycle && (patch.running !== undefined || (patch.values && lifecycle.isRunning()))) {
        await lifecycle.stop();
        if (next.services[id].running !== false) {
          await lifecycle.start(true);
          if (!lifecycle.isRunning()) throw new NotificationControlError('service_not_configured', 409);
        }
      }
    } catch (error) {
      this.errors.add(id);
      if (this.saved === next && patch.running !== undefined && lifecycle && lifecycle.isRunning() !== patch.running) {
        this.persist({ ...next, services: { ...next.services, [id]: { ...next.services[id], running: lifecycle.isRunning() } } });
      }
      if (error instanceof NotificationControlError) throw error;
      throw new NotificationControlError('change_failed', 503);
    } finally { this.changing = false; }
  }
  async deliver<T>(id: string, send: () => T, channelId?: string): Promise<Awaited<T> | undefined> {
    const managedChannel = channelIdFor('ops-report');
    if (channelId && managedChannel && channelId !== managedChannel) return await send();
    const observation = this.observations.get(id) ?? { sent: 0, skipped: 0, failed: 0 };
    this.observations.set(id, observation);
    if (!this.enabled(id) || this.load().services[id]?.running === false) { observation.skipped++; return undefined; }
    try {
      const result = await send();
      observation.sent++; observation.lastSentAt = new Date().toISOString();
      return result;
    } catch (error) {
      observation.failed++; observation.lastErrorAt = new Date().toISOString();
      throw error;
    }
  }
  snapshot() {
    const saved = this.load();
    return { version: saved.version, services: [...this.definitions.values()].map(definition => {
      const lifecycle = this.lifecycles.get(definition.id);
      let running: boolean | null = null, detail = '';
      if (lifecycle) {
        try { running = lifecycle.isRunning(); detail = lifecycle.detail?.() ?? ''; }
        catch { this.errors.add(definition.id); detail = '실행 상태를 확인하지 못했습니다.'; }
      }
      return { ...definition, kind: 'managed' as const, enabled: this.enabled(definition.id),
        fields: definition.fields?.map(field => ({ ...field, env: undefined, value: this.setting(definition.id, field.key) })) ?? [],
        lifecycle: lifecycle ? { running, detail, error: this.errors.has(definition.id) } : null,
        observation: this.observations.get(definition.id) ?? { sent: 0, skipped: 0, failed: 0 },
      };
    }) };
  }
}

export const notificationServices = new NotificationServices(path.join(PKG_ROOT, 'data', `notification-services.${provisionInstanceLabel()}.json`));
