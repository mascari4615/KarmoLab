export interface MediaItem { id: string; kind: 'image' | 'video'; src: string; title?: string; poster?: string }
export interface MediaListOptions<T> {
  key?: (item: T) => string;
  thumbnail?: (item: T) => string;
  label?: (item: T) => string;
  caption?: (item: T) => string;
  selection?: 'none' | 'single' | 'multiple';
  minItemWidth?: number;
  aspectRatio?: number;
  captionHeight?: number;
  fit?: 'contain' | 'cover';
  createImage?: () => HTMLImageElement;
  onActivate?: (item: T) => void;
  onSelectionChange?: (items: T[]) => void;
  overscan?: number;
}
export function createMediaList<T = MediaItem>(host: HTMLElement, options?: MediaListOptions<T>): {
  setItems(items: T[]): void;
  setSelected(ids: Iterable<string>): void;
  setCurrent(id: string): void;
  selectedItems(): T[];
  ensureVisible(id: string): void;
  dispose(): void;
};
export function virtualGrid<T>(host: HTMLElement, options: {
  key(item: T): string; create(item: T): HTMLElement; update?(element: HTMLElement, item: T): void;
  heightOf(item: T, width: number): number; afterRender?(): void; scrollRoot?: HTMLElement;
  overscan?: number; retain?: number; windowed?(): boolean;
}): { set(items: T[]): void; keys(): string[]; ensureVisible(id: string): void; dispose(): void };
export function nextItem<T>(items: T[], selected: string, direction: number, options?: { key?: (item: T) => string; focused?: string; boundary?: 'clamp' | 'stop' }): T | null;
export function mediaPosition<T>(items: T[], selected: string, key?: (item: T) => string): { index: number; total: number; previous: boolean; next: boolean };
export function librarySwipe(element: HTMLElement, enabled: () => boolean, step: (direction: number) => void, options?: {video?: boolean}): () => void;
export function galleryZoom(image: HTMLImageElement, surface: HTMLElement, changed?: (zoomed: boolean) => void): {reset(): void; toggle(): void; dispose(): void; readonly zoomed: boolean};
export type MediaPhase = 'idle' | 'loading' | 'ready' | 'error';
export interface MediaLabels { title: string; zoom: string; fit: string; close: string; previous: string; next: string; error: string; loading: string; retry: string }
export function createMediaSurface(options: {image: HTMLImageElement; video: HTMLVideoElement; onError?: (item: MediaItem) => void; onState?: (phase: MediaPhase, item: MediaItem | null) => void; observeState?: (target: HTMLElement, update: (phase: 'ready' | 'error') => void, signal: AbortSignal) => boolean}): {show(item: MediaItem): void; retry(): void; readonly state: MediaPhase; clear(): void; dispose(): void};
export function createMediaStatus(options: {host: HTMLElement; labels: Pick<MediaLabels, 'loading' | 'retry' | 'error'>; retry: () => void; overlay?: boolean}): {element: HTMLElement; update(phase: MediaPhase): void; dispose(): void};
export function createMediaViewer(options: {parent?: HTMLElement; labels: MediaLabels; onSelect?: (item: MediaItem) => void; actions?: {label: string; render(item: MediaItem, host: HTMLElement): void; openByDefault?: () => boolean}; beforeChange?: (item: MediaItem | null) => boolean; onClose?: () => void}): { open(items: MediaItem[], id: string, source?: Element | null): void; showActions(open: boolean): void; readonly opened: boolean; close(): void; dispose(): void };
