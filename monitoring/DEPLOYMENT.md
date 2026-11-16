# Production deployment

Deploy this stack separately from backend CI/CD. These steps do not run the backend deployment script, restart PM2, change Nginx, ports, security groups, or update the active-slot file.

## Preconditions and host verification

Run on the production EC2 host as an administrator:

1. Install a supported Docker Engine and Docker Compose v2 plugin.
2. Verify the actual PM2 log file names before starting Compose; the workspace cannot inspect the EC2 host:

   ```bash
   pm2 describe grub_prod_blue
   pm2 describe grub_prod_green
   ls -l /home/ubuntu/.pm2/logs/
   ```

   Confirm that the four paths referenced in `docker-compose.yml` exist and correspond to the production Blue and Green PM2 processes. If names differ, update only those explicit read-only mounts and the matching `path_targets` in `alloy/config.alloy` before deploying. Do not mount the entire PM2 logs directory.

3. Confirm the active state file is readable and contains exactly `blue` or `green`:

   ```bash
   sudo cat /var/lib/grubadmin/active-prod-backend.color
   ```

4. Ensure the backend production environment includes a strong `METRICS_BEARER_TOKEN` secret. The value must match the Prometheus token file created below. Do not put credentials in this repository or deployment logs. Apply it through the existing production configuration process and let the next normal blue-green deployment load it; do not restart production processes as part of monitoring installation.
5. Confirm the EC2 firewall permits no new public monitoring ports. This setup does not require security-group changes.

The authenticated endpoint exists only in the new application build. A normal blue-green deployment updates its candidate process while keeping the previous process warm; therefore, both PM2 slots will scrape successfully only after both have been upgraded through the existing deployment process. Do not manually restart a production process to accelerate this. Until both slots are upgraded, Prometheus will correctly report the old slot as DOWN.

## Install

Copy the `monitoring/` directory to `/home/ubuntu/monitoring`. Then:

```bash
cd /home/ubuntu/monitoring
cp .env.example .env
chmod 600 .env
```

Edit `.env`: set a unique long Grafana admin password, choose an unused `GRAFANA_PORT` if needed, and set retention periods. Create the Prometheus secret securely, using the exact same secret as the backend's `METRICS_BEARER_TOKEN`:

```bash
sudo install -d -o root -g root -m 0750 secrets
sudo sh -c 'umask 077; printf "%s" "PASTE_THE_EXISTING_METRICS_BEARER_TOKEN" > secrets/metrics-token'
sudo chmod 600 secrets/metrics-token
```

Avoid placing the secret directly in shell history. Use a protected editor or approved secret manager instead.

Install the active-slot textfile exporter (read-only access to the state file):

```bash
sudo install -o root -g root -m 0755 host/update-active-slot.sh /usr/local/sbin/grubadmin-update-active-slot
sudo install -o root -g root -m 0644 host/grubadmin-active-slot.service /etc/systemd/system/
sudo install -o root -g root -m 0644 host/grubadmin-active-slot.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now grubadmin-active-slot.timer
sudo systemctl start grubadmin-active-slot.service
sudo cat /var/lib/node_exporter/textfile_collector/grubadmin_active_slot.prom
```

The script only reads the blue-green state file. It writes its separate Prometheus textfile output atomically. Do not enable the timer unless the active-state format has been verified.

Validate and start only the monitoring project:

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml ps
```

This Compose project is independent of backend deployment. Backend CI/CD must not run Compose commands against this directory.

## Verify

Check container health and logs:

```bash
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=100 prometheus loki alloy grafana node-exporter
```

Check both backend targets and rules:

```bash
docker compose --env-file .env -f docker-compose.yml exec prometheus \
  wget -qO- http://127.0.0.1:9090/api/v1/targets
docker compose --env-file .env -f docker-compose.yml exec prometheus \
  wget -qO- http://127.0.0.1:9090/api/v1/rules
```

The `backend` job must show two targets with slots `green`/`blue`, and `node-exporter` must expose `grubadmin_active_slot`. An unauthorized local request to either backend `/metrics` should return 404; an authorized request should return Prometheus text. Avoid putting the secret in shell history or terminal recordings.

Grafana listens only on EC2 loopback. From an administrator workstation, tunnel it:

```bash
ssh -N -L 3000:127.0.0.1:3000 ubuntu@YOUR_EC2_HOST
```

Open `http://127.0.0.1:3000`, sign in using the `.env` credentials, and open **Production → GrubPac Production Backend Monitoring**. Provisioned sources should be named **Prometheus** and **Loki**.

Check both slot log streams in Loki/Grafana. Alloy tails from the current end on first start, then persists file positions in its named volume; old file content is not re-ingested on Alloy restarts.

## Alert notifications

Prometheus evaluates `prometheus/alerts.yml`, but there is no Alertmanager in this stack and Prometheus rules do not send notifications by themselves. To use Alertmanager, deploy it on the monitoring bridge and add it as a private `alerting.alertmanagers` target in Prometheus. Alternatively, create equivalent Grafana-managed alert rules, add/test an Email or Slack contact point under **Alerting → Contact points**, and route rules with a notification policy. Add channel credentials only through protected Grafana configuration or a secret manager; do not commit them to Compose or provisioning files. Alert delivery is inactive until a receiver and route are configured and tested.

## Maintenance, backup, and recovery

- Change retention in `.env`, then apply with `docker compose ... up -d`; verify available disk space first.
- Upgrade by selecting tested exact image versions, validating Compose/configs, backing up data, and then recreating only the monitoring services.
- Back up persistent volumes during a quiesced/consistent window. Example for Loki (repeat for `prometheus-data` and `grafana-data`):

  ```bash
  docker compose --env-file .env -f docker-compose.yml stop loki alloy
  docker run --rm -v grubadmin-production-monitoring_loki-data:/data:ro \
    -v "$PWD/backups:/backup" alpine:3.21 \
    tar -czf /backup/loki-data.tgz -C /data .
  docker compose --env-file .env -f docker-compose.yml start loki alloy
  ```

- Protect and back up `.env` and `secrets/metrics-token` separately; they are not Docker-volume data.
- Restore only after stopping the target monitoring service, preserving the existing volume as a rollback copy, restoring the archive to the correct named volume, and verifying service health.
- To stop monitoring without affecting production backend processes: `docker compose --env-file .env -f docker-compose.yml down`. Do not add `-v` unless intentionally deleting all monitoring history.

## Security

Services use a dedicated user-defined Docker bridge with no published ports for Prometheus, Loki, Alloy, or Node Exporter. Grafana is published only on `127.0.0.1`; Prometheus reaches the backend through Docker's host-gateway mapping. The metrics endpoint requires bearer authentication. PM2 log files and the host root are mounted read-only; only the four specified log files are mounted into Alloy. Protect SSH, `.env`, and the Prometheus secret. Do not expose these services by changing Nginx or AWS security groups as part of this deployment.
