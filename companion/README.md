# Native Android companion — implementation contract

The native Android companion is required for the phone-side capabilities that the Pebble app's PebbleKit JS sandbox does not expose to watchface projects: Android Calendar Provider access for user-selected calendars, phone battery readings, and the opt-in Wakey-SITizen read-only export. Ordinary settings forms, persistent configuration, HTTPS requests, and watch messaging could be implemented with PebbleKit JS, but that route cannot satisfy those Android-only requirements. PebbleKit JS and PebbleKit Android/iOS cannot be used together in one Pebble project, so JankTime2 deliberately chooses the native Android bridge.

The Pebble mobile app's calendar-to-Timeline feature is still useful to the user, but those synced Timeline pins are not exposed through a documented API that the running watchface can query to populate its own two calendar lines. The dedicated bridge is not a second watch manager; it is the watchface's least-privilege adapter to required Android APIs and remote providers.

## Responsibilities

- Pair with the JankTime2 watchface UUID through PebbleKit Android 2 and exchange bounded AppMessage payloads.
- Own the configuration UI, eleven independent metric-slot selectors, refresh intervals, calendar selection/regex filters, image upload, provider URLs, entity/query selections, and Wakey pairing.
- Make HTTPS requests to Home Assistant, Prometheus, and the self-hosted Mindwtr Cloud API.
- Store credentials in Android Keystore-backed encrypted preferences; never send secrets to the watch.
- Read the selected Android calendars and phone battery state with explicit user permission.
- Pair with Wakey-SITizen's opt-in read-only export ContentProvider.
- Cache validated last-known-good snapshots and include a stale flag/source timestamp in display payloads.
- Resize/crop uploaded images on the phone to the exact measured native image-cell bounds before BLE transfer.

## Required implementation stack

- Application source is Kotlin only.
- UI is Jetpack Compose using Material 3 only. No Java app source, XML layout UI, Android Views-based UI, Flutter, React Native, or other application/UI framework.
- Android manifests, Gradle configuration, SDK metadata, and non-UI resources required by the platform are permitted.
- Prefer Android platform APIs and AndroidX/Jetpack libraries. Keep third-party dependencies to the minimum necessary.

## Dependency justification register

| Dependency | Status | Justification |
|---|---|---|
| PebbleKit Android 2 (io.rebble.pebblekit2:client) | Required | Implements the documented Pebble-to-phone bridge and AppMessage transport; replacing this means reimplementing pairing/transport against the Pebble app protocol. |
| OkHttp | Required unless a reviewed alternative is materially safer | Provides mature HTTPS, TLS behavior, timeouts, request cancellation, bounded response handling, and redirect control. A handwritten HTTP stack would increase security and maintenance risk. |
| AndroidX WorkManager | Required if periodic refresh must survive normal process/lifecycle interruptions | First-party Jetpack scheduling with OS-aware constraints and cancellation. |
| Kotlin coroutines | Keep only for structured cancellation and asynchronous orchestration | Avoids hand-rolled callback/thread lifecycle management for network and provider work. |
| AndroidX Compose, Activity Compose, Core KTX, Material 3 | Approved | Official AndroidX components for the mandated Kotlin/Compose/Material 3 stack. |
| JUnit | Test-only | Unit test runner/assertions; never included as a runtime dependency. |

Any new library requires a row here before it is introduced, including the precise problem it solves and why a small implementation using platform/AndroidX APIs would be complex or harder to maintain. Revisit this register during dependency upgrades and remove unused dependencies.

## IPC contract

The watch receives display values, selected icon identifiers, timestamps, freshness flags, at most two focus items, at most two calendar events, a bounded heart-rate sample set, and an optional already-downscaled image. It must never receive provider URLs containing credentials, bearer tokens, private certificates, or raw task/calendar records beyond the displayed fields.

All native APIs and inter-app contracts must be checked against current Android and RePebble documentation before implementation. Follow the Wakey export contract in docs/integrations/wakey-sitizen.md. Use the fixed-key AppMessage protocol described in docs/integrations/appmessage-protocol.md; named keys map to numeric PebbleKit Android 2 dictionary IDs in package.json array order.
