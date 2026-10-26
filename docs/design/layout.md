# Approved layout contract

## Canvas and visual rules

- Device target: Pebble Time 2, platform codename emery, native canvas 200×228.
- The supplied screenshot is the approved reference for hierarchy, grouping, relative placement, whitespace, dividers, icon scale, and typography. The native implementation must be redrawn on the device's 200×228 canvas and verified in the emulator; do not merely shrink the source image as a rendering strategy.
- Standard foreground text and horizontal rules are black. Leave background pixels unpainted so the device's normal e-paper/backlight background tint is preserved. Designated icons keep their semantic accent color, including blue metric icons, yellow phone battery, and blue watch battery.
- The screen is static except for clock ticks and changed data. There are no animations or second ticks.
- Status-bar elements share one vertical center and a right-justified alarm/Bluetooth/battery cluster with consistent small gaps. Metric, status, and heart glyphs use pre-rasterized Material Design Icons masks rather than ad-hoc line art.

## Regions in top-to-bottom order

1. **Status bar** — weekday/date on the left; next alarm or earlier bedtime time; Bluetooth status for the paired phone/watch; yellow phone battery icon with percentage inside; blue watch battery icon with percentage inside. A thin horizontal divider ends this band.
2. **Metric row 1** — five equally spaced metric slots.
3. **Metric row 2** — five visual cells; the middle cell is a framed user image, not a metric. The remaining four cells are metrics.
4. **Clock band** — large HH:mm clock centered horizontally, with one independent metric slot centered to the left and one to the right. No seconds.
5. **Heart-rate band** — heart icon, current BPM, compact graph, and labels for the minimum and maximum of the graph's displayed window.
6. **Task separator** — thin horizontal divider.
7. **Focus items** — two single-line rows.
8. **Calendar separator** — thin horizontal divider.
9. **Calendar events** — two single-line rows.

## Eleven configurable metric slots

| Slot ID | Default intent | Data source | Notes |
|---|---|---|---|
| grid.top.1 | Today's focus remaining / total | Mindwtr | Circle-check icon; total includes completed focus items for today |
| grid.top.2 | Steps | Pebble Health | Count only; no fabricated fallback |
| grid.top.3 | Total sleep hours | Pebble Health | Moon icon |
| grid.top.4 | Restful sleep hours | Pebble Health | Bed icon |
| grid.top.5 | Fan state | Home Assistant sensor | Example sensor; configurable like other metric assignments |
| grid.bottom.1 | CPU usage | Prometheus | Configurable instant query |
| grid.bottom.2 | Memory usage | Prometheus | Configurable instant query |
| grid.bottom.3 | Reserved image | User upload | Not part of the metric-slot count |
| grid.bottom.4 | Current weather condition + feels-like temperature | Home Assistant weather | One combined metric |
| grid.bottom.5 | Firing alert count | Prometheus | Bell icon |
| clock.left | None / future robot metric | None initially | The robot 3/5 metric is explicitly out of scope; slot is still configurable |
| clock.right | Water / hydration percentage | Home Assistant sensor or other supported metric | Configurable; not a hard-coded percentage |

The eleven selectable metric slots are all rows in the table except grid.bottom.3, which is the reserved image cell. A setting must exist for every metric slot. Each setting is independent; changing one slot must not move or reconfigure other slots.

## Text formatting

- Date: abbreviated weekday and month, with day number.
- Every time: local 24-hour HH:mm, always zero-padded.
- Clock: HH:mm only.
- Focus line: start | due | priority marks | title. If both times are missing or 00:00, display start and due dates as DD/MM. If timed start and due values fall on different dates, display both as DD/MM HH:mm; otherwise display HH:mm.
- Calendar line: start time | location (at most 10 characters) | title. The calendar option defaults off and displays the next two events within a one-year look-ahead with DD/MM HH:mm. When “Only show today's next 2 events” is on, only events starting before local midnight are eligible and the date prefix is omitted (HH:mm).
- Priority marks: display exclamation marks based on the chosen Mindwtr priority mapping.
- When text is too long, hard-clip at the available width. Do not append an ellipsis.
- Missing values use a bounded placeholder; stale values keep their last-known text but source icons turn red.

## User-uploaded image

The second-row center image cell is framed and approximately square. The implementation phase must measure its final native bounds from the layout drawing functions, expose those bounds as one constant, downscale and crop the uploaded source on the phone configurator to that exact pixel width/height, and only then transfer the raster to the watch. Use a monochrome/limited-palette format where it improves e-paper readability. Reject oversized input before decoding it and enforce a file size/dimension limit on the phone.

## Heart-rate graph

The graph is for Pebble heart-rate samples, not Prometheus. Current BPM and the minimum/maximum label are derived from the samples represented by the graph. The screenshot's 72 and 54/92 are illustrative values. The graph window and rendering downsampling must be bounded by the watch's memory budget.
