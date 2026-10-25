# ADR-0002: Fixed approved layout with eleven independently configurable metric slots

- Status: Accepted
- Date: 2026-10-25

## Context

The supplied screenshot is the approved visual design. It includes a five-by-two metric grid, with its second-row center cell reserved for a user image, plus two metrics beside the main clock. The image cell is not a metric slot.

## Options considered

1. Use hard-coded metrics and icon assignments. This is simpler but violates the requirement that each metric slot be independently swappable.
2. Make the entire grid freely rearrangeable. This is flexible but risks breaking the approved composition and makes image/clock geometry unstable.
3. Keep fixed geometry and give every metric position its own selector. This preserves the composition while satisfying independent metric assignments.

## Decision

Choose option 3. The eleven slot IDs are grid.top.1 through grid.top.5, grid.bottom.1, grid.bottom.2, grid.bottom.4, grid.bottom.5, clock.left, and clock.right. grid.bottom.3 is a reserved image cell and is not selectable as a metric. clock.left accepts none while the robot 3/5 metric is out of scope.

The initial default assignments and all text formatting are documented in docs/design/layout.md. The clock is local 24-hour HH:mm with leading zero and no seconds. Focus and calendar overflow is clipped without ellipses. Image uploads are downscaled on the phone to the measured native image bounds before being sent to the watch.

## Consequences

- Rendering geometry does not depend on provider values.
- Each slot setting changes only the assigned metric, not other slots or the layout.
- Metrics that do not fit must use concise bounded formatting rather than shrinking unrelated UI.
- The user-approved composition is tested against emery emulator screenshots after implementation.
