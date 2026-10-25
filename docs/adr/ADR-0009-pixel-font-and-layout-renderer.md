# ADR-0009: Use a licensed pixel font and Poco for the fixed screen composition

- Status: Accepted
- Date: 2026-10-25

## Context

The approved emery reference uses condensed, bitmap-like lettering that must fit dense rows and a large central clock. The Pebble system-font set has limited sizes and wider glyphs than the target text rows. The Alloy skill recommends using a custom TrueType resource, generated bitmap-font resources, and Poco for exact pixel placement.

## Options considered

1. Use Pebble system fonts only. This is simpler and has no extra font payload, but the fixed rows are likely to overflow or require breaking the approved font proportions.
2. Bundle a custom font and load the generated font and alpha bitmap using the documented Moddable parseBMF / parseRLE path. This adds a small licensed asset but allows explicit font sizes and predictable line fitting.
3. Render the entire face from a precomputed bitmap. This produces a fixed appearance but makes current time, stale indicators, live metric swaps, and dynamic graph values difficult or impossible to render.

## Decision

Use the SIL Open Font License 1.1 Jersey 10 font from the Core Devices Alloy watchface tutorial as a bundled asset, with its license included in fonts/. Declare only the required sizes and character ranges in src/embeddedjs/manifest.json, and load the generated resources with parseBMF and parseRLE. Use Poco for all drawing and calculate text clipping by measured width, truncating at the final visible character without an ellipsis.

The preview layout uses the provided example content only to exercise alignment. Live integrations must replace fixture values with validated source snapshots; a static preview value must never be treated as genuine provider data.

## Consequences

- The font is included with its OFL notice and is not modified.
- New glyphs require adding the appropriate Unicode block to the manifest.
- Font-size changes require screenshot review because text widths affect both rows and status-bar fit.
- The clock, status bar, metrics, graph, focus lines, and calendar lines remain dynamic drawing primitives rather than a flattened image.

## References

- https://github.com/coredevices/alloy-watchface-tutorial
- https://github.com/google/fonts/tree/main/ofl/jersey10
- https://developer.repebble.com/guides/alloy/
- https://github.com/coredevices/pebble-watchface-agent-skill
