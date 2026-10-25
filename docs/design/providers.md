# Provider and phone bridge contract

## Chosen boundary

A native Android companion is the phone-side bridge. It owns credentials, direct HTTPS connections, Android calendar/battery access, the Wakey-SITizen export connection, caching, refresh scheduling, validation, and settings. It sends compact, typed display snapshots to the watch using PebbleKit Android / AppMessage. The watch does not receive credentials or whole provider responses.

This is intentional: RePebble explicitly says PebbleKit JS cannot be used together with PebbleKit Android/iOS. PebbleKit JS is a sandbox intended for web/geolocation/storage access; the native companion is required for synced Android calendars, phone battery, and inter-app Wakey data. Do not quietly switch to a PKJS-only architecture. This choice means the watchface relies on installation of the separate native companion for phone-only features.

## Home Assistant details

Use authenticated HTTPS calls directly to the configured Home Assistant server. Fan state, a separately selectable generic sensor, water, weather, and climate entities have independent optional entity fields and populate the matching watch metric IDs. Sensor entities expose their current state/attributes; climate metrics must choose an explicitly configured state or allowed attribute. Weather entity integrations have varying attributes, so use a supplied apparent/feels-like temperature when available and Home Assistant's supported forecast endpoint/action for precipitation probability. Do not assume every weather entity exposes a feels-like attribute or current rain probability. If unavailable, emit an unavailable state or an explicitly configured fallback rather than fabricating data. Condition values map through a fixed local icon table; provider data cannot select arbitrary resources.

## Prometheus details

Run an instant query through the Prometheus-compatible `/api/v1/query` API. CPU and memory queries are independently configured and return a bounded scalar/string rendering. For Alertmanager's current active-alert count, prefer the Prometheus-scraped `alertmanager_alerts{state="active"}` metric (for example `sum(alertmanager_alerts{state="active"})`) when it exists. If it is not exposed, allow the user to configure a fallback query such as `count(ALERTS{alertstate="firing"})`, but document that this counts firing Prometheus rule series and is not necessarily the same as Alertmanager's active set after silences/inhibition. Do not silently conflate these counts. Future graph support can add bounded range queries with downsampling.

## Mindwtr details

Use only the user's configured self-hosted Cloud REST API endpoint with a read-only token. The Mindwtr Cloud REST API exposes GET /v1/tasks with isFocusedToday filtering and the all=1 option for including completed tasks; the companion pages this endpoint with a read-only token. It retains task start/due/priority fields needed for the watch rows. A local daily ledger of opaque IDs records tasks observed focused today, because completed focus items can disappear from the active focus set between polls. If the companion was offline while a task was focused and completed, that historical total is best-effort rather than fabricated.

## Snapshot shape

The concrete transport schema will be versioned and bounded. The contract requires, at minimum:
- schema version;
- metric slot identifier and display value;
- icon/state identifier, never a remotely supplied executable resource path;
- source identifier;
- timestamp of last successful fetch;
- fresh/stale/error state;
- bounded list of at most two focus rows and two calendar rows;
- current BPM and a bounded sample set/minimum/maximum for the graph;
- watch/phone connection and battery summary;
- next alarm and bedtime timestamps;
- optional already-downscaled image payload.

The exact AppMessage key/value encoding must respect Pebble's key-count, payload-size, and image transfer constraints; split large updates and acknowledge them. Tokens and full REST response objects are never part of this schema.

## Scheduling

Each remote provider has an independent interval:
- Home Assistant: 3 minutes by default.
- Prometheus: 5 minutes by default.
- Wakey-SITizen: 5 minutes by default.
- Mindwtr: 5 minutes by default.

Each can be configured to an integer 1–60 minute interval. Refresh on the phone is separate from watch redraw: only redraw on minute changes, changed data, a battery/connection event, or a user-triggered refresh. Cancel obsolete jobs and ensure there is no duplicate timer per provider.

## Cache and failure semantics

Cache a minimal, validated last-successful snapshot per provider, including fetch timestamp, and schema version. Update the cache atomically only after a full response passes validation. If a provider times out, returns a non-success status, changes schema unexpectedly, or provides invalid data, retain the old snapshot. Mark only that source stale; its associated icons turn red. Never replace a good cache with an error body or partial parse.

Cap response bodies and output fields. Use a bounded network timeout, retry with backoff rather than a tight loop, and honor the user-selected refresh interval. A successful response clears stale status.

## Transport and credential handling

- HTTPS only, normal certificate validation, bounded timeouts and response size.
- Reject cross-origin redirects before sending credentials or using a redirected response.
- Store bearer tokens in Android Keystore-backed encrypted storage; never store them on the watch.
- Use read-only tokens for HA and Mindwtr, and a least-privilege Prometheus account.
- Redact authorization headers, tokens, URLs containing credentials, calendar descriptions, and task titles from logs.
- Do not allow a provider to supply icon names, module paths, URLs to fetch automatically, or executable code.
