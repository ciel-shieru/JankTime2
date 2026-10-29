# ADR-0014: Read phone calendars through Android Calendar Provider in the native companion

- Status: Accepted
- Date: 2026-10-25

## Context

The face must show the next two events from calendars already synced to the phone. The user chooses which calendars are eligible and can add regex blocklist patterns. A toggle defaults off: off shows the next two events within a one-year look-ahead and prefixes each row with DD/MM HH:mm; on restricts the query to the remainder of the current local day and shows HH:mm only. Each row also includes a location clipped to at most 10 characters and the title, with remaining overflow clipped abruptly and no ellipsis.

## Options considered

1. Use a watch-side PebbleKit JS query. The watch runtime cannot query Android's Calendar Provider.
2. Query every account's remote calendar provider from the watch or companion. This duplicates phone sync, expands credential scope, and may expose calendars not chosen by the user.
3. Read only selected calendar IDs through Android Calendar Provider from the native companion. This uses the phone's already-synced calendar set and can respect the user's selections and Android permission model.

## Decision

Choose option 3. The native companion requests calendar-read permission only when the user enables calendar display, lists calendars for explicit selection, and queries only the selected calendar IDs. Filter event instances by the configured regex blocklist before selecting the two next events. Bound regex pattern count and length, compile patterns when settings are saved, reject invalid expressions, and avoid unbounded/backtracking-prone expressions. Do not log titles, locations, descriptions, or attendee data.

Render event times in the user's local 24-hour HH:mm format with a leading zero. When the toggle is off, render DD/MM HH:mm; when it is on, render HH:mm. Clip location strings to 10 characters and hard-clip the rendered full line to the available pixel width without appending ellipses. Missing event fields should render as empty bounded fields rather than fabricated data.

Phone battery and connection state are likewise read by the Android companion/OS bridge, then sent as bounded status fields; neither is inferred from a remote server.

## Consequences

- Only calendar IDs explicitly chosen by the user are used.
- Calendar access stays on the phone; the watch receives at most two formatted strings.
- Regex filtering is configuration-driven and occurs before the next-event window is selected.
- If calendar permission is denied or the companion is not installed/connected, show unavailable or stale data rather than a fabricated event.

## References

- https://developer.android.com/reference/android/provider/CalendarContract
- https://developer.repebble.com/guides/communication/
