#!/usr/bin/env bash
# Production backend blue-green cutover (pilot EC2).
# Green = :8000 (grub_prod_green), Blue = :8003 (grub_prod_blue).
# nginx api_prod upstream is switched via /etc/nginx/snippets/grubadmin-api-prod-upstream.conf
set -euo pipefail

STATE_DIR="/var/lib/grubadmin"
STATE_FILE="${STATE_DIR}/active-prod-backend.color"
PREVIOUS_STATE_FILE="${STATE_DIR}/previous-prod-backend.color"
NGINX_SNIPPET="/etc/nginx/snippets/grubadmin-api-prod-upstream.conf"
DEPLOY_PATH="/home/ubuntu/grubadmin-backend/GrubAdmin-Backend"
BUN_BIN="/home/ubuntu/.bun/bin/bun"
PATH_EXPORT="/home/ubuntu/.local/share/fnm/node-versions/v22.23.2/installation/bin:/home/ubuntu/.bun/bin"

GREEN_COLOR="green"
BLUE_COLOR="blue"
GREEN_PORT="8000"
BLUE_PORT="8003"
GREEN_PM2="grub_prod_green"
BLUE_PM2="grub_prod_blue"

export PATH="${PATH_EXPORT}:$PATH"

usage() {
  cat <<'EOF'
Usage: bluegreen-prod-backend.sh <command> [args]

Commands:
  init                 One-time bootstrap (nginx snippet, state file, rename grub_prod -> grub_prod_green)
  status               Print active/inactive colors, ports, PM2, nginx upstream
  inactive-color       Print inactive color (for deploy)
  inactive-port        Print inactive port
  inactive-pm2         Print inactive PM2 process name
  active-pm2           Print active PM2 process name (before cutover)
  active-port          Print active port
  wait-readyz <port>   Block until readyz succeeds on port (optional 2nd arg: max attempts, default 10)
  cutover <color>      Switch nginx api_prod to color (green|blue); requires candidate readyz
  rollback             Switch nginx back to previous color if that slot is healthy
EOF
}

color_to_port() {
  case "$1" in
    green) echo "$GREEN_PORT" ;;
    blue) echo "$BLUE_PORT" ;;
    *) echo "invalid color: $1" >&2; exit 1 ;;
  esac
}

color_to_pm2() {
  case "$1" in
    green) echo "$GREEN_PM2" ;;
    blue) echo "$BLUE_PM2" ;;
    *) echo "invalid color: $1" >&2; exit 1 ;;
  esac
}

read_active_color() {
  if [[ -f "$STATE_FILE" ]]; then
    tr -d '[:space:]' < "$STATE_FILE"
  else
    echo "$GREEN_COLOR"
  fi
}

read_inactive_color() {
  local active
  active="$(read_active_color)"
  if [[ "$active" == "$GREEN_COLOR" ]]; then
    echo "$BLUE_COLOR"
  else
    echo "$GREEN_COLOR"
  fi
}

write_nginx_upstream() {
  local port="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
upstream api_prod {
    server 127.0.0.1:${port} max_fails=3 fail_timeout=30s;
    keepalive 32;
}
EOF
  sudo mv "$tmp" "$NGINX_SNIPPET"
  sudo chown root:root "$NGINX_SNIPPET"
  sudo chmod 644 "$NGINX_SNIPPET"
  sudo nginx -t
  sudo systemctl reload nginx
}

wait_readyz() {
  local port="$1"
  local max_attempts="${2:-10}"
  local i
  for ((i = 1; i <= max_attempts; i++)); do
    if curl -sf "http://127.0.0.1:${port}/api/v1/common/readyz" >/dev/null; then
      echo "readyz OK on port ${port} (attempt ${i})"
      return 0
    fi
    echo "waiting for readyz on port ${port} (attempt ${i}/${max_attempts})..."
    sleep 3
  done
  echo "readyz failed on port ${port} after ${max_attempts} attempts" >&2
  return 1
}

