# Media browser

Shared navigation, media lifecycle, touch gestures, image zoom and viewer.

- `nextItem` and `mediaPosition`: filtered order, focused item and boundaries.
- `createMediaSurface`: image/video switching, stale error cancellation and playback cleanup.
- `librarySwipe` and `galleryZoom`: native video controls, vertical scrolling, pinch and drag.
- `createMediaViewer`: accessible dialog, previous/next, zoom, error state and focus restoration.

Apps supply media IDs, URLs, translated labels and domain actions. The module does not store bookmarks or generation data.

Run `node packages/media-browser/test.mjs` from this repository.
KarmoAI generates its deployable module with `node projects/karmo-ai/scripts/build-media-browser.mjs` from the sibling memo checkout. `--check` rejects drift. Only this package is editable source; the generated vendor file is a build output.
