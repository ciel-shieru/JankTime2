# ADR-0003: Use a native Android companion as the phone-side bridge

- Status: Accepted
- Date: 2026-10-25

## Context

The watchface must read synced Android calendars, phone battery state, and data that lives in Wakey-SITizen's private Android storage. It must also perform authenticated HTTPS requests to Home Assistant, Prometheus, and the user's self-hosted Mindwtr service. PebbleKit JS is a sandbox with Internet access, localStorage, geolocation, and configuration hooks, but it is not a general Android API surface. Official RePebble documentation states that PebbleKit JS cannot be combined with PebbleKit Android/iOS for the same watch project.

## Options considered

1. PebbleKit JS only. It gives a simple web configurator and HTTP requests, but cannot directly read Android Calendar Provider, phone battery, or another app's private DataStore.
2. Watch-side Alloy fetch through pebbleproxy. It is suitable for web APIs, but still lacks access to Android-only sources and would put request credentials into watch-side logic or messages.
3. Native Android companion using PebbleKit Android and AppMessage. It can read Android APIs, securely store tokens, call HTTPS endpoints, query the Wakey export contract, and send display data to the watch. It cannot use PebbleKit JS simultaneously, so settings must be native Android UI rather than a Clay/PKJS page.

## Decision

Choose option 3. The native companion is the single phone-side data bridge and configurator. It owns network access, credential storage, calendar permissions, phone battery data, provider refresh jobs, source cache, image downscaling, and Wakey pairing. The watch-side Alloy app receives only bounded display-ready data through AppMessage. The companion registers against the watchface's UUID.

Do not add src/pkjs/index.js; doing so would select the mutually exclusive PebbleKit JS path. Before a production implementation, verify the selected PebbleKit Android 2 API and current RePebble companion-app compatibility against live documentation. The companion is Android-first because the required Wakey-SITizen integration and Mindwtr app context are Android.

## Consequences

- Configuration UX lives in the Android companion, not Clay.
- The companion's settings and secrets stay on the phone.
- CI runs Android unit tests, lint, debug APK assembly, Gradle artifact verification, and dependency-lock digest checks for the native companion.
- The repository's initial CI validates the watchface toolchain only.
- Users must install the companion for calendar, phone battery, remote providers, and Wakey integration. Missing companion data must be clearly marked stale/unavailable, not fabricated.

## References

- https://developer.repebble.com/guides/communication/using-pebblekit-js/
- https://developer.repebble.com/guides/communication/
- https://developer.repebble.com/guides/communication/using-pebblekit-android/
