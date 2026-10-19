# Media browser

Shared navigation, media lifecycle, touch gestures, image zoom and viewer.

- `createMediaList(host, options)`: virtualized thumbnail list, native keyboard buttons, current item and optional single/multiple selection. Selection survives unmounting cards during scroll. `setItems` preserves only selections whose keys remain in the list; programmatic `setSelected` does not emit a user callback.
- List options: `key`, `thumbnail`, `label`, `caption`, `selection` (`none`, `single`, `multiple`), `minItemWidth`, `aspectRatio`, `captionHeight`, `fit`, `createImage`, `overscan`, `onActivate`, `onSelectionChange`. `caption` defaults to the accessible `label` and can use a shorter visual caption. Apps can provide their encrypted/progressive image factory. List owns card geometry and captions so overflow cannot collapse rows. Items are supplied in display order; the module does not fetch application data.
- `virtualGrid`: lower-level shared windowing for apps with domain-specific cards. Existing galleries use the same implementation, without maintaining a second copy.

- `nextItem` and `mediaPosition`: filtered order, focused item and boundaries.
- `createMediaSurface`: image/video switching, stale error cancellation and playback cleanup.
- `librarySwipe` and `galleryZoom`: native video controls, vertical scrolling, pinch and drag.
- `createMediaViewer`: accessible dialog, previous/next, zoom, error state and focus restoration.

Apps supply media IDs, URLs, translated labels and domain actions. The module does not store bookmarks or generation data.

Run `node packages/media-browser/test.mjs` from this repository.
KarmoAI generates its deployable module with `node projects/karmo-ai/scripts/build-media-browser.mjs` from the sibling memo checkout. `--check` rejects drift. Only this package is editable source; the generated vendor file is a build output.
