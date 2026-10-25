# ADR-0012: Query Home Assistant directly over HTTPS from the native phone companion

- Status: Accepted
- Date: 2026-10-25

## Context

Home Assistant is the sole weather provider and must also supply selectable sensor and climate entity values. The selected weather entity supplies current-condition icon, feels-like/apparent temperature when available, and rain/precipitation chance when supported by that integration. The companion must refresh every 3 minutes by default (configurable from 1 to 60 minutes) and keep credentials off the watch.

## Options considered

1. Read values from the installed Home Assistant Android app's private state. This would couple JankTime2 to app-internal storage and authentication implementation. Android's app sandbox does not expose that state as a general inter-app API.
2. Use intents or notifications emitted by the Home Assistant Android app. These are not a general, stable API for selecting arbitrary server entities, entity attributes, and weather forecast values.
3. Call the configured Home Assistant server API directly over HTTPS from the native companion. This uses the server's API contract, supports arbitrary user-selected entity IDs and attributes, and keeps authentication material on the phone.
4. Use the Pebble mobile-app weather source or a third-party weather API. This violates the user's source-of-truth requirement and may produce weather different from the user's own Home Assistant integration.

## Decision

Choose option 3. The companion calls the configured Home Assistant API over HTTPS using a user-provided, least-privilege token. The user selects entity IDs for each HA-backed metric and selects the exact state/attribute for a climate value. No token, Authorization header, or raw entity response is sent through AppMessage or logged.

The provider contract must account for integration-specific attributes:
- map known Home Assistant weather condition strings through a fixed local icon table;
- use an apparent/feels-like temperature when the selected entity exposes one;
- use the documented forecast endpoint/action for precipitation probability rather than assuming all weather entities expose a current rain-chance attribute;
- if a requested value is absent, render it as unavailable or use an explicitly labelled fallback; never silently fabricate it;
- do not let provider data select arbitrary icon resources or executable paths.

Refresh defaults to 3 minutes, configurable from 1 to 60 minutes. Cache validated snapshots and preserve the previous value with a stale/red indicator when a request fails, according to ADR-0004.

## Consequences

- Home Assistant access requires a configured server URL and token; the Home Assistant Android app need not expose its own private storage.
- The phone must be able to reach the configured server (LAN, VPN, or the user's supported remote-access path) and validate its TLS certificate normally.
- Entity IDs and climate attributes are user-selected configuration, not hard-coded identifiers.
- No other weather provider is implemented.

## References

- https://www.home-assistant.io/docs/api/rest/
- https://www.home-assistant.io/integrations/weather/
- https://developer.repebble.com/guides/alloy/reference/
