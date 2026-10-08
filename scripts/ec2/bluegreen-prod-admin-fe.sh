#!/usr/bin/env bash
# Production Admin FE blue-green (pilot EC2).
# Green = :3000 (grub-admin-frontend / compose grubadmin-fe-prod-green)
# Blue  = :3003 (grub-admin-frontend-blue / compose grubadmin-fe-prod-blue)
# nginx fe_prod upstream switched via /etc/nginx/snippets/grubadmin-fe-prod-upstream.conf
set -euo pipefail

STATE_DIR="/var/lib/grubadmin"
STATE_FILE="${STATE_DIR}/active-prod-admin-fe.color"
PREVIOUS_STATE_FILE="${STATE_DIR}/previous-prod-admin-fe.color"
NGINX_SNIPPET="/etc/nginx/snippets/grubadmin-fe-prod-upstream.conf"
NGINX_SITE="/etc/nginx/sites-available/grubadmin-api"
DEPLOY_PATH="/home/ubuntu/grubadmin-frontend"
COMPOSE_FILE="docker-compose.frontend.yml"

GREEN_COLOR="green"
BLUE_COLOR="blue"
GREEN_PORT="3000"
BLUE_PORT="3003"
GREEN_CONTAINER="grub-admin-frontend"
BLUE_CONTAINER="grub-admin-frontend-blue"
GREEN_PROJECT="grubadmin-fe-prod-green"
BLUE_PROJECT="grubadmin-fe-prod-blue"
# Legacy compose project from Phase C (maps to green :3000)
LEGACY_PROJECT="grubadmin-fe-prod"

usage() {
  cat <<'EOF'
Usage: bluegreen-prod-admin-fe.sh <command> [args]

Commands:
  init                 One-time: nginx snippet + state; map existing :3000 to green
  status               Print active/inactive colors, ports, containers, nginx
  inactive-color|port|project|container
  active-color|port|project|container
  wait-http <port>     Block until HTTP 200 on 127.0.0.1:<port>/ (default 20 attempts)
  cutover <color>      Switch nginx fe_prod to color; requires candidate HTTP OK
  rollback             Switch nginx back to previous color if healthy
  start-warm-standby   Start inactive color container from same image; nginx unchanged
EOF
}

color_to_port() {
  case "$1" in
    green) echo "$GREEN_PORT" ;;
    blue) echo "$BLUE_PORT" ;;
    *) echo "invalid color: $1" >&2; exit 1 ;;
  esac
}

color_to_container() {
  case "$1" in
    green) echo "$GREEN_CONTAINER" ;;
    blue) echo "$BLUE_CONTAINER" ;;
    *) echo "invalid color: $1" >&2; exit 1 ;;
  esac
}

color_to_project() {
  case "$1" in
    green) echo "$GREEN_PROJECT" ;;
    blue) echo "$BLUE_PROJECT" ;;
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
upstream fe_prod {
    server 127.0.0.1:${port} max_fails=3 fail_timeout=30s;
    keepalive 16;
}
EOF
  sudo mv "$tmp" "$NGINX_SNIPPET"
  sudo chown root:root "$NGINX_SNIPPET"
  sudo chmod 644 "$NGINX_SNIPPET"
  sudo nginx -t
  sudo systemctl reload nginx
}

wait_http() {
  local port="$1"
  local max_attempts="${2:-20}"
  local i
  for ((i = 1; i <= max_attempts; i++)); do
    if curl -sf "http://127.0.0.1:${port}/" >/dev/null; then
      echo "HTTP OK on Admin FE port ${port} (attempt ${i})"
      return 0
    fi
    echo "waiting for Admin FE HTTP on port ${port} (attempt ${i}/${max_attempts})..."
    sleep 3
  done
  echo "Admin FE HTTP failed on port ${port} after ${max_attempts} attempts" >&2
  return 1
}

ensure_snippet_included() {
  if ! grep -q 'grubadmin-fe-prod-upstream.conf' "$NGINX_SITE" 2>/dev/null; then
    echo "WARN: ${NGINX_SITE} must include ${NGINX_SNIPPET} (replace inline upstream fe_prod)" >&2
  fi
}

cmd_init() {
  sudo mkdir -p "$STATE_DIR"
  sudo mkdir -p /etc/nginx/snippets
  sudo mkdir -p /home/ubuntu/scripts
  sudo chown ubuntu:ubuntu /home/ubuntu/scripts

  if [[ ! -f "$NGINX_SNIPPET" ]]; then
    write_nginx_upstream "$GREEN_PORT"
  fi

  ensure_snippet_included

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "$GREEN_COLOR" | sudo tee "$STATE_FILE" >/dev/null
  fi

  echo "Admin FE blue-green init complete. Active color: $(read_active_color)"
  echo "Note: existing compose project ${LEGACY_PROJECT} on :${GREEN_PORT} is treated as green."
}

