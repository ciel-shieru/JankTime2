# ADR-0004: Phone-side HTTPS providers, protected credentials, and last-known-good cache

- Status: Accepted
- Date: 2026-10-25

## Context

Home Assistant, Prometheus, Mindwtr, and Wakey-SITizen have independent refresh intervals and different APIs. The watch must remain useful when the phone is offline or an endpoint fails, without exposing credentials or discarding good data.

## Options considered

1. Call remote APIs from watch-side JavaScript. This spreads credential handling to the watch, makes AppMessage/cache behavior harder to constrain, and does not solve Android-native sources.
2. Fetch via PebbleKit JS. This supports HTTP APIs, but conflicts with the native Android companion needed for calendar/battery/Wakey.
3. Fetch from the native Android companion. It can use the platform TLS stack and Keystore-backed storage and combine local Android data with remote API snapshots.

## Decision

Choose option 3. All remote endpoints must use HTTPS with normal certificate validation. Credentials are stored in Android Keystore-backed encrypted storage and are never sent to the watch. Use read-only tokens wherever possible. Reject cross-origin redirects before using credential-bearing results; validate configured origins and bound request duration, response size, and parsed fields. Never install a trust-all TLS handler.

Use separate configurable refresh periods: Home Assistant 3 minutes, Prometheus 5 minutes, Wakey-SITizen 5 minutes, and Mindwtr 5 minutes by default. Each interval must be an integer from 1 to 60 minutes. Refresh jobs must not overlap for the same source.

Persist the last successfully parsed and validated snapshot atomically. On a failed request or invalid response, reuse the last-known-good value, retain its successful-fetch timestamp, and mark that source stale. Turn the icons belonging to stale source data red. A successful validated refresh clears that source's stale state. Do not replace cached data with error pages or partial records.

## Consequences

- No authorization secret is included in AppMessage, watch local storage, debug output, screenshots, test fixtures, or repository files.
- Provider errors cannot overwrite cached-good values.
- Retry policy must use bounded backoff and must not poll faster than configured.
- The icon renderer needs a clear distinction between fresh and stale while preserving the underlying metric value.
