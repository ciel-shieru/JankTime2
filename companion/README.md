# Native Android companion — implementation contract

The native Android companion is the planned phone-side component for JankTime2. It is intentionally specified before application logic is implemented.

## Responsibilities

- Pair with the JankTime2 watchface UUID through PebbleKit Android and exchange bounded AppMessage payloads.
- Own the configuration UI, eleven independent metric-slot selectors, refresh intervals, calendar selection/regex filters, image upload, provider URLs, entity/query selections, and Wakey pairing.
- Make HTTPS requests to Home Assistant, Prometheus, and the self-hosted Mindwtr Cloud API.
- Store credentials in Android Keystore-backed encrypted preferences; never send secrets to the watch.
- Read the selected Android calendars and phone battery state with explicit user permission.
- Pair with Wakey-SITizen's opt-in read-only export ContentProvider.
- Cache validated last-known-good snapshots and include a stale flag/source timestamp in display payloads.
- Resize/crop uploaded images on the phone to the exact measured native image-cell bounds before BLE transfer.

## Important platform constraint

Do not add a PebbleKit JS entrypoint to this watch project. RePebble documents that PebbleKit JS and PebbleKit Android/iOS are mutually exclusive for a project. Because the specification requires Android-only calendar, battery, and Wakey data, the native companion is the selected integration path. The companion needs a separate Android build/test workflow when implementation starts.

## IPC contract

The watch receives display values, selected icon identifiers, timestamps, freshness flags, at most two focus items, at most two calendar events, a bounded heart-rate sample set, and an optional already-downscaled image. It must never receive provider URLs containing credentials, bearer tokens, private certificates, or raw task/calendar records beyond the displayed fields.

All native APIs and inter-app contracts must be checked against current Android and RePebble documentation before implementation. Follow the Wakey export contract in docs/integrations/wakey-sitizen.md. Use the fixed-key AppMessage protocol described in docs/integrations/appmessage-protocol.md; named keys map to numeric PebbleKit Android 2 dictionary IDs in package.json array order.
