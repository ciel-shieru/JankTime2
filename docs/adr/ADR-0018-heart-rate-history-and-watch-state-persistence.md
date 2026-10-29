# ADR-0018: Persist display state on the watch and configure a bounded heart-rate history window

- Status: Accepted
- Date: 2026-10-27

## Context

Navigating away from the native Alloy watchface can stop/restart its process, discarding ordinary JavaScript variables. The phone companion refreshes independently, so relying on a new AppMessage batch after every watchface launch causes otherwise valid metrics, rows, and slot assignments to appear empty until the next refresh.

Pebble Health exposes minute-level heart-rate records over a caller-selected time range. A fixed two-hour window is not sufficient for users who want to inspect a shorter recent period or a full day, while allocating a duration-sized native record array for 24 hours would waste the watch's limited memory.

## Decision

Persist the validated display-ready watch state and metric-slot configuration in Alloy `localStorage`. The record is bounded, schema-validated on restore, contains no credentials or provider response objects, and is saved after each accepted AppMessage update. If local storage is absent, corrupt, full, or contains invalid fields, start from defaults and continue safely.

The companion exposes separate hour and minute inputs for the heart-rate graph. Accept only whole-number windows from 5 minutes to 24 hours inclusive; default to 2 hours. Send the total minutes over the existing bounded AppMessage status packet. On the watch, pass that period to the native HealthService FFI; clamp invalid native input to the default. Query minute history using a fixed 120-record work buffer and resume from the end of each returned page. Retain at most 16 down-sampled BPM values for the graph and the last-known-good current BPM separately.

A Wakey-SITizen response with no upcoming valid alarm or bedtime is not considered a successful refresh. Preserve the last-known-good alarm/bedtime display and mark it stale/red instead of replacing it with `--:--`. The source ContentProvider may legitimately return null timestamps when there is no upcoming schedule; the client treats this as unavailable data, not a valid clear operation.

The image picker uses Android's Storage Access Framework `OpenDocument` contract. Import opens the returned URI using `ContentResolver.openInputStream`, with a typed image-descriptor fallback for providers that expose virtual/cloud-backed documents only through `openTypedAssetFileDescriptor`. The app does not request photo/media-storage read permissions.

## Consequences

- Returning to the watchface restores the last accepted display values and configuration before the phone runs its next refresh.
- Watch-side storage remains bounded and excludes credentials; restored fields are validated individually.
- The graph can cover the configured span without allocating a large native history array or sending raw health history over AppMessage.
- Unavailable Wakey data retains the prior alarm/bedtime with a stale indicator; a valid fresh response clears staleness.
- Image import uses a user-mediated URI grant and does not broaden Android runtime permissions.

## References

- https://developer.repebble.com/guides/alloy/storage/
- https://developer.repebble.com/guides/events-and-services/health/
- https://developer.android.com/guide/topics/providers/document-provider
