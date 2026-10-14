---
name: KarmoDevExtension
description: System-ui extension controls and a plain reading list.
colors:
  bg: "#f7f8fa"
  surface: "#fff"
  text: "#252936"
  muted: "#596174"
  line: "#dce0e7"
  accent: "#a92857"
  tint: "#f9edf2"
  dark-bg: "#20232c"
  dark-surface: "#282d38"
  dark-text: "#eceef3"
  dark-muted: "#b4bbcd"
  dark-line: "#444b5e"
  dark-accent: "#f19cba"
  dark-tint: "#3c2d3a"
  settings-secondary: "#f0f0f0"
  settings-border: "#ccc"
  settings-hint: "#444"
  settings-tab: "#555"
  settings-active: "#1c7ed6"
  settings-active-text: "#000"
  settings-success: "#0a0"
  settings-fieldset-border: "#ddd"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "clamp(24px, 3vw, 32px)"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.55
  metadata:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.55
rounded:
  control: "6px"
  settings-fieldset: "4px"
spacing:
  label-gap: "6px"
  compact-gap: "12px"
  gap: "16px"
  section-gap: "24px"
components:
  button-refresh:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-refresh-dark:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  input-search:
    typography: "{typography.label}"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    width: "100%"
  select-author:
    typography: "{typography.label}"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    width: "100%"
  failure-notice:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.text}"
    padding: "16px"
  settings-tabs:
    textColor: "{colors.settings-tab}"
    padding: "0.5rem 1rem"
---

# Design System: KarmoDevExtension

## Overview

**Creative North Star: "System-ui extension and reading list"**

The incumbent interface uses the system font, simple controls, and a title-led list. Visual emphasis supports reading and operating the extension. The follow-feed surface adds a restrained pink accent and system theme response to this existing vocabulary.

This document records the host styling in `arca-liked.css`, the follow-feed behavior in `arca-liked.html` and `arca-liked.js`, and related settings patterns in `options.html`. Row structure, title styling, reconciliation, and thumbnail interaction belong to the shared [article-list module](../../packages/article-list/index.js) and its [canonical stylesheet](../../packages/article-list/article-list.css), also used by KarmoAI. Extension `vendor/article-list.*` files are generated copies. Host palette, columns, and control sizing stay local; settings retain native controls and the blue selected-tab indicator. Row tokens and preview snippets are intentionally not duplicated here.

**Key Characteristics:**

- System typography and explicit text labels.
- Flat neutral surfaces with row separators.
- Pink feed actions and writer links; blue settings selection.
- Compact one-line rows with accessible thumbnail previews and visible progress and failure context.

## Colors

### Primary

The feed accent is deep rose in light mode and pale rose in dark mode. It marks the refresh action, writer and utility links, caret, keyboard outline, and text selection. The pale tint supplies row hover and failure-notice backgrounds. Settings use their existing blue active-tab underline and green status text.

### Neutral

The feed separates page background from list and field surfaces with a subtle tonal change and cool gray borders. Main text carries titles and status; muted text carries descriptions, metadata, scope, and footer. The dark palette switches all seven feed custom properties under `prefers-color-scheme: dark`; button text then uses the light palette's dark text token. Settings have a separate native page baseline and explicitly styled gray borders and hints; they do not inherit the feed's custom properties.

## Typography

All described surfaces use `system-ui, sans-serif`. The feed body sets a readable line height, its page heading scales with viewport width, while the shared module supplies regular-weight (14px) row titles and smaller (12px) row metadata. The title-wrap selector overrides the generic title selector's semibold weight. These row values are descriptive observations; the canonical module owns them. Filter labels are semibold. Feed empty-state headings are (20px), bold by the browser heading default. Dates use tabular numbers.

Settings use the same font stack with native heading and control defaults where no override exists. Settings button text is (1rem), hints are (0.9rem), and list editing fields are (0.85rem). Do not assume the feed's body line height or heading size applies to settings.

## Layout

The feed has one centered container with a maximum width of (1080px), including its padding. Desktop padding is (40px 28px). Its header places title and refresh action on opposite sides, with a (24px) gap. Filters use a flexible search field, an author field between (160px) and (240px), and a utility link, with a (16px) gap. The host maps shared row columns to title, author, channel, and date, with fixed trailing widths of (110px), (140px), and (130px). Title and author stay on the same line. The row head minimum is (38px), yielding a nominal (39px) row including its divider.

