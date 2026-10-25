# ADR-0016: Keep custom-font resources consistent with renderer requests and reject blank screenshots

- Status: Accepted
- Date: 2026-10-25

## Context

The latest screenshot artifact was 200×228 and white. CI had passed because its earlier smoke check only rejected the known mid-gray Alloy fatal dialog. Inspecting src/ts/watch/main.ts and src/embeddedjs/manifest.json found a concrete startup defect: the renderer requested Jersey10-Regular-42.fnt, but the manifest generated size 56 rather than 42. The Alloy skill warns that invalid font/resource combinations can leave a white watch screen while the CLI still exits successfully.

## Options considered

1. Keep the smoke test focused only on the old mid-gray fatal dialog. This misses white-screen startup failures.
2. Add a live renderer test that asserts the entire pixel-perfect layout. This is desirable later but requires robust visual comparison and a stable reference image.
3. Verify that every requested custom font size is declared in the manifest, and require minimum foreground and blue/yellow accent pixels in the emulator screenshot. This directly catches the observed missing-resource defect while remaining independent of exact anti-aliasing/layout geometry.

## Decision

Choose option 3. The manifest declares only the currently loaded Jersey 10 font sizes (12, 16, 42), and the unit tests compare the manifest sizes with requests in main.ts. The screenshot checker rejects either the known mid-gray fatal dialog or a blank-like image without enough dark foreground pixels and blue/yellow accent pixels.

This is a crash/blank-screen smoke test, not final visual acceptance. Continue inspecting emulator screenshots for alignment, clipping, icon shapes, font proportions, and color placement against the approved reference.

## Consequences

- Any font size added/changed in main.ts must be added to the manifest and covered by tests.
- Unused font sizes are removed to limit generated assets and build size.
- CI will fail if the app builds but does not visibly draw the expected face elements.

## References

- https://github.com/coredevices/pebble-watchface-agent-skill
- https://developer.repebble.com/guides/alloy/reference/
