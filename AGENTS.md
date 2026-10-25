# JankTime2 — Agent Instructions

## Project purpose

JankTime2 is a TypeScript + Core Devices/RePebble Alloy watchface for the Pebble Time 2 (platform codename **emery**, 200×228 pixels). The approved screenshot and the requirements recorded in README.md and docs/ are the product contract. Do not redesign the layout.

## Required reading before any watchface implementation

1. Read .agents/skills/pebble-watchface/SKILL.md completely.
2. Read .agents/skills/pebble-watchface/references/alloy-guide.md and references/live-docs.md completely.
3. Read references/drawing-guide.md before changing layout or drawing code.
4. Consult the live RePebble documentation for APIs and platform behavior; do not infer API signatures from memory.
5. Read README.md, docs/design/layout.md, docs/design/providers.md, and all accepted ADRs in docs/adr/.

## Project boundaries

- Target emery only. Alloy does not target older Pebble platforms.
- Watch-side source of truth is TypeScript in src/ts/watch/; compiled JavaScript in src/embeddedjs/ is generated and must not be committed.
- The rendering approach is Alloy/Poco for pixel-level layout. Keep drawing on minute changes or explicit data updates; do not poll/redraw every second.
- A native Android companion is the planned phone-side bridge. Do not add src/pkjs/index.js: PebbleKit JS and PebbleKit Android are mutually exclusive for a watch project. All provider traffic, Android Calendar Provider access, phone battery readings, and Wakey integration must go through the native companion boundary documented in ADR-0003.
- The app sends only display-ready, bounded data to the watch. Never send endpoint credentials, bearer tokens, certificates, or full unfiltered provider responses over AppMessage.
- The watchface must remain useful offline. Keep the last successful snapshot, show stale data when refresh fails, and turn affected metric icons red while stale.

## Visual invariants

- Keep the composition in docs/design/layout.md: top status bar; two five-column metric rows with the center cell of the second row reserved for the image; large centered 24-hour HH:mm clock; one metric on either side of the clock; heart-rate graph; two focus rows; two calendar rows.
- There are eleven configurable metric slots. The image cell is not a metric slot. Keep each slot individually configurable.
- Time always uses 24-hour HH:mm with a leading zero. No seconds.
- Phone battery is the yellow battery and watch battery is blue; place each percentage inside its horizontal battery outline.
- Preserve the provided icon semantics and accent colors. Standard foreground text and dividers are black; unpainted background uses the device/system-default e-paper and backlight tint rather than filling the entire screen with a hard-coded color.
- Text overflow in focus and calendar rows is abrupt clipping/truncation. Do not append ellipses.
- The clock's left-side robot 3/5 metric is intentionally out of scope for the first implementation. Keep the slot configurable and permit none.

## Security and reliability requirements

- HTTPS only for remote endpoints. Never disable certificate validation or use trust-all TLS managers.
- Keep Home Assistant, Prometheus, and Mindwtr credentials in Android Keystore-backed companion storage. Redact credentials, authorization headers, private entity state, and task titles from logs.
- Do not put secrets in source, test fixtures, app messages, screenshot artifacts, build output, or GitHub Actions logs.
- Validate user-supplied URLs, entity IDs, PromQL, timeouts, response size, field types, calendar regex length, and all refresh intervals (1–60 minutes). Reject malformed input closed.
- Do not follow cross-origin redirects with credentials. A provider response from an unexpected origin is an error.
- Use least-privilege/read-only provider credentials wherever available. Make user-visible permission and data-source choices explicit.
- Cache only the required display snapshot, timestamp successful refreshes, retain last-known-good values on errors, and mark the affected source stale/red.
- Do not fetch faster than the configured interval; default intervals are specified in the ADRs.
- Use bounded payloads and defensive JSON parsing. Never evaluate provider data as code.

## Workflow and commits

- Follow Conventional Commits for all Git commits.
- Update an ADR when a material architecture decision changes.
- Run TypeScript type-check, lint, unit tests, pebble build, and the emery emulator screenshot check before considering watchface code complete.
- CI screenshot artifacts are build evidence. Inspect them for clipping, overlap, missing resources, incorrect fonts, and layout drift.
- The current renderer is a preview of the approved layout and uses fixture values until the providers/companion are implemented. Do not treat fixture data as live data or treat one passing screenshot smoke check as final visual acceptance.
- The normal Alloy mdbl.c template may be changed only for documented runtime heap requirements; record heap sizing in an ADR and keep the total allocation within the emery app-RAM budget.
