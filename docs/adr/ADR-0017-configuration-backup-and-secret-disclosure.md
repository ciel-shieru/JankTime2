# ADR-0017: Use an explicit, bounded JSON configuration backup

- Status: Accepted
- Date: 2026-10-26

## Context

The companion holds provider URLs, entity IDs and queries, metric assignments, refresh intervals, calendar selections, a 30×30 one-bit user image, and credentials protected by Android Keystore-backed encrypted storage. Users need a portable file-based backup and restore flow without silently turning encrypted secrets into an exposed file.

## Decision

Use a versioned JSON document with strict size, schema, field, URL, entity ID, query length, metric slot, calendar ID, regex, and image-row validation. Reject unsupported schema versions, unknown fields, credentials embedded in URLs, non-HTTPS endpoints, malformed inputs, and files larger than 256 KiB. Import/export use Android's document picker and do not log filenames' contents, provider responses, or secrets.

The default export contains settings and the optional preprocessed 30×30 image but omits all credentials. A distinct confirmation dialog is required to include secrets; it states explicitly that tokens become plaintext in the exported JSON and warns users not to share, sync, or upload the file. Importing a backup that contains secrets requires an explicit choice to restore them or import settings only. Restored credentials are passed back into the encrypted Android Keystore-backed secret store. Importing settings without secrets leaves existing stored credentials unchanged.

## Consequences

- Backups can be moved between installations without reproducing all metric and provider settings manually.
- A backup containing secrets is a plaintext credential bundle and must be handled as sensitive data until deleted securely. The app never claims that export-time secrets are encrypted.
- Image content is bounded to 30 rows of 30 binary characters; the imported image is cached locally and sent through the existing bounded AppMessage chunks.
- The supported format is schema version 1. Future fields require validation and an intentional schema compatibility decision.

## References

- Android Storage Access Framework: https://developer.android.com/guide/topics/providers/document-provider
- Android Keystore system: https://developer.android.com/privacy-and-security/keystore
- Project backup codec: `companion/android/app/src/main/java/com/cielshieru/janktime2/config/ConfigBackup.kt`
