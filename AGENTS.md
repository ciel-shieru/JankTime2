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
- The native companion uses PebbleKit Android 2 bound-service transport. Gravel may be selected only when the installed version is returned by the PebbleKit eligible-app picker; never bypass explicit user selection. Gadgetbridge is not currently a compatible arbitrary-AppMessage transport; do not claim support until a reviewed Gadgetbridge-side bridge exists.
- A native Android companion is required for Android-only data that PebbleKit JS cannot obtain: selected Android Calendar Provider events, phone battery readings, and the explicit Wakey-SITizen export. Do not add src/pkjs/index.js: PebbleKit JS and PebbleKit Android are mutually exclusive phone-side bridges for one watch project. All provider traffic and Android-only integration must go through the native companion boundary documented by the ADRs.
- The Pebble mobile app's calendar-to-Timeline sync is not a replacement for Calendar Provider access: the documented Timeline APIs do not expose a query API for reading the app's already-synced calendar pins into the running watchface.
- The app sends only display-ready, bounded data to the watch. Never send endpoint credentials, bearer tokens, certificates, or full unfiltered provider responses over AppMessage.
- Refresh status must be visible in the companion UI. Do not silently discard all provider failures or report refresh success before a watch-send acknowledgement is received. Saving configuration must trigger a refresh, not only schedule later work.
- PebbleKit Android 2 has an unbind-on-close edge case when no binding was established; keep the sender lazy and suppress only the exact `Service not registered` `IllegalArgumentException` during cleanup. Do not suppress transmission errors.
- The watchface must remain useful offline. Keep the last successful snapshot, show stale data when refresh fails, and turn affected metric icons red while stale.

## Android companion implementation rules

- Android application source code must be written in **Kotlin only**.
- All application UI must use **Jetpack Compose with Material 3 only**. Do not introduce Java application code, XML layout UIs, Android View-based screens, Flutter, React Native, or any other language/UI framework. AndroidManifest.xml, Gradle configuration, and platform metadata/resources required by Android tooling are allowed; they must not be used to implement a second UI framework.
- Prefer Android platform APIs and AndroidX/Jetpack libraries. Minimize external dependencies. Before adding any non-AndroidX third-party library, document its purpose in companion/README.md and explain why an equivalent handwritten implementation would be complex, security-sensitive, or materially harder to maintain. A direct dependency is not justified merely by convenience.
- Existing libraries require explicit justification and must be periodically reassessed: PebbleKit Android 2 is the supported bridge to Pebble; OkHttp is retained only for security-sensitive HTTPS handling (timeouts, bounded responses, TLS, and redirect control); WorkManager supports reliable constrained periodic work; Kotlin coroutines support structured cancellation; JUnit is test-only. Keep UI dependencies on official AndroidX Compose and Material 3 libraries.
- Do not introduce generated Kotlin or UI source that is checked in unless it is a deliberate, reviewed source artifact. Keep screens in Compose and use Material 3 components/tokens consistently.

## Visual invariants

- Keep the composition in docs/design/layout.md: top status bar; two five-column metric rows with the center cell of the second row reserved for the image; large centered 24-hour HH:mm clock; one metric on either side of the clock; heart-rate graph; two focus rows; two calendar rows.
- There are eleven configurable metric slots. The image cell is not a metric slot. Keep each slot individually configurable.
- Time always uses 24-hour HH:mm with a leading zero. No seconds.
- Phone battery is yellow and watch battery is blue; place each numeric level centered inside its narrow horizontal MDI battery outline without a percent sign.
- Use Material Design Icons (MDI) consistently for all status, metric, weather, and heart glyphs. Preserve icon semantics and accent colors. Standard foreground text and dividers are black; unpainted background uses the device/system-default e-paper and backlight tint rather than filling the entire screen with a hard-coded color.
- Text overflow in focus and calendar rows is abrupt clipping/truncation. Do not append ellipses.
- The clock's left-side robot 3/5 metric is intentionally out of scope for the first implementation. Keep the slot configurable and permit none.

## Sleep-triggered low-power mode

- Use only Pebble Health's watch-local current activity mask to detect sleep; include sleep/restful-sleep activity bits and fail open if activity state is unavailable. Do not add wrist detection or phone-side sleep flags.
- In sleep mode render only date/time, watch battery, heart rate/graph, total sleep, and restful sleep. Keep clock/date/watch-battery/heart-rate geometry unchanged; place total sleep immediately left and restful sleep immediately right of the clock. Hide all phone-derived/remote metrics, phone status, image, focus, and calendar rows.
- Keep the existing minute event as the detection cadence; do not add a higher-frequency timer or allocate a HealthService event subscription solely for sleep detection.
- Skip unnecessary step-count queries, phone AppMessage processing, display-cache writes, and redundant redraws while asleep. On waking, flush pending display state and restore the approved normal layout. No phone data is required to render low-power mode.

## Security and reliability requirements

