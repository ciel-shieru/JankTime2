# ADR-0005: Export Wakey-SITizen alarm and bedtime data through a read-only Android provider

- Status: Accepted for design; implementation requires a separate Wakey-SITizen PR
- Date: 2026-10-25

## Context

Alarm and calculated-bedtime data are calculated in Wakey-SITizen and stored in that Android app. The Pebble watchface's native companion cannot read another Android app's private DataStore directly. Running a generic local HTTP server in the background adds unnecessary listening sockets, TLS/certificate setup, and Android lifecycle constraints.

## Options considered

1. PebbleKit JS reads Wakey's private storage. Not possible; app sandbox boundaries prevent it.
2. Wakey runs an HTTP server on the phone. This expands the attack surface, requires lifecycle management and authenticated TLS accessible to a separate app, and is unnecessary for same-device IPC.
3. Wakey exports data to a third-party cloud service. This leaks personal schedule data to an additional service and introduces a network dependency.
4. Wakey exposes a dedicated, opt-in, read-only Android ContentProvider call contract with a separately generated bearer-style pairing token. JankTime2 reads it through Android's ContentResolver. This uses Android IPC instead of a network socket and returns only the minimum fields.
5. Users manually export/share a JSON file. This is secure enough for one-time export but cannot provide automatic 5-minute refresh.

## Decision

Choose option 4. The separate Wakey-SITizen PR will add an explicitly enabled export surface returning a versioned, minimal payload containing the next alarm timestamp, calculated bedtime timestamp (nullable), and calculation/update timestamp. JankTime2 pairs through a per-install random token generated and revocable in Wakey settings; the user enters it in the JankTime2 companion. JankTime2 stores it in Keystore-backed storage. The provider must expose read-only data, validate the token using a constant-time comparison, avoid logging it, and never return timetable details or unrelated preferences.

JankTime2 polls the local provider every 5 minutes by default, configurable from 1 to 60 minutes. For the status-bar time, show the calculated bedtime and bedtime icon only when it is scheduled earlier than the next alarm; otherwise show the next alarm and alarm icon. When either input is missing, use the available valid input and mark missing-source state appropriately.

## Consequences

- A dedicated cross-repository implementation PR is required in ciel-shieru/Wakey-SITizen, following that repo's AGENTS.md and existing docs/adr/ conventions.
- Pairing is explicit and revocable; no network listener is added to Wakey.
- The token is a local IPC credential and is never sent to the watch.
- Android version/lifecycle and ContentProvider access must be tested on the user's supported API levels before release.
