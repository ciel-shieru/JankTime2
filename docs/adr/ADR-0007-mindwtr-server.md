# ADR-0007: Use Mindwtr Cloud REST API, not private Android app storage

- Status: Accepted
- Date: 2026-10-25

## Context

Mindwtr provides a self-hosted Cloud service with task-list REST endpoints, and the user's Android app syncs to that server. Another Android app cannot read Mindwtr's private local storage without an explicit integration from Mindwtr, and direct filesystem access is unsuitable for production. Mindwtr documents a separate desktop-only Local API with an `isFocusedToday` filter; its documentation explicitly distinguishes local/desktop endpoints from cloud/helper APIs. Do not assume that filter or identical task fields exist on every Cloud version.

## Options considered

1. Read the installed Mindwtr Android app's internal database/files. Rejected because Android app sandboxing prohibits this and it would couple JankTime2 to private storage formats.
2. Depend on a new Mindwtr ContentProvider/export PR. This creates an upstream dependency that is unnecessary when the user's existing self-hosted server already exposes task APIs.
3. Fetch from the configured Mindwtr Cloud REST API over HTTPS. The documented API supports listing tasks and filtering today's focus, and it is already the user's sync authority.

## Decision

Choose option 3. Use the configured self-hosted Cloud base URL and read-only bearer token over HTTPS. Confirm the Cloud endpoint, query parameters, response schema, and completion/history behavior against the user's deployed version before implementing the provider. The Cloud tasks endpoint is the starting point; do not assume the desktop-only `isFocusedToday` filter is supported in Cloud. If the Cloud API cannot supply the starred/focus, schedule, priority, or completed-item information required, stop short of inventing those values and add a minimal upstream export contract as a separate decision.

Only fetch the fields needed for the two focus rows and focus count. Sort the remaining focus items by eligible start time then due time, format times as 24-hour HH:mm, and render priority as exclamation marks. Count incomplete focus items for the remaining value and all today's focus items still represented by the API—including completed ones—for the total. Refresh every 5 minutes by default, configurable from 1 to 60 minutes.

## Consequences

- No Mindwtr private data is read from application files.
- A server URL and read-only token are required for Mindwtr features.
- If completed focus history is not retained by the deployed API, the companion must surface that limitation rather than invent the total; implementation tests must verify the semantics.
