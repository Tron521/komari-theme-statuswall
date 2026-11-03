# Changelog

All notable changes to StatusWall. Versions follow the theme manifest (`theme/komari-theme.json`).

## 2.6.5 — 2026-11-03

### Changed

- Only the arrow at the top right of a card opens or closes its details. Clicking anywhere on the card
  used to toggle it too, which collided with dragging the ping strip, selecting text and scrolling.
  Cards lose the pointer cursor and the hover lift / press dip that suggested the whole card was a button.
- On touch screens the arrow is a visible 36 px button, and the expanded details end with a full-width
  `收起明细` button that closes them and brings the card's top back into view.

### Fixed

- Expanding a card taller than the screen (common on phones) no longer scrolls to its bottom and pushes
  the arrow off-screen; the top of the card stays in view.

## 2.6.4 — 2026-11-03

### Fixed

- Phones: pressing and dragging along the three-network strip now shows that moment's latency and loss
  for all three lines. Before, the global "hide tooltip on press" handler closed it first and the drag
  only updated a tooltip that was already open, so nothing appeared. On touch the tooltip sits above the
  strip, out from under the finger, and stays 2.5 s after lifting so a single tap is readable.
- Horizontal drags on the strip no longer turn into page gestures (`touch-action: pan-y`); vertical
  swipes still scroll the page.
- Tapping or clicking the strip no longer expands the card; tap anywhere else on the card to expand.

## 2.6.3 — 2026-11-03

### Changed

- `name` and `description` in `komari-theme.json` are plain strings (Chinese and English together)
  instead of i18n objects, so the Komari theme market's automatic submission check accepts the package.

## 2.6.2 — 2026-11-03

### Fixed

- Phone overview chips: the status dot inherited the card header's 6 px top margin and sat half a line
  below the name; name and CPU figure now share one line height, so dot, name and number are centred.

## 2.6.1 — 2026-11-03

### Fixed (phones)

- CPU / memory / disk labels sit above their numbers, so a value no longer runs into the next column's
  label (`34.3% 内存`).
- Uptime follows the load on the sub line instead of floating to the middle of the card.
- The site name shows next to the sun mark, so the header is no longer half empty; it gives way when the
  `N 台需关注` button needs the room.
- Below 360 px, `used/total` drops the spaces around the slash so it is not cut off.

### Changed

- Packet loss next to each line is plain coloured text everywhere (red when heavy), instead of a red
  outlined badge for some lines and plain text for others.

## 2.6.0 — 2026-11-03

### Changed

- The three-network strip is now a row of 24 equal-height rounded segments, the uptime-bar style used
  by the most popular Komari themes, instead of bars whose height was stretched to each line's own
  min–max (which made quiet lines look jumpy). Colour answers one question per segment: green normal,
  yellow slow or one probe lost, orange very slow or two lost, red three or more lost or all timed out.
  Thresholds count lost probes per five-minute segment, so routes with chronic light loss stay mostly
  green and a real outage shows as a red run. The strip is shorter, so cards are shorter too.
- Cards take their natural height (rows stay equal) instead of stretching to fill the screen, so a
  wall with few nodes no longer opens large gaps inside each card.
- The ping window ends at the newest probe record instead of "now", so the last segment is no longer
  empty while the current minutes are still being written.
- Calmer segment greens in the dark scheme.

### Fixed

- The strip picked up the loss badge as its first segment, shifting every segment one slot to the left:
  the last segment was always grey and hover times were off by one segment.

## 2.5.2 — 2026-11-03

### Fixed

- On phones and tablets the admin button keeps its `登录` / `后台` label; a lone lock icon next to the
  refresh button was easy to miss. Below 430 px the clipped `KOMARI` wordmark gives way (the sun mark
  stays), and below 360 px the header spacing tightens so the button stays inside the bar at 320 px.

## 2.5.1 — 2026-11-03

### Fixed

- The column count now depends only on the window width. Before, hiding nodes could drop a wide screen
  to three columns (five nodes became 3 + 2) or stretch two nodes across the whole row. Five nodes are
  now 4 + 1 and every card keeps the same size.

## 2.5.0 — 2026-11-03

### Added

- A `登录` / `后台` button in the header that opens `/admin`. It reads `/api/me`, so a signed-in admin
  sees `后台`. The new `showAdmin` setting (default on) hides it; `/admin` itself keeps working.
- `npm run demo` serves the theme with synthetic nodes (no Komari needed); its `/admin` explains that
  the demo has no admin panel.

### Changed

- Four cards per row from 1024 px wide up (was 1280 px; 1024–1279 showed three oversized cards).
  A compact tier for 1024–1599 px and for wide-but-short windows (≥1600 px wide, ≤1060 px tall) makes
  the ping strip shorter and trims padding, so eight cards fit on one screen at 1440×900 and 1920×950.
- In the narrowest four-column band (1024–1279 px) the vital labels sit above the numbers, `used/total`
  drops the spaces around the slash, and the uptime follows the load on the same line.
- The totals bar stays one row of six tiles down to 1024 px (it used to fold into two rows below 1100 px).

## 2.4.1 — 2026-11-03

### Fixed

- Turning off `showFinance` now really hides every amount: the 月成本 and 剩余价值 tiles become process
  and connection counts, and the detail panel drops its money rows. Before, both tiles kept showing yuan.
- A price of `0` means the price was never filled in, so the card says `未填价格` instead of `免费`;
  only `-1` (Komari's convention) reads as `免费`. Cards without a price no longer show `月 ¥0.0`.
- One-time (`-1`) or blank billing cycles no longer count the full price as a monthly cost.
- Privacy mode now hides tags on the card face too, not only in the detail panel.
- Coming back to the page through the browser's back/forward cache reloads it, instead of leaving it
  frozen on stale numbers with the realtime connection closed.
- README: the manual install path is `data/theme/StatusWall/`, and the `historyHours` / `showTrace`
  descriptions match what the settings do. The `showTrace` setting is renamed to match too.

## 2.4.0 — 2026-11-03

First public release. Rolls up the 2.3.2 hardening pass below, plus the visual work from a study of
the seven most-starred Komari themes.
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
