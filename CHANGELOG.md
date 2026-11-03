# Changelog

All notable changes to StatusWall. Versions follow the theme manifest (`theme/komari-theme.json`).

## 2.4.0 — 2026-11-03

First public release. Rolls up the 2.3.2 hardening pass below, plus the visual work from a study of
the seven most-starred Komari themes (`reference/`; the comparison is written up in `DESIGN.md`).
Nothing from those themes was copied: only the ideas that survived a side-by-side check were kept.

### Added

- A status chip next to each node name — `在线` / `告警` / `离线` — so an unhealthy card is readable
  before you parse its numbers, and a warning card no longer looks identical to a healthy one.
- The header's `N 台需关注` is now a button: it scrolls to the first node that needs attention and
  outlines that card for 1.6 s.
- `offlineLast` setting: keep offline nodes at the end of the wall (pinned nodes still come first).
  Cards reorder smoothly when a node goes offline or comes back.
- `icpText` / `icpUrl` settings for a footer filing number (plain text, or an http(s) link that opens
  in a new tab).
- A one-line machine overview under the totals on phones, with tap-to-jump links to each card.

### Changed

- Offline cards drop the diagonal hatch and keep only a dimmed surface and the red top rule; the
  texture made the numbers look dirty and fought the signal bars.
- The header's online dot now only says whether everyone is online (amber when a node is down).
  Severity is left to the `N 台需关注` button instead of colouring the same fact twice.
- Phones keep `负载` and `在线时长` on every card and hide only the OS name and core count (both stay
  in the detail panel), instead of hiding the whole line.
- The machine overview strip scrolls horizontally on phones with a fade at both ends, instead of
  wrapping to a second row above the cards.
- Detail trend charts go full width on phones, so `现 / 峰` no longer wraps mid-label.
- The 1920×1080 layout is tightened to fit without a scrollbar: cards, the wall and the footer add
  up to exactly 1080 px.

### Fixed

- Empty latency buckets no longer paint a 1.5 px stub at the bottom of each row (they are 0-high now).
- Removed the `now` tick that crossed the right edge of the signal bars on narrow cards.
- On phones the traffic sub-line is shortened to `配额 X` under 480 px, so it stops truncating.
- Fixed the mobile detail panel still laying the trend charts out in two columns (a more specific
  desktop rule won over the phone one), which squeezed the labels into wrapped text.
- At 1280–1339 px — four columns at their tightest — the `used / total` line under each gauge lost
  its unit to an ellipsis (`4.2 / 8.0…`); that line drops 1 px in this band so it fits.

## 2.3.2 — rolled into 2.4.0

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
