# ADR-0006: Use a narrow C FFI helper for Pebble Health metrics

- Status: Accepted
- Date: 2026-10-25

## Context

Steps, total sleep, restful sleep, and heart-rate history must come from Pebble Health. Alloy is the required implementation framework, but the Core Devices Alloy guide identifies HealthService as a C-only capability.

## Options considered

1. Fabricate values or replace Pebble data with phone-side values. Rejected because it would misrepresent the source.
2. Use Home Assistant/Prometheus values. Those are not Pebble's own health records.
3. Use a narrow C FFI adapter for HealthService while keeping formatting, display logic, and drawing in TypeScript. Chosen as the smallest compatibility boundary.

## Decision

The watch uses src/c/health_ffi.c through the documented Alloy FFI mechanism. The native C functions expose only four bounded primitives: refresh the cached snapshot, read one of four values, read the number of heart samples, and read one sample. mdbl.c sets fxBuildFFI, and manifest.json declares the exact signatures.

## Data semantics

- Steps use health_service_sum_today(HealthMetricStepCount) after checking accessibility for today.
- Total and restful sleep use their HealthService metrics over a rolling 24-hour window so sessions crossing midnight remain represented.
- Heart-rate history uses valid minute-level records from the last two hours, down-sampled to at most 16 points. Current BPM uses the newest valid record, falling back to a current reading if minute history is empty.
- Missing permission/history produces unavailable values and red metric icons; no health values are fabricated.
- The FFI adapter uses a fixed-size static history buffer and does not dynamically allocate or log measurements.

## Consequences

- The package declares the health capability. Pebble Health must be enabled in the Pebble mobile app for readings to be available.
- TypeScript refreshes HealthService at most once per display minute and persists a small, schema-checked last-known-good snapshot in Alloy localStorage. If a reading disappears temporarily, the cached value remains visible with a red/stale icon; the step cache resets when the local date changes. Message-driven redraws reuse the same minute snapshot.
- CI validates FFI registration and compilation. Actual HealthService data must still be checked on an emery device with Pebble Health enabled.

## References

- https://developer.repebble.com/guides/events-and-services/health/
- https://developer.repebble.com/guides/alloy/ffi/
- https://github.com/coredevices/pebble-watchface-agent-skill
