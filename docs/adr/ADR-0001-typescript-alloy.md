# ADR-0001: TypeScript with Alloy/Poco on emery

- Status: Accepted
- Date: 2026-10-25

## Context

The user explicitly requires TypeScript with the Core Devices/RePebble Alloy framework and targets the Pebble Time 2 2026 edition, codename emery. The Core Devices skill says Alloy runs JavaScript through Moddable XS and supports emery and gabbro; the device target here is emery. The approved view needs exact positioning and a compact graphical display.

## Options considered

1. Native C only. It gives strong API coverage and control, but does not meet the user’s TypeScript/Alloy requirement as the main implementation language.
2. Plain Alloy JavaScript. It fits the runtime directly, but gives up compile-time type checking for the configuration, provider snapshot, and eleven-slot model.
3. TypeScript compiled to ESM JavaScript for Alloy, with Poco procedural rendering. This keeps TypeScript as the maintained source and Poco gives exact pixel placement.
4. Piu declarative UI. It can be useful for forms/components, but is less appropriate than Poco for this fixed, high-density watchface layout.

## Decision

Use TypeScript as source under src/ts/watch/, compile with an exact TypeScript version to ES2022 module JavaScript in the generated src/embeddedjs/ directory, and use Alloy with Poco for display rendering. Keep the generated JavaScript out of version control. Target emery only. A minimal C entry file boots the Alloy VM, following the skill template.

A small C FFI helper is separately permitted only where Alloy lacks a needed API (Pebble Health); see ADR-0006. The watchface and its state/rendering logic remain TypeScript.

## Consequences

- Build always runs TypeScript type-checking/transpilation before pebble build.
- Moddable imports and runtime APIs must be represented by narrow ambient declarations; do not pretend arbitrary browser APIs exist on the watch.
- Use official current Alloy documentation when confirming APIs.
- Do not add second-level tick subscriptions; redraw on minute changes or explicit data updates.
- gabbro or legacy Pebble models are not targets for the first version.

## References

- https://developer.repebble.com/guides/alloy/
- https://developer.repebble.com/guides/alloy/getting-started/
- https://github.com/coredevices/pebble-watchface-agent-skill