cmd_status() {
  local active inactive
  active="$(read_active_color)"
  inactive="$(read_inactive_color)"
  echo "active_color=${active}"
  echo "active_port=$(color_to_port "$active")"
  echo "active_container=$(color_to_container "$active")"
  echo "active_project=$(color_to_project "$active")"
  echo "inactive_color=${inactive}"
  echo "inactive_port=$(color_to_port "$inactive")"
  echo "inactive_container=$(color_to_container "$inactive")"
  echo "inactive_project=$(color_to_project "$inactive")"
  if [[ -f "$PREVIOUS_STATE_FILE" ]]; then
    echo "previous_color=$(tr -d '[:space:]' < "$PREVIOUS_STATE_FILE")"
  fi
  echo "--- nginx snippet ---"
  sudo cat "$NGINX_SNIPPET" 2>/dev/null || echo "(snippet missing)"
  echo "--- docker ---"
  docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | grep -E 'admin-frontend|NAMES' || true
}

cmd_cutover() {
  local target="${1:-}"
  local port prev
  if [[ "$target" != "$GREEN_COLOR" && "$target" != "$BLUE_COLOR" ]]; then
    echo "cutover requires color: green|blue" >&2
    exit 1
  fi
  port="$(color_to_port "$target")"
  wait_http "$port" 10
  prev="$(read_active_color)"
  if [[ "$prev" == "$target" ]]; then
    echo "Already active on ${target} (port ${port}) — no nginx change"
    return 0
  fi
  echo "$prev" | sudo tee "$PREVIOUS_STATE_FILE" >/dev/null
  write_nginx_upstream "$port"
  echo "$target" | sudo tee "$STATE_FILE" >/dev/null
  echo "Cutover complete: fe_prod -> ${target} (127.0.0.1:${port})"
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
  wait_http "$port" 5
  write_nginx_upstream "$port"
  echo "$prev" | sudo tee "$STATE_FILE" >/dev/null
  echo "Rollback complete: fe_prod -> ${prev} (127.0.0.1:${port})"
}

cmd_start_warm_standby() {
  local inactive port container project image
  inactive="$(read_inactive_color)"
  port="$(color_to_port "$inactive")"
  container="$(color_to_container "$inactive")"
  project="$(color_to_project "$inactive")"

  if docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo "Warm standby ${container} already running"
    wait_http "$port" 5
    return 0
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx "$GREEN_CONTAINER"; then
    echo "Active green container ${GREEN_CONTAINER} not found — cannot clone image" >&2
    exit 1
  fi

  image="$(docker inspect -f '{{.Config.Image}}' "$GREEN_CONTAINER")"
  echo "Starting Admin FE warm standby ${inactive} on :${port} from image ${image}"

  # Prefer compose if deploy path present; else docker run clone
  if [[ -f "${DEPLOY_PATH}/${COMPOSE_FILE}" ]]; then
    cd "$DEPLOY_PATH"
    FE_CONTAINER_NAME="$container" FE_HOST_PORT="$port" \
      docker compose -p "$project" -f "$COMPOSE_FILE" up -d --no-build 2>/dev/null \
      || FE_CONTAINER_NAME="$container" FE_HOST_PORT="$port" \
           docker compose -p "$project" -f "$COMPOSE_FILE" up -d
  else
    docker rm -f "$container" 2>/dev/null || true
    docker run -d --name "$container" --restart unless-stopped \
      -p "127.0.0.1:${port}:3000" \
      -e HOSTNAME=0.0.0.0 \
      "$image"
  fi

  wait_http "$port" 20
  echo "Warm standby ready on :${port}; nginx still on $(read_active_color)=:$(color_to_port "$(read_active_color)")"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    init) cmd_init ;;
    status) cmd_status ;;
    inactive-color) read_inactive_color ;;
    inactive-port) color_to_port "$(read_inactive_color)" ;;
    inactive-project) color_to_project "$(read_inactive_color)" ;;
    inactive-container) color_to_container "$(read_inactive_color)" ;;
    active-color) read_active_color ;;
    active-port) color_to_port "$(read_active_color)" ;;
    active-project) color_to_project "$(read_active_color)" ;;
    active-container) color_to_container "$(read_active_color)" ;;
    wait-http) wait_http "${1:?port required}" "${2:-20}" ;;
    cutover) cmd_cutover "${1:?color required}" ;;
    rollback) cmd_rollback ;;
    start-warm-standby) cmd_start_warm_standby ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown command: ${cmd}" >&2; usage; exit 1 ;;
  esac
}

main "$@"