At a maximum viewport width of (640px), the container uses (24px 16px) padding, the header stacks, refresh becomes full width, and filters become one column with a (12px) gap. Rows keep title and author on one line, using a flexible title column and (76px) author column. Channel and date are hidden. The head minimum is (44px), yielding a nominal (45px) row including its divider, with (2px 6px) padding and a (40px) thumbnail button target. Titles truncate with ellipsis and expose their full text through the link title attribute; error details wrap.

Settings retain a maximum body width of (46rem), (2rem) vertical margin, and (1rem) side padding. Their tabs and fieldsets are ordinary settings groups; control rows wrap using (0.5rem) gaps. The settings source defines no feed-style mobile breakpoint.

## Elevation & Depth

These surfaces have no custom shadows. The feed uses tonal surfaces, single-pixel separators, and hover tint. Settings use fieldset and tab borders. Hover, focus, and disabled styles change immediately; the source defines no transitions or animated movement. The shared thumbnail preview is a fixed, bordered overlay, without a shadow. Its hover delay and retained pointer state are interaction behavior, not decorative animation.

## Shapes

Feed controls have modest corners using the control radius; list rows and notices remain rectangular. Settings fieldsets use the smaller settings radius. Neither feed rows nor failure notices are floating cards.

## Components

### Buttons

The feed refresh button uses the accent fill, a matching border, inherited type, and a minimum height of (44px). Hover applies `brightness(1.1)`. Disabled refresh uses opacity (0.65) and a wait cursor; loading also changes its label. With no followed authors the button is disabled. Keyboard focus uses an accent outline of (3px) with a (3px) offset.

Settings buttons preserve their existing native baseline, (0.45rem 1rem) padding, and gray secondary variant. Their appearance is distinct from the feed refresh button.

### Inputs / Fields

Feed search and author selection use full-width neutral surfaces, a single-pixel border, control-radius corners, (9px 12px) padding, and minimum (44px) height. Labels sit above their fields; fields inherit their labels' semibold (14px) type. Placeholder text uses muted color; keyboard focus uses the same visible outline as links and buttons. The author picker remains a native select.

### Navigation

Settings navigation is a horizontal row of text buttons over a gray bottom rule. Selection adds the blue bottom border, black text, and semibold weight. Feed settings and external-site navigation remain underlined text links. Post title and writer links open their destinations in a new tab.

### Reading List

The host mounts canonical shared rows in an ordered list with a surface background and top border. Rows use single-pixel bottom dividers, tight one-line geometry, and hover tint. Title links underline on hover; author links use the host accent. Host-only CSS hides the shared toggle, post ID, count, and action group and maps the remaining columns. Keyed reconciliation updates retained DOM rows in place, preserving focus when a row remains present. Do not recreate the removed multiline title/metadata component in this extension.

### Thumbnail Preview

The shared module opens a preview on title hover or keyboard focus. Its named thumbnail button supports click, keyboard activation, and touch, exposes `aria-controls` and `aria-expanded`, and can pin or toggle the preview. Moving the pointer from the title into the preview retains it; outside pointer interaction and Escape dismiss it. Only one preview is open per document. The overlay shows loading, public image, missing-thumbnail, and failure text states. The extension supplies metadata through the installed Embed MCP adapter; thumbnails are remote article content, not bundled decorative assets. The shared module remains authoritative for overlay dimensions, placement, pointer delays, and image sizing. Preview width is 560px with a 24px viewport margin on small screens. Images use up to 60vh, capped at 560px, and placement recalculates after loading. Embed reads begin when the target article DOM is ready, without waiting for every image or a fixed delay.

### Status, Empty State, and Failure Notice

Progress remains text in a polite live status region, and the list exposes its busy state. Empty states use a heading and short next action with a top divider. The tinted failure notice identifies failed authors and explicitly identifies retained older results when present. Footer text gives the visible count and last collection time. These states share the list's restrained typography and do not introduce illustration or decorative cards.

## Do's and Don'ts

### Do:

- **Do** preserve system typography, native controls, and the current distinction between feed and settings styling.
- **Do** keep post titles primary and author, channel, and date secondary.
- **Do** preserve visible keyboard focus, one-line title/author rows, thumbnail dismissal, and the implemented system-theme response.
- **Do** express loading, empty results, and author failures with specific text and the current simple containers.

### Don'ts:

- **Don't** apply the feed's pink palette to all settings or treat its mobile breakpoint as a global extension rule.
- **Don't** turn list rows into elevated cards or introduce ornamental imagery, custom fonts, or motion absent from the source.
- **Don't** fork canonical row markup, row typography, or preview behavior into extension-local implementations.
- **Don't** imply that color alone communicates loading, selection, or failure.
