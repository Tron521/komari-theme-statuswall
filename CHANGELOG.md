# Changelog

All notable changes to StatusWall. Versions follow the theme manifest (`theme/komari-theme.json`).

## 2.3.2 — unreleased

Hardening and accessibility pass ahead of the first public release.

### Fixed

- Malformed or numeric `expired_at` values no longer throw `RangeError: Invalid time value` and
  blank the whole wall; date formatting goes through one guarded helper.
- Reopening a card after closing it no longer leaves an empty detail panel.
- The open detail panel is rebuilt when history/live data refreshes, so its numbers no longer go
  stale until the card is re-opened.
- The latency strip still renders when the `load` record RPC fails; ping records alone are enough.
- A failed initial API call can be retried: previously the retry button could be wired after the
  failure had already happened.
- Boot no longer runs twice (which attached duplicate timers and listeners), and the page tears its
  timers down on `pagehide`.
- A closed/reconnecting WebSocket can no longer resurrect itself after the page is hidden.
- UUIDs are escaped in card IDs, `data-` attributes and strip links; the strip lookup no longer
  builds a CSS selector from node data (a quote in a UUID used to throw a `DOMException`).
- Privacy mode now also blanks group, tags and public remark, not just the node name.
- Pins pointing at deleted or hidden nodes are pruned from `localStorage`.
- Refresh button has an accessible name at every width; privacy button uses valid
  `aria-pressed` values; tooltips also show on keyboard focus.
- Error state sets the deck to `ready`, so the header can no longer be invisible while still
  tabbable.
- The pin is visible on hover-less devices; hover lift is limited to devices that actually hover.
- Reduced motion now also disables smooth scrolling (CSS and the arrow-key card navigation).
- Contrast fixes: warning note 2.67:1 → 5.17:1, footer over the colour washes ≥4.7:1, loss pill
  4.2:1 → 5.2:1, dark-scheme upstream pill ≥4.75:1, `--ink-4` raised for small text.
- Progress bars animate again (a later `transition` had dropped `width`).
- Mobile spacing no longer overridden by the short-desktop media query.
- Added print styles and Windows forced-colors support.

### Added

- `在线时长` (uptime) row in the detail panel, so uptime survives zoomed-in layouts.
- Self-contained `@font-face` for the bundled IBM Plex Mono (previously the woff2 files were
  shipped but never registered, so the page fell back to system monospace).
- `OFL.txt` for the bundled fonts; `LICENSE`, `README`, `CHANGELOG`, `THIRD-PARTY`.
- `npm run build` / `npm run package` / `npm run preview` scripts that work without a network or a
  real Komari instance — screenshots are rendered against synthetic fixture data.

## 2.3.1

- Removed the `#abcd` suffix chip that appeared next to duplicated node names; cards now show the
  plain name.
- `hiddenNodes` accepts names containing spaces when they are comma-separated (`my server, node-a`).

## 2.3.0

- New `hiddenNodes` theme setting: hide any node by name or 4-character UUID prefix. Hidden nodes
  are excluded from cards, totals, alerts and the footer; hiding all nodes shows an explanatory
  message instead of a blank page.
- Aligned the pin and chevron controls to the same 30×30 box (previously off by 3 px).
