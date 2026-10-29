# ADR-0009: Use Raster Gothic system fonts and Poco for the fixed screen composition

- Status: Accepted
- Date: 2026-10-26

## Context

The watchface must use the Pebble firmware Raster Gothic system font, rather than bundling a custom font. RePebble documents the Alloy/Poco family names and supported firmware sizes. System fonts remove custom font resources and use the device's native glyph metrics.

## Options considered

1. Use built-in Raster Gothic system fonts at documented sizes. This matches the request, avoids extra font payload, and uses firmware-native glyph metrics.
2. Bundle a custom font. This adds resource size and a separate font-rendering path.
3. Render the whole face as a bitmap. This prevents dynamic values, status indicators, and graphs from being rendered correctly.

## Decision

Use Poco system fonts with `Gothic-Regular` and `Gothic-Bold`. Use only documented firmware sizes (9, 14, 18, 24, 28, and 36 where available). Dense rows use 9, status and metric values use 14, and the central clock uses 28. All text placement uses baseline-based coordinates derived from each font's reported height. Keep clipping based on measured width without ellipses. Remove custom font assets and parseBMF/parseRLE usage.

## Consequences

- No custom font files or font license payload are bundled.
- Glyph coverage is defined by the firmware system font; do not assume custom Unicode glyphs are available.
- Font family/size changes require screenshot review because glyph widths affect row fit and status-bar layout.
- The clock, status bar, metrics, graph, focus lines, and calendar lines remain dynamic drawing primitives.

## References

- https://developer.repebble.com/guides/app-resources/system-fonts/
- https://developer.repebble.com/guides/alloy/reference/
