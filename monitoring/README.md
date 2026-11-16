# GrubPac production backend monitoring

This stack monitors only the production backend deployed from `main`. It runs independently of the Bun/PM2 backend deployment and does not change PM2, Nginx, AWS security groups, ports, or the blue-green state file.

## Components

- **Prometheus** scrapes both production slots on ports 8000 (Green) and 8003 (Blue), Node Exporter, and Loki.
- **Node Exporter** reads host metrics and a textfile metric identifying the active production slot.
- **Grafana Alloy** tails only the four configured production PM2 log files and forwards to Loki.
- **Loki** stores logs on a persistent Docker volume.
- **Grafana** provides provisioned Prometheus/Loki sources and the production dashboard.

The Compose stack has no backend container. Prometheus, Loki, and Alloy have no published host ports. Services use a dedicated user-defined Docker bridge; Grafana binds only to EC2 loopback. Access it over an SSH tunnel or an already approved private access path.

## Quick links

- [Deployment](./DEPLOYMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

## Application telemetry

Request logs continue through the existing network logger and Winston output to PM2 stdout/stderr. Alloy forwards those PM2 lines to Loki as-is; it does not require JSON-formatted logs or alter existing application log statements. The existing request-ID middleware returns `X-Request-Id` in the response header. The new middleware is used for metrics only.

Application metrics are exposed at `GET /metrics` only when `METRICS_BEARER_TOKEN` is configured and the request has the matching `Authorization: Bearer ...` header. Requests without authorization receive 404. Set the same secret in the backend's `.env.production` and in `monitoring/secrets/metrics-token` on EC2. Do not commit either secret.

The endpoint reports request counters, a finite-bucket latency histogram, in-flight requests, process uptime, and resident memory. Prometheus computes rates and P50/P95/P99 from the histogram; no request IDs, user IDs, query strings, or raw unmatched paths become metric labels.

The deployment slot is read from `DEPLOYMENT_SLOT` when explicitly set, or from the PM2 `pm_out_log_path` runtime value when available. Prometheus also applies the slot label from each fixed port target.

Application environment settings:

| Variable | Purpose |
| --- | --- |
| `METRICS_BEARER_TOKEN` | Required to enable authenticated metrics scraping; same secret as the Prometheus-mounted token file. |
| `DEPLOYMENT_SLOT` | Optional metrics label override. Otherwise inferred from PM2's runtime output-log path. |

Monitoring `.env` settings are `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_PORT`, `LOKI_RETENTION_PERIOD`, and `PROMETHEUS_RETENTION`. See `.env.example`; never commit the actual `.env`.

## Queries

Example PromQL:

```promql
sum by (deployment_slot) (rate(grubadmin_http_requests_total{job="backend"}[5m]))
```

```promql
histogram_quantile(0.95, sum by (le) (
  rate(grubadmin_http_request_duration_seconds_bucket{job="backend"}[5m])
))
```

Example LogQL:

```logql
{service="grubadmin-backend",environment="production",deployment_slot="blue"}
```

```logql
{service="grubadmin-backend",environment="production",log_type="stderr"} |= "error"
```

Search existing log text with a literal filter, for example:

```logql
{service="grubadmin-backend",environment="production"} |= "request-id-here"
```

## Dashboard and alert delivery

The provisioned dashboard is **GrubPac Production Backend Monitoring** in Grafana's **Production** folder. Prometheus alert rules are evaluated from `prometheus/alerts.yml`. This stack does not include an Alertmanager or embed notification credentials, so Prometheus rules do not send notifications by themselves.

To notify from these rules, either deploy an Alertmanager on the private monitoring network and configure the Prometheus `alerting.alertmanagers` target, or create equivalent Grafana-managed alert rules. In Grafana, use **Alerting → Contact points** to create and test an Email or Slack contact point, then create a notification policy to route the Grafana-managed rules. Keep SMTP/Slack credentials in protected Grafana configuration or a separate secret manager; do not commit them.

## Retention and storage

Configure `LOKI_RETENTION_PERIOD` and `PROMETHEUS_RETENTION` in the untracked monitoring `.env`. Loki retention is enforced by its compactor and Prometheus retention by its TSDB. Both use persistent named volumes. Monitor EC2 free disk; retention settings do not constitute a hard disk quota.

Avoid adding dynamic request IDs, user IDs, email addresses, or raw URLs to Loki labels. PM2 log lines are ingested as-is, so searches operate on their existing text.
