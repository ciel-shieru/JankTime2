# ADR-0011: Explicitly size the Alloy VM heaps for the watchface

- Status: Accepted
- Date: 2026-10-25

## Context

The first emulator screenshot revealed that a successful package build and screenshot command do not prove the Alloy VM launched successfully. The 200×228 screenshot displayed **Alloy: Fatal Error — memory full**. RePebble's Alloy Reference documents that moddable_createMachine(NULL) uses a default 32 KiB static pool, divided among the slot heap, chunk heap, and stack. It also documents the ModdableCreationRecord mechanism for setting those sizes.

JankTime2 loads custom bitmap fonts for compact status and metric labels and a 56 px clock, then maintains drawing state and an AppMessage receiver. The default VM pool is insufficient for the current startup/resource peak.

## Options considered

1. Reduce all typography to system fonts and remove the custom pixel font. This avoids some font-resource allocations but harms fidelity to the approved image and does not fix the need to budget runtime memory as modules grow.
2. Keep the default 32 KiB pool and try to reduce runtime allocations only. This risks repeat regressions as the approved layout and companion data handling are implemented.
3. Provide a bounded ModdableCreationRecord with a larger stack/slot/chunk allocation and enforce a screenshot-launch smoke test in CI. This matches the official Alloy memory guidance and makes runtime startup failure visible to CI.

## Decision

Choose option 3. src/c/mdbl.c allocates a 5,120-byte stack, 36,864-byte slot heap, and 28,672-byte chunk heap (70,656 bytes total). The allocation is explicit, bounded, and sized below the documented 128 KiB emery app-RAM budget. The remaining headroom must be rechecked when assets or modules change; if font parsing or the Poco framebuffer grows, profile and adjust the allocation rather than blindly increasing it.

CI captures the emery screenshot and runs scripts/check_screenshot.py. The checker verifies native resolution and rejects the known uniform mid-gray fatal-dialog screen, even if the Pebble CLI returns a successful exit code. It is a regression smoke test, not a replacement for human visual comparison against the approved layout.

## Consequences

- Editing the normal mdbl.c template is justified for this documented runtime-memory requirement; do not make unrelated boot-code changes.
- Every added font size, Unicode block, module, large string, or graph buffer must be considered in runtime-memory review.
- A green CI run requires both package build success and a screenshot that passes the fatal-screen smoke check.
- The first successful screenshot must still be inspected for visual fidelity, alignment, clipping, colors, and e-paper behavior.

## References

- https://developer.repebble.com/guides/alloy/reference/
- https://developer.repebble.com/guides/alloy/poco-guide/
- https://github.com/coredevices/pebble-watchface-agent-skill
