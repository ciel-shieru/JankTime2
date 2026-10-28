# ADR-0019: Use watch-local sleep activity to enter low-power display mode

- Status: Accepted
- Date: 2026-10-29

## Context

JankTime2's default display includes data that depends on the Android companion, remote providers, and phone-side state. While the wearer is asleep, that display is unnecessary and phone-dependent updates and repeated cache writes should be avoided. The watchface must instead show only information available locally on the watch: date/time, watch battery, current heart rate and graph, total sleep, and restful sleep.

Alloy does not directly expose HealthService's current activity APIs. The project already uses a narrow C FFI for HealthService metrics.

## Decision

Use the existing `health_refresh` / `health_metric` FFI surface, adding metric ID 4 as a tri-state local sleep flag without adding AppMessage keys or another FFI function. The C adapter checks that the sleep activity data is accessible with `health_service_any_activity_accessible`, then calls `health_service_peek_current_activities`. Either `HealthActivitySleep` or `HealthActivityRestfulSleep` activates low-power mode. Return unavailable (-1) if HealthService reports no accessible activity data; TypeScript fails open to normal mode instead of guessing.

Poll only with the existing minute-driven watchface refresh. Do not add second-level timers or subscribe to HealthService events solely for sleep status: event subscriptions can allocate additional heap and are unnecessary for a minute-updated display. Skip the steps metric query when sleep is active.

Sleep mode uses the normal clock, date, watch-battery, and heart-rate graph coordinates. The total-sleep metric is drawn in the clock-left position; restful sleep is drawn in the clock-right position. Hide the phone battery, Bluetooth/connection and alarm/bedtime status, all configurable or remote metric slots, image, focus lines, and calendar lines. The mode uses only watch-local HealthService values, the local clock, and the watch battery sensor. It does not implement or depend on wrist detection.

While asleep, ignore incoming phone AppMessages, avoid display-state storage writes, and skip phone/resize-driven redraws. Health and display state remain in bounded in-memory snapshots; write display state again when the watch wakes. The regular minute event still updates the time, heart rate/graph, sleep totals, and sleep classification. Health-state unavailability always exits low-power mode.

## Consequences

- Normal display rendering and metric assignments remain unchanged when awake.
- Sleep detection follows Pebble Health's activity classification and can lag actual sleep onset; it is not an instantaneous wrist-presence signal.
- No phone data is needed to render sleep mode, and no remote data is shown there.
- Some health values can still be unavailable if Pebble Health is disabled, inaccessible, or has not synchronized records; the UI shows bounded placeholders/stale icons rather than invented values.
- Physical-device testing is still needed to confirm sleep classification and power impact on emery hardware.

## References

- https://developer.repebble.com/docs/c/Foundation/Event_Service/HealthService/
- https://developer.repebble.com/guides/events-and-services/health/
- https://developer.repebble.com/guides/alloy/ffi/
