# Article list

One implementation for compact article rows, keyed updates, headings and lazy thumbnail previews.

- Source: `index.js`, `article-list.css`. Host inputs: article data, action buttons, expandable body, preview loader.
- `createArticleRow`, `updateArticleRow`, `articleHeading`, `reconcileArticles`. Host colors and visible columns use CSS variables and scoped overrides.
- Keyboard focus survives updates. Titles use text nodes, links accept HTTP(S), previews hide on blur, pointer exit and Escape. Stale preview responses stay hidden.
- Build both consumer copies: `node packages/article-list/build.mjs`. Validate copies: same command with `--check`. Set `KARMO_MEMO_SRC` for a non-sibling private checkout.
- Generated vendor files have a banner and are not edited directly. The package is the only source.
- Test: `node --test packages/article-list/test.mjs` (KarmoLab jsdom dependency).
