# ADR-0013: Query Prometheus-compatible APIs through the phone bridge

- Status: Accepted
- Date: 2026-10-25

## Context

The face shows CPU usage, memory usage, and a firing-alert count. CPU and memory expressions must be configurable. Prometheus results can be numbers or strings; the first implementation does not need a graph, but its contract should allow future history plotting.

## Options considered

1. Fetch metrics directly from the watch. This would put network and credential concerns in the watch runtime, would not reuse the native phone bridge, and is inconsistent with the shared provider/cache architecture.
2. Read Prometheus values indirectly through Home Assistant. This adds a dependency on configured HA entities and does not support arbitrary PromQL expressions against the user's Prometheus-compatible API.
3. Call the configured Prometheus HTTP API from the native Android companion. This supports user-authored instant queries, standard HTTPS authentication, and centralized validation/cache.
4. Use a fixed vendor-specific metrics service. This would break compatibility with arbitrary Prometheus-API-compatible deployments.

## Decision

Choose option 3. Use the configured HTTPS base URL and the Prometheus-compatible instant query endpoint (/api/v1/query). The user configures independent PromQL expressions for CPU and memory. Validate query length, response size, status, result type, and value length; allow only bounded numeric or text rendering. Credentials stay in Android Keystore-backed companion storage and are never included in watch payloads or logs.

For the alert icon:
- prefer counting active Alertmanager alerts if the deployment scrapes an Alertmanager metric such as alertmanager_alerts{state="active"} into Prometheus;
- if that metric is unavailable, permit an explicit fallback query such as count(ALERTS{alertstate="firing"}), while documenting that this counts firing Prometheus rule series and may differ from Alertmanager's active alerts after silences and inhibition;
- never silently report a rule-series count as the Alertmanager active-alert count.

Refresh defaults to 5 minutes, configurable from 1 to 60 minutes. Keep the provider result model extensible to range queries and bounded downsampling for a later graph feature, but do not implement a Prometheus graph in this phase.

## Consequences

- A read-only Prometheus service account or equivalent least-privilege token should be used.
- The companion handles network errors, timeouts, cache, and stale/red indicators according to ADR-0004.
- Users can adapt CPU and memory queries to their own metric names, labels, and server conventions.
- Alert counts depend on which alert metrics are actually scraped; absent metrics must be presented as unavailable, not as zero.

## References

- https://prometheus.io/docs/prometheus/latest/querying/api/
- https://prometheus.io/docs/prometheus/latest/querying/basics/
- https://prometheus.io/docs/alerting/latest/alertmanager/
