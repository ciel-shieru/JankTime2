# ADR-0010: Use a bounded, versionable AppMessage protocol for the native companion

- Status: Accepted
- Date: 2026-10-25

## Context

The watchface needs data from a separate Android app. The chosen architecture explicitly does not use PebbleKit JS, because official RePebble documentation states that PebbleKit JS and PebbleKit Android are mutually exclusive for a project. The watch therefore needs a small watch-side receiver that works with the native PebbleKit Android 2 companion.

## Options considered

1. Pass the full JSON state or API response through one AppMessage value. This risks exceeding packet constraints and exposes unnecessary fields.
2. Send one native dictionary per entire screen with many bespoke keys. It is possible, but expands the schema and makes independent metric assignments and updates harder to version.
3. Use a fixed five-key message with typed packets for slot updates, metric values/staleness, status, heart history, and individual text rows. This limits the payload while keeping the protocol extensible.

## Decision

Choose option 3. The message keys are TYPE, ID, VALUE, FLAGS, and EXTRA. `package.json` declares them in order; the Alloy SDK assigns their wire IDs from `10000 + index` (`TYPE=10000` through `EXTRA=10004`). The watch receiver uses an explicit key-to-ID map and the Android sender uses those same numeric IDs. Using legacy zero-based IDs causes transport delivery to succeed without invoking the watch's named-key handler. Payload type, identifier, string size, numeric ranges, time format, metric IDs, slot IDs, and graph size are validated on the watch. Stale state travels as a numeric flag. The phone handles provider networking, credentials, caching, Android system APIs, and image preprocessing; the watch receives display-ready fields only.

See docs/integrations/appmessage-protocol.md for packet definitions.

## Consequences

- New packet types require a protocol/ADR update and tests.
- A regression test keeps the package key order, Alloy wire IDs, and Android numeric dictionary keys aligned.
- Invalid messages are ignored without modifying display state.
- The app splits updates into small messages and handles native transport acknowledgement/backpressure. The companion surfaces missing bridge selection and provider refresh failures instead of silently reporting success.
- AppMessage is not used to transport credentials or whole provider responses.
- CI validates bounded message handling and screenshot output, but a physical-watch test is still required to verify the installed mobile-app relay end to end.

## References

- https://developer.repebble.com/guides/communication/
- https://developer.repebble.com/guides/alloy/getting-started/
- https://github.com/pebble-dev/PebbleKitAndroid2
