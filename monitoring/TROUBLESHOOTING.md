# Troubleshooting

Start with container state and recent logs:

```bash
cd /home/ubuntu/monitoring
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=200 SERVICE
```

## Backend targets are DOWN

- Verify both production processes answer locally on their configured ports: Green `8000`, Blue `8003`.
- Confirm the application loaded `METRICS_BEARER_TOKEN` and `/metrics` returns Prometheus text only with a matching bearer token; unauthorized requests deliberately return 404.
- Compare the protected Prometheus secret file byte-for-byte through your secret manager, without printing it to shared logs.
- Check the app bind address and Docker host gateway resolution. Prometheus uses `host.docker.internal` via Compose `host-gateway`.
- Check target labels and scrape errors at Prometheus `/targets` using authenticated local access (not exposed publicly).

## Active/standby status is empty or wrong

- Inspect the source file's format locally: it must contain `blue` or `green`.
- Run `sudo systemctl status grubadmin-active-slot.timer` and `sudo journalctl -u grubadmin-active-slot.service`.
- Check the generated file `/var/lib/node_exporter/textfile_collector/grubadmin_active_slot.prom` and Node Exporter's scrape. The helper is read-only with respect to the source state file; do not manually edit that state file.
- If systemd has not refreshed, run the oneshot service once and confirm it exits successfully.

## Alloy has no logs

- Confirm each exact PM2 file exists and is readable by Docker; compare to the four read-only Compose mounts and the matching Alloy paths.
- `docker compose config` catches malformed mount definitions, but missing bind files must be fixed on EC2 before Compose starts.
- Inspect Alloy's component health and logs. Confirm Loki is healthy at `http://loki:3100/ready` from inside the monitoring network.
- Check Grafana Explore with `{service="grubadmin-backend",environment="production"}` and extend the time range. Initial positions start at the end of each file, avoiding ingestion of old retained data.
- Keep static labels limited to service, environment, slot, type, and host. PM2 lines are forwarded as-is, without JSON parsing.

## Loki or Prometheus storage problems

- Check `docker system df`, filesystem availability, service logs, and configured retention.
- Loki retention requires a healthy compactor; inspect Loki startup logs if expired data is not removed.
- Prometheus retention is controlled by `PROMETHEUS_RETENTION`; TSDB storage grows with scrape volume and retention. Alerting rules are loaded from `prometheus/alerts.yml`.
- Back up before changing volumes or replacing storage. Never use `docker compose down -v` for routine maintenance.

## Grafana dashboard or data source missing

- Check Grafana health and logs, then verify provisioning files are mounted read-only.
- Prometheus should be reachable at `http://prometheus:9090` and Loki at `http://loki:3100` from Grafana's Compose network.
- Verify dashboard provisioning path `/var/lib/grafana/dashboards/grubpac-production.json` and source UIDs `prometheus` and `loki`.

## Container health check failures

Check the service logs and local readiness URL from inside the container. A health check failure does not justify restarting the backend or changing production routing; repair or restart only the affected monitoring service after identifying the cause.
