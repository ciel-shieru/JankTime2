# ADR-0008: Pinned Pebble toolchain and CI emulator screenshot artifact

- Status: Accepted
- Date: 2026-10-25

## Context

The repository needs predictable validation for TypeScript/Alloy changes and a screenshot artifact that can be inspected in pull requests. The Pebble CLI supplies build, emulator install, logs, and screenshots, but does not provide a general project lint or unit-test command.

## Options considered

1. Run only pebble build. This misses TypeScript errors, project contract mistakes, and visual regressions.
2. Run unpinned latest dependencies and store screenshots manually. This is not reproducible and provides no PR evidence.
3. Pin Node/Python/Pebble tool/SDK and run type-check, lint, tests, build, emulator screenshot, and artifact upload. This supplies repeatable build checks and visual evidence.

## Decision

Choose option 3. Pin actions to immutable Git commit SHAs and set minimal workflow permissions. Pin Node.js 22.16.0, Python 3.12, Pebble Tool 5.0.40, Pebble SDK 4.33.1, and TypeScript 5.9.3. Install JavaScript dependencies with lifecycle scripts disabled. The CI runs lint, typecheck, tests, TypeScript generation, pebble build, installs on the emery emulator, captures a screenshot, captures diagnostic logs, and uploads those outputs as a GitHub Actions artifact.

## Consequences

- Toolchain updates are intentional PRs rather than floating version changes.
- The screenshot artifact is expected to be reviewed after the final layout exists; the initial scaffold screenshot is only a pipeline smoke test.
- CI must install the emulator's Linux display/runtime dependencies and use a virtual display.
- This initial workflow covers the watchface. Android companion CI is added with its implementation.
