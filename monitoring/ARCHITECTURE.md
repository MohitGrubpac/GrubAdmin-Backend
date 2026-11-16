# Architecture

```mermaid
flowchart LR
  Internet --> Nginx
  subgraph EC2["Production EC2"]
    BlueGreen["api_prod blue-green upstream"]
    Blue["PM2: grub_prod_blue<br/>port 8003"]
    Green["PM2: grub_prod_green<br/>port 8000"]
    State["Read-only state file<br/>active-prod-backend.color"]
    Timer["systemd timer + exporter script"]
    Node["Node Exporter<br/>host metrics + active slot"]
    Alloy["Grafana Alloy<br/>four explicit PM2 log files"]
    Prom["Prometheus"]
    Loki["Loki<br/>persistent volume"]
    Grafana["Grafana<br/>loopback :3000"]
    Nginx --> BlueGreen
    BlueGreen --> Blue
    BlueGreen --> Green
    Blue -->|PM2 stdout/stderr| Alloy
    Green -->|PM2 stdout/stderr| Alloy
    State -->|read only| Timer -->|textfile metric| Node
    Blue -->|Bearer-auth /metrics| Prom
    Green -->|Bearer-auth /metrics| Prom
    Node --> Prom
    Prom --> Grafana
    Alloy --> Loki --> Grafana
  end
```

## Data flow and boundaries

- Backend instances remain native Bun/PM2 processes. Their configured listen ports are unchanged.
- Prometheus reaches the host through Docker's `host-gateway` mapping and scrapes Green `:8000` and Blue `:8003` independently, including the standby.
- `/metrics` requires the shared bearer secret. Store the app copy in the existing production environment file and mount the matching secret file into Prometheus.
- The active-slot helper reads `/var/lib/grubadmin/active-prod-backend.color`, validates `blue` or `green`, and atomically writes a Node Exporter textfile metric. It never writes to the blue-green state file.
- Alloy mounts only the specified PM2 output/error files, read-only. Static labels identify service, environment, slot, log type, and host. Persistent Alloy positions prevent rereading already tailed content after restart.
- Loki and Prometheus data, Grafana state, and Alloy positions use named Docker volumes. Prometheus, Loki, Alloy, and Node Exporter have no published ports; Grafana is published only on host loopback.
- Grafana is the only dashboard surface. Use SSH port forwarding; no Nginx or security-group change is required.

## Availability meaning

Prometheus `up` indicates a successful metrics scrape, not a synthetic API readiness check. The configured metrics target is served by the application process. Keep `/api/v1/common/readyz` checks in the existing deployment and external health checks for dependency readiness; this monitoring stack does not change that deployment path.
