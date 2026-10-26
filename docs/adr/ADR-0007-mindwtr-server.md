# ADR-0007: Use the Mindwtr Cloud API with a local focus-membership ledger

- Status: Accepted
- Date: 2026-10-25

## Context

The user's Mindwtr Android app syncs with their self-hosted Mindwtr Cloud service. Reading another Android app's private files is blocked by Android's application sandbox and would couple JankTime2 to a private database. The current Mindwtr Cloud API supports GET /v1/tasks with isFocusedToday=true, all=1 to include completed tasks, and standard limit/offset pagination. Task objects expose id, title, status, priority, startTime, dueDate, isFocusedToday, and completion timestamps. The sync model clears today's-focus status when a task is completed, so a fresh API snapshot cannot always identify the completed task as previously focused.

## Options considered

1. Read Mindwtr Android's private database/files. Rejected: Android sandboxing prevents it and it couples this app to internal storage.
2. Add a Mindwtr Android ContentProvider export. This would require a separate upstream dependency despite the user's already-running self-hosted Cloud API.
3. Query the self-hosted Cloud API and maintain a bounded local ledger of task IDs that JankTime2 has observed in today's focus list. This reuses the deployed API and can count tasks that were seen focused before completion.
4. Reconstruct historical focus membership from title, status, completion date, or task timestamps. Rejected: none of these proves that a task was starred/focused today.

## Decision

Choose option 3. Use the configured HTTPS Cloud URL and a least-privilege bearer token. Request tasks with isFocusedToday=true&all=1, walking the endpoint's validated pagination. Treat the Cloud response as {tasks, total, limit, offset} and validate each record before consuming it. Never infer focus membership from an arbitrary completed task.

Persist a local, date-scoped set of opaque task IDs observed while their isFocusedToday flag is true. The remaining count is the number of currently eligible focused tasks not completed/archived. The total is the union of IDs observed focused today plus current active focused tasks, including entries whose completion state changed after an earlier poll. Reset the ledger at the configured local-day boundary and cap its size. Do not persist task titles in this ledger or log task names.

The total is necessarily best-effort if JankTime2 was not running when a task was focused, or a task was completed between polls before the companion observed it. The UI/docs must state this limitation; only a Mindwtr-provided focus-history field or explicit upstream event/export API can provide an exact total in every case. Do not fabricate the missing history.

Use only the two next focused items, sorted by parsed start time then due time. Render 24-hour HH:mm and priority marks (low = !, medium = !!, high = !!!, urgent = !!!!); hard-clip overflow without an ellipsis. If both times are missing or 00:00, render start and due dates as DD/MM without times. If non-midnight start and due times land on different local dates, render both as DD/MM HH:mm; otherwise retain HH:mm-only values. Refresh every 5 minutes by default, configurable from 1 through 60 minutes. Cache the validated provider snapshot, reuse last-known-good data on failure, and mark affected metrics stale/red under ADR-0004.

## Consequences

- No cross-app private storage access or Mindwtr-side modification is required.
- A read-only bearer token and HTTPS URL are required.
- Pagination and schema validation are mandatory; do not assume one page contains all focus tasks.
- The focus count is exact for currently focused tasks and best-effort for tasks that were seen focused then completed.
- If the Cloud API later exposes durable focus-history, prefer that authoritative field and version this integration contract.

## References

- https://docs.mindwtr.app/developers/cloud-api
- https://github.com/dongdongbh/Mindwtr/blob/main/apps/cloud/src/server.ts
- https://github.com/dongdongbh/Mindwtr/blob/main/packages/core/src/types.ts
