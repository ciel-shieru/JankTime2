# Wakey-SITizen export integration contract

This document is the contract for the follow-up PR in ciel-shieru/Wakey-SITizen. Follow that repository's AGENTS.md, Kotlin/version-catalog conventions, test placement, and ADR numbering before coding.

## Minimal read-only payload

Version 1 returns:
- schemaVersion: integer;
- nextAlarmAt: ISO-8601 instant or null;
- bedtimeAt: ISO-8601 instant or null;
- calculatedAt: ISO-8601 instant;
- updatedAt: ISO-8601 instant.

It must not export timetable rows, campus locations, authentication state, snooze/skip overrides, or unrelated preferences. The companion uses the timestamps to derive the status bar value.

## Pairing and API shape

Add an opt-in export setting. Wakey generates a high-entropy per-install token that the user can revoke/rotate. The separate provider is read-only and returns only the schema above after validating the token using a constant-time comparison. Prefer an Android ContentProvider call() contract with the token in the call Bundle rather than an exported HTTP server or a bearer token in a URI. Do not log the Bundle, token, or payload. Rate-limit repeated invalid attempts and return a generic error.

The exact authority, method name, and token storage must be selected to match existing Wakey package conventions in the implementation PR and then recorded in a new ADR there. Do not add an unauthenticated exported provider.

## JankTime2 behavior

The JankTime2 native companion reads this provider locally using ContentResolver. Refresh defaults to five minutes (configurable from one to sixty). If bedtime is valid and is earlier than the next alarm, the status bar shows bedtime and a bedtime icon; otherwise it shows the next alarm and alarm icon. If the data is missing or stale, use the last good values and mark the affected icon stale/red.

## Required tests in the Wakey PR

- Export disabled by default.
- Valid token can read the minimal schema.
- Invalid/revoked token cannot read data.
- Payload includes no unrelated personal data.
- No token or payload is emitted in logs.
- Missing, skipped, overridden, or not-yet-calculated alarms/bedtime are handled without crashing.
- Schema versioning preserves compatibility with older companion versions.