cmd_init() {
  sudo mkdir -p "$STATE_DIR"
  sudo mkdir -p /etc/nginx/snippets
  sudo mkdir -p /home/ubuntu/scripts
  sudo chown ubuntu:ubuntu /home/ubuntu/scripts

  if [[ ! -f "$NGINX_SNIPPET" ]]; then
    write_nginx_upstream "$GREEN_PORT"
  fi

  if ! grep -q 'grubadmin-api-prod-upstream.conf' /etc/nginx/sites-available/grubadmin-api 2>/dev/null; then
    echo "WARN: grubadmin-api must include ${NGINX_SNIPPET} — run EC2 nginx patch or include manually" >&2
  fi

  if pm2 describe "$GREEN_PM2" >/dev/null 2>&1; then
    echo "PM2 ${GREEN_PM2} already exists — init skipped PM2 rename"
  elif pm2 describe grub_prod >/dev/null 2>&1; then
    echo "Renaming PM2 grub_prod -> ${GREEN_PM2}"
    pm2 restart grub_prod --name "$GREEN_PM2" --update-env
    pm2 save
  elif pm2 describe "$BLUE_PM2" >/dev/null 2>&1; then
    echo "Only ${BLUE_PM2} found — setting active color to blue"
    echo "$BLUE_COLOR" | sudo tee "$STATE_FILE" >/dev/null
    write_nginx_upstream "$BLUE_PORT"
  else
    echo "No production PM2 process found (grub_prod / ${GREEN_PM2}) — start green slot manually" >&2
  fi

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "$GREEN_COLOR" | sudo tee "$STATE_FILE" >/dev/null
  fi

  echo "Blue-green init complete. Active color: $(read_active_color)"
}

cmd_status() {
  local active inactive
  active="$(read_active_color)"
  inactive="$(read_inactive_color)"
  echo "active_color=${active}"
  echo "active_port=$(color_to_port "$active")"
  echo "active_pm2=$(color_to_pm2 "$active")"
  echo "inactive_color=${inactive}"
  echo "inactive_port=$(color_to_port "$inactive")"
  echo "inactive_pm2=$(color_to_pm2 "$inactive")"
  if [[ -f "$PREVIOUS_STATE_FILE" ]]; then
    echo "previous_color=$(tr -d '[:space:]' < "$PREVIOUS_STATE_FILE")"
  fi
  echo "--- nginx snippet ---"
  sudo cat "$NGINX_SNIPPET" 2>/dev/null || echo "(snippet missing)"
  echo "--- pm2 ---"
  pm2 list | grep -E 'grub_prod|name' || true
}

cmd_cutover() {
  local target="${1:-}"
  local port prev
  if [[ "$target" != "$GREEN_COLOR" && "$target" != "$BLUE_COLOR" ]]; then
    echo "cutover requires color: green|blue" >&2
    exit 1
  fi
  port="$(color_to_port "$target")"
  wait_readyz "$port" 10
  prev="$(read_active_color)"
  if [[ "$prev" == "$target" ]]; then
    echo "Already active on ${target} (port ${port}) — no nginx change"
    return 0
  fi
  echo "$prev" | sudo tee "$PREVIOUS_STATE_FILE" >/dev/null
  write_nginx_upstream "$port"
  echo "$target" | sudo tee "$STATE_FILE" >/dev/null
  echo "Cutover complete: api_prod -> ${target} (127.0.0.1:${port})"
  curl -sf "http://127.0.0.1:${port}/api/v1/common/readyz" | head -c 200 || true
  echo
}

cmd_rollback() {
  local prev active port
  if [[ ! -f "$PREVIOUS_STATE_FILE" ]]; then
    echo "No previous color recorded — manual rollback: cutover green|blue" >&2
    exit 1
  fi
  prev="$(tr -d '[:space:]' < "$PREVIOUS_STATE_FILE")"
  active="$(read_active_color)"
  if [[ "$prev" == "$active" ]]; then
    echo "Previous color matches active (${active}) — nothing to rollback" >&2
    exit 1
  fi
  port="$(color_to_port "$prev")"
  if ! pm2 describe "$(color_to_pm2 "$prev")" >/dev/null 2>&1; then
    echo "Previous slot PM2 $(color_to_pm2 "$prev") is not running — start it before rollback" >&2
    exit 1
  fi
  wait_readyz "$port" 5
  write_nginx_upstream "$port"
  echo "$prev" | sudo tee "$STATE_FILE" >/dev/null
  echo "Rollback complete: api_prod -> ${prev} (127.0.0.1:${port})"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    init) cmd_init ;;
    status) cmd_status ;;
    inactive-color) read_inactive_color ;;
    inactive-port) color_to_port "$(read_inactive_color)" ;;
    inactive-pm2) color_to_pm2 "$(read_inactive_color)" ;;
    active-pm2) color_to_pm2 "$(read_active_color)" ;;
    active-port) color_to_port "$(read_active_color)" ;;
    wait-readyz) wait_readyz "${1:?port required}" "${2:-10}" ;;
    cutover) cmd_cutover "${1:?color required}" ;;
    rollback) cmd_rollback ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown command: ${cmd}" >&2; usage; exit 1 ;;
  esac
}

main "$@"
