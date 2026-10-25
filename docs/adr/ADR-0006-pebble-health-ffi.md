# ADR-0006: Use a narrow C FFI helper for Pebble Health metrics

- Status: Accepted
- Date: 2026-10-25

## Context

The requested steps, total sleep, restful sleep, and heart-rate history come from Pebble Health/watch sensors. Alloy is the required implementation framework, but the Core Devices Alloy guide identifies HealthService as a C-only capability.

## Options considered

1. Fabricate values or replace Pebble data with phone-side values. Rejected because it would misrepresent the source and violate the requirement.
2. Use external Prometheus/Home Assistant sensors. These are not Pebble's own health records.
3. Add a small C FFI adapter for the HealthService operations that Alloy does not expose, keeping all display and business logic in TypeScript. This is the smallest compatibility boundary.

## Decision

Choose option 3. During the implementation phase, add a tightly scoped C FFI helper that reads only the required Pebble Health metrics and returns bounded primitive values/samples. The TypeScript watch code owns formatting, graph drawing, time windows, and rendering. Follow the pinned skill's FFI and resource-cleanup guidance and current RePebble API documentation.

## Consequences

- C is limited to the missing platform capability; the project remains TypeScript + Alloy for its primary implementation.
- Tests must cover missing permissions/history, unavailable sensor samples, and daily boundaries.
- The heart-rate graph must use a bounded sample count and calculate min/max from the same samples drawn.
- No continuous second-level redraw is introduced.
