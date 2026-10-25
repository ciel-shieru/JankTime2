# JankTime2 native Android companion

This is the phone-side bridge for the JankTime2 emery watchface. It is a standalone Android app because RePebble documents PebbleKit JS and PebbleKit Android as mutually exclusive for a watch project, while JankTime2 needs Android Calendar Provider, phone battery state, secure HTTPS clients, and same-device Wakey-SITizen IPC.

## Security boundary

- PebbleKit Android auto-selection is disabled. A user explicitly selects the installed Pebble mobile app before any JankTime2 payload is sent.
- HA, Prometheus, and Mindwtr credentials are encrypted using an Android Keystore-backed AES-GCM key. Tokens are never written to plain preferences, logs, AppMessage, or screenshots.
- Remote endpoints must use HTTPS with normal platform certificate validation. Redirect following is disabled; request and response sizes/timeouts are bounded.
- Only selected calendar IDs are queried. Calendar titles/descriptions and task titles are not logged.
- The Wakey-SITizen provider is called only after the user explicitly pairs with its opt-in, read-only export.
- The companion sends bounded display values, stale flags, and row text—not full API responses or credentials—to the watch.

## Build

Requires JDK 17 and Android SDK 37.

~~~sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
~~~

Android background execution is best-effort. WorkManager can defer a scheduled refresh for battery, Doze, network, and operating-system policy. The configured 1–60 minute intervals are enforced as minimum request spacing, not guarantees that Android will execute at an exact minute.

## Current phase

This directory is the implementation baseline. The watch renderer, provider clients, phone data pipeline, task/calendar filtering, image downscaling, and sender are deliberately separated. The initial companion PR should keep tests for URL validation, response bounds, secret encryption, task-ledger behavior, formatting, and refresh-interval validation.