- HTTPS only for remote endpoints. Never disable certificate validation or use trust-all TLS managers.
- Keep Home Assistant, Prometheus, and Mindwtr credentials in Android Keystore-backed companion storage. Redact credentials, authorization headers, private entity state, and task titles from logs.
- Do not put secrets in source, test fixtures, app messages, screenshot artifacts, build output, or GitHub Actions logs.
- CI must inject the debug signing keystore via secret-backed environment variables, decode it to `~/.android/debug.keystore`, use it only for the debug build, and never print key material or passwords.
- Configuration backups must exclude secrets by default. Before exporting credentials, show a plaintext-secret warning and require explicit confirmation; imports containing secrets also require an explicit choice. Restore imported secrets into Android Keystore-backed encrypted storage, bound JSON/image input sizes, and never log backup content.
- Validate user-supplied URLs, entity IDs, PromQL, timeouts, response size, field types, calendar regex length, and all refresh intervals (1–60 minutes). Reject malformed input closed.
- Do not follow cross-origin redirects with credentials. A provider response from an unexpected origin is an error.
- Use least-privilege/read-only provider credentials wherever available. Make user-visible permission and data-source choices explicit.
- Cache only the required display snapshot, timestamp successful refreshes, retain last-known-good values on errors, and mark the affected source stale/red.
- Do not fetch faster than the configured interval; default intervals are specified in the ADRs.
- Use bounded payloads and defensive JSON parsing. Never evaluate provider data as code.

## Dependency integrity

- Every direct and transitive code/build dependency must be pinned to an exact version and an integrity digest wherever its package ecosystem supports it. No version ranges, floating tags, latest labels, unpinned Git refs, or unlocked transitive resolution.
- Keep npm dependencies in package-lock.json with registry integrity fields and use npm ci.
- Keep Python tooling in a requirements lock with exact versions and SHA-256 hashes for every resolved package. SHA-256-pin the complete installed Pebble SDK and Android SDK package trees through reviewed compact manifests in tooling/.
- Enable Gradle dependency locking. The exact full-file SHA-256 pins for the generated app gradle.lockfile and Gradle verification-metadata.xml are source-controlled in tooling/gradle-dependency-pins.sha256; CI regenerates candidates, rejects any byte-level drift against those reviewed pins, then runs a second build with Gradle's strict artifact and metadata verification enabled. Never update the digests automatically in normal CI.
- Pin the Gradle distribution by exact version and distributionSha256Sum; verify the checked-in Gradle wrapper JAR when it changes.
- Pin Pebble tool and SDK versions; verify installed SDK inputs against the reviewed SHA-256 manifest in tooling/.
- Pin GitHub Actions by full commit SHA. Use exact patch/build versions for Node.js, Python, and the JDK. Where official installers provide and verify archive checksums, retain that verification; do not replace it with a mutable download URL alone.
- Pin Linux emulator runtime dependencies to a fixed Ubuntu snapshot and exact package versions; rely on APT's integrity verification against authenticated package metadata. Document the remaining provider-managed hosted-runner VM boundary in docs/security/dependency-pinning.md. Do not describe the runner VM itself as pinned.
- Dependency version or digest changes must be reviewed together. Never regenerate integrity metadata automatically during normal CI; use a deliberate maintenance process and review generated changes before committing them.

## Automated policy enforcement

- `scripts/check-repo-policy.mjs` is a required CI gate before watchface or Android builds. It checks immutable GitHub Action refs, exact declared tool/dependency versions, npm/Python package integrity, fixed Ubuntu snapshot and exact emulator package versions, SDK/Gradle digest manifests, Android Kotlin-only source, Compose + Material 3-only UI, and the external-library justification register.
- Update the checker when adding a supported dependency ecosystem, toolchain, SDK package, or required Android capability. A passing build is not permission to bypass a policy failure; pin changes and policy exceptions require a reviewed source change.

## Workflow and commits

- Follow Conventional Commits for all Git commits.
- Update an ADR when a material architecture decision changes.
- Run TypeScript type-check, lint, unit tests, pebble build, and the emery emulator screenshot check before considering watchface code complete.
- Run Android unit tests, lint, and assembleDebug for companion changes.
- CI must upload a **production-mode** .pbw artifact built before enabling preview fixtures. Do not distribute the fixture-enabled screenshot build. Keep the .pbw separate from screenshot/log artifacts.
- CI screenshot artifacts are build evidence. Inspect them for clipping, overlap, missing resources, incorrect fonts, and layout drift.
- Upload CI outputs one file per artifact, naming each artifact after the actual output filename; do not manually ZIP screenshot, log, APK, PBW, or checksum files. GitHub’s artifact service may still package downloads in its own wrapper archive.
- The current renderer is a preview of the approved layout and uses fixture values until the providers/companion are implemented. Do not treat fixture data as live data or treat one passing screenshot smoke check as final visual acceptance.
- The normal Alloy mdbl.c template may be changed only for documented runtime heap requirements; record heap sizing in an ADR and keep the total allocation within the emery app-RAM budget.
