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

Choose option 3. Pin actions to immutable Git commit SHAs and set minimal workflow permissions. Pin Node.js 22.16.0, Python 3.12.15, JDK 17.0.21+9, Pebble Tool 5.0.40, Pebble SDK 4.33.1, Android SDK platform 36 / build-tools 36.0.0, and TypeScript 5.9.3. Emulator libraries are installed from a fixed Ubuntu archive snapshot with exact versions and APT SHA-256 validation. Install JavaScript dependencies with lifecycle scripts disabled. The CI runs lint, typecheck, tests, TypeScript generation, pebble build, installs on the emery emulator, captures a screenshot, captures diagnostic logs, and uploads those outputs as a GitHub Actions artifact.

## Consequences

- Toolchain updates are intentional PRs rather than floating version changes.
- The screenshot artifact is expected to be reviewed after the final layout exists. The automated checker catches the observed full-screen Alloy memory-error dialog but cannot prove fine-grained layout fidelity.
- CI must install the emulator's Linux display/runtime dependencies and use a virtual display.
- The workflow has a required repository-policy gate, a watchface build/screenshot job, and an Android companion test/lint/build job. The production-mode `.pbw` and screenshot/log evidence are separate artifacts; fixture-enabled builds are never distributed.
