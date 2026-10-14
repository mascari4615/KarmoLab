export interface MediaItem { id: string; kind: 'image' | 'video'; src: string; title?: string; poster?: string }
export function nextItem<T>(items: T[], selected: string, direction: number, options?: { key?: (item: T) => string; focused?: string; boundary?: 'clamp' | 'stop' }): T | null;
export function mediaPosition<T>(items: T[], selected: string, key?: (item: T) => string): { index: number; total: number; previous: boolean; next: boolean };
export function librarySwipe(element: HTMLElement, enabled: () => boolean, step: (direction: number) => void, options?: {video?: boolean}): () => void;
export function galleryZoom(image: HTMLImageElement, surface: HTMLElement, changed?: (zoomed: boolean) => void): {reset(): void; toggle(): void; dispose(): void; readonly zoomed: boolean};
export function createMediaSurface(options: {image: HTMLImageElement; video: HTMLVideoElement; onError?: (item: MediaItem) => void}): {show(item: MediaItem): void; clear(): void; dispose(): void};
export function createMediaViewer(options: {parent?: HTMLElement; labels: { title: string; zoom: string; fit: string; close: string; previous: string; next: string; error: string }; onSelect?: (item: MediaItem) => void}): { open(items: MediaItem[], id: string, source?: Element | null): void; close(): void; dispose(): void };
